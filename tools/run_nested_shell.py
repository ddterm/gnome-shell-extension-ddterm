#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-2.0-or-later

"""
Launch a nested GNOME Shell instance in an isolated environment, and install
the extension into it.

Launches GNOME Shell with separate
`XDG_{CONFIG,CACHE,RUNTIME,STATE,DATA}_{HOME,DIR}` directories and a session
bus, thus effectively creating an isolated environment for debug/testing.

Extension package, specified by `--bundle` argument, will be automatically
installed into that environment, and enabled.

For Wayland nested shell, virtual monitor resolution can be configured using
MUTTER_DEBUG_DUMMY_MODE_SPECS environment variable.

Also see:
https://gitlab.gnome.org/GNOME/mutter/-/blob/b218fc5b7f573894b65679182b8bde5b7b3174d2/src/backends/meta-monitor-manager-dummy.c#L390-420
"""

import argparse
import contextlib
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import zipfile


def make_env(base_dir):
    base_dir = pathlib.Path(base_dir)

    local_dir = base_dir / '.local'
    local_dir.mkdir(mode=0o700)

    dirs = dict(
        XDG_CONFIG_HOME=base_dir / '.config',
        XDG_CACHE_HOME=base_dir / '.cache',
        XDG_RUNTIME_DIR=base_dir / '.cache',
        XDG_STATE_HOME=local_dir / 'state',
        XDG_DATA_HOME=local_dir / 'state',
    )

    for d in set(dirs.values()):
        d.mkdir(mode=0o700)

    env = os.environ.copy()

    for k, v in dirs.items():
        env[k] = str(v)

    # https://gitlab.gnome.org/GNOME/gjs/-/blob/50723b9876820e9a889e1254635687a6b832551b/modules/script/package.js#L52-55
    # Auxiliary GNOME Shell services - like org.gnome.Shell.Extensions,
    # org.gnome.Shell.Notifications, org.gnome.Shell.Screencast try to load
    # sources from Meson dirs if these variables are set
    env.pop('MESON_SOURCE_ROOT', None)
    env.pop('MESON_BUILD_ROOT', None)

    env['NO_AT_BRIDGE'] = '1'

    return env


def terminate_process(popen):
    popen.terminate()

    try:
        popen.wait(timeout=10)
    except subprocess.TimeoutExpired:
        popen.kill()
        raise


@contextlib.contextmanager
def run_dbus_daemon(executable, env):
    address_r, address_w = os.pipe()

    args = (
        executable,
        '--session',
        '--nopidfile',
        '--nosyslog',
        '--nofork',
        f'--address=unix:dir={env['XDG_RUNTIME_DIR']}',
        f'--print-address={address_w}',
    )

    with contextlib.ExitStack() as stack:
        with open(address_r, 'rb', buffering=0, closefd=True) as address_reader:
            try:
                popen = subprocess.Popen(args, pass_fds=(address_w,), env=env)
                stack.enter_context(popen)
            finally:
                os.close(address_w)

            stack.callback(terminate_process, popen)

            address = address_reader.read().rstrip().decode()

        yield address


@contextlib.contextmanager
def run_xserver(executable, env, extra_args=tuple()):
    display_r, display_w = os.pipe()
    args = (executable, '-nolisten', 'tcp', '-noreset', '-displayfd', str(display_w), *extra_args)

    with contextlib.ExitStack() as stack:
        with open(display_r, 'rb', buffering=0, closefd=True) as display_reader:
            try:
                popen = subprocess.Popen(args, pass_fds=(display_w,), env=env)
                stack.enter_context(popen)
            finally:
                os.close(display_w)

            stack.callback(terminate_process, popen)

            display = display_reader.read().rstrip().decode()

        yield display


def run_shell(
    *,
    bundle,
    gnome_shell,
    gnome_extensions,
    dbus_daemon,
    shell_args,
    env,
    client_extra_env=None,
    shell_extra_env=None,
):
    client_env = env.copy()
    shell_env = env.copy()

    if client_extra_env:
        client_env.update(client_extra_env)

    if shell_extra_env:
        shell_env.update(shell_extra_env)

    with zipfile.ZipFile(bundle) as unpack:
        metadata = json.loads(unpack.read('metadata.json'))

    with run_dbus_daemon(dbus_daemon, client_env) as dbus_address:
        client_env['DBUS_SESSION_BUS_ADDRESS'] = dbus_address
        shell_env['DBUS_SESSION_BUS_ADDRESS'] = dbus_address

        subprocess.run(
            (gnome_extensions, 'install', str(bundle)),
            env=client_env,
            check=True,
        )

        subprocess.run(
            (gnome_extensions, 'enable', metadata['uuid']),
            env=client_env,
            check=True,
        )

        subprocess.run((gnome_shell, *shell_args), env=shell_env, check=True)


def run_shell_devkit(*, env, **kwargs):
    env = env.copy()
    shell_extra_env = dict()

    wayland_socket = pathlib.Path(env.pop('WAYLAND_DISPLAY', 'wayland-0'))

    if not wayland_socket.is_absolute():
        wayland_socket = pathlib.Path(os.environ['XDG_RUNTIME_DIR']) / wayland_socket

    shell_extra_env['WAYLAND_DISPLAY'] = str(wayland_socket)

    for pipewire_runtime_dir_var in ('PIPEWIRE_RUNTIME_DIR', 'XDG_RUNTIME_DIR', 'USERPROFILE'):
        if pipewire_runtime_dir := os.environ.get(pipewire_runtime_dir_var):
            shell_extra_env['PIPEWIRE_RUNTIME_DIR'] = pipewire_runtime_dir
            break

    run_shell(
        client_extra_env=dict(WAYLAND_DISPLAY='wayland-test'),
        shell_extra_env=shell_extra_env,
        shell_args=('--devkit', '--wayland-display=wayland-test'),
        env=env,
        **kwargs,
    )


def run_shell_wayland_nested(*, env, **kwargs):
    env = env.copy()
    shell_extra_env = dict()

    if x_display := env.pop('DISPLAY', None):
        shell_extra_env['DISPLAY'] = x_display

    run_shell(
        client_extra_env=dict(WAYLAND_DISPLAY='wayland-test'),
        shell_extra_env=shell_extra_env,
        shell_args=('--nested', '--wayland-display=wayland-test'),
        env=env,
        **kwargs,
    )


def run_shell_xephyr(*, env, xephyr, **kwargs):
    with run_xserver(xephyr, env) as display:
        env = dict(env, DISPLAY=f':{display}')
        env.pop('WAYLAND_DISPLAY', None)

        run_shell(shell_args=('--x11',), env=env, **kwargs)


def run_with_basedir(*, run, base_dir, **kwargs):
    if base_dir is None:
        with tempfile.TemporaryDirectory() as tempdir:
            run(env=make_env(tempdir), **kwargs)

    else:
        run(env=make_env(base_dir), **kwargs)


def main():
    description, epilog = __doc__.split('\n\n', 1)

    parser = argparse.ArgumentParser(
        description=description,
        epilog=epilog,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    parser.add_argument(
        '--base-dir',
        type=pathlib.Path,
        help='Base directory for XDG_* dirs (fake HOME)',
    )

    common_args = argparse.ArgumentParser(add_help=False)

    default_pack = os.getenv('EXTENSION_BUNDLE', None)

    if default_pack:
        default_pack = pathlib.Path(default_pack)
    else:
        default_pack = next(pathlib.Path.cwd().glob('**/*.shell-extension.zip'), None)

    common_args.add_argument(
        '--bundle',
        type=pathlib.Path,
        help='Extension bundle to install',
        default=default_pack,
        required=not default_pack,
    )

    default_gnome_shell = shutil.which('gnome-shell')

    common_args.add_argument(
        '--gnome-shell',
        help='gnome-shell executable to use',
        default=default_gnome_shell,
        required=not default_gnome_shell,
    )

    default_gnome_extensions = shutil.which('gnome-extensions')

    common_args.add_argument(
        '--gnome-extensions',
        help='gnome-extensions executable to use',
        default=default_gnome_extensions,
        required=not default_gnome_extensions,
    )

    default_dbus_daemon = shutil.which('dbus-daemon')

    common_args.add_argument(
        '--dbus-daemon',
        help='dbus-daemon executable to use',
        default=default_dbus_daemon,
        required=not default_dbus_daemon,
    )

    subparsers = parser.add_subparsers(required=True)

    wayland_devkit = subparsers.add_parser(
        'wayland-devkit',
        parents=(common_args,),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description='Run as a nested Wayland compositor, GNOME Shell 49 and later',
    )

    wayland_devkit.set_defaults(run=run_shell_devkit)

    wayland_nested = subparsers.add_parser(
        'wayland-nested',
        parents=(common_args,),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description='Run as a nested Wayland compositor, GNOME Shell 48 and earlier',
    )

    wayland_nested.set_defaults(run=run_shell_wayland_nested)

    xephyr = subparsers.add_parser(
        'xephyr',
        parents=(common_args,),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description='Run X11 window manager/compositor under Xephyr',
    )

    xephyr.set_defaults(run=run_shell_xephyr)

    default_xephyr = shutil.which('Xephyr')

    xephyr.add_argument(
        '--xephyr',
        help='Xephyr executable to use',
        default=default_xephyr,
        required=not default_xephyr,
    )

    run_with_basedir(**vars(parser.parse_args()))


if __name__ == '__main__':
    main()
