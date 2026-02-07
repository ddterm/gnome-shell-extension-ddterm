# SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import collections
import contextlib
import fcntl
import inspect
import logging
import os
import pathlib
import subprocess

import pytest

from . import procutil


pytest_plugins = (
    'tests.screenshot',
    'tests.syslog',
    'tests.logsync',
    'tests.gtest_output_compat',
    'tests.github_annotations',
)

LOGGER = logging.getLogger(__name__)

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
SRC_DIR = THIS_DIR.parent
COMPOSE_FILE = THIS_DIR / 'compose.yaml'

IMAGES_STASH_KEY = pytest.StashKey[list]()

ENV_FILTER_OUT = [
    'DBUS_SESSION_BUS_ADDRESS',
    'DBUS_SESSION_BUS_PID',
    'DBUS_SESSION_BUS_WINDOWID',
    'DBUS_STARTER_BUS_TYPE',
    'DBUS_STARTER_ADDRESS',

    'XDG_RUNTIME_DIR',
    'XDG_CONFIG_HOME',
    'XDG_CACHE_HOME',
    'XDG_STATE_HOME',

    'XAUTHORITY',
    'DISPLAY',
    'WAYLAND_DISPLAY',

    'MANAGERPID',
    'SYSTEMD_EXEC_PID',
    'JOURNAL_STREAM',

    'XDG_SESSION_TYPE',
    'XDG_SESSION_CLASS',
    'XDG_SESSION_DESKTOP',

    'SESSION_MANAGER',
    'DESKTOP_SESSION',

    'GNOME_SETUP_DISPLAY',
    'GDMSESSION',
    'GDM_LANG',

    'GJS_DEBUG_OUTPUT',
    'GJS_DEBUG_TOPICS',

    'GDK_BACKEND',
]


def pytest_addoption(parser):
    parser.addoption(
        '--container',
        action='append',
        default=[],
        help='run tests using the specified container image. '
             'Can be repeated multiple times to run tests with multiple images.'
    )

    parser.addoption(
        '--journald',
        action='store_true',
        default=False,
        help='Redirect GNOME Shell output to journald (only in containers).'
    )

    parser.addoption(
        '--hw-accel',
        action='store_true',
        default=False,
        help='Allow hardware acceleration.'
    )

    parser.addoption(
        '--system-bus',
        action='store_true',
        default=False,
        help='Use a fake system D-Bus bus (when running without containers).'
    )

    bundle_from_env = os.getenv('EXTENSION_BUNDLE')

    parser.addoption(
        '--bundle',
        default=pathlib.Path(bundle_from_env) if bundle_from_env else None,
        required=False,
        type=pathlib.Path,
        help='ddterm extension bundle to test (ddterm@amezin.github.com.shell-extension.zip). '
             'Will test the currently installed extension if not specified. '
             'Must always be specified for containers.',
    )

    parser.addoption(
        '--sys-package',
        default=None,
        required=False,
        type=pathlib.Path,
        help='OS-specific package to install instead of --bundle',
    )

    parser.addoption(
        '--gnome-extensions-tool',
        default='gnome-extensions',
        help='gnome-extensions executable',
    )

    parser.addoption(
        '--dbus-daemon',
        default='dbus-daemon',
        help='dbus-daemon executable',
    )

    parser.addoption(
        '--xvfb',
        default='Xvfb',
        help='Xvfb executable',
    )

    parser.addoption(
        '--gsettings-tool',
        default='gsettings',
        help='gsettings executable',
    )

    parser.addoption(
        '--gnome-shell',
        default='gnome-shell',
        help='gnome-shell executable',
    )

    parser.addoption(
        '--gjs',
        default='gjs',
        help='gjs executable',
    )

    parser.addoption(
        '--wl-copy',
        default='wl-copy',
        help='wl-copy executable (wl-clipboard)',
    )

    parser.addoption(
        '--wl-paste',
        default='wl-paste',
        help='wl-paste executable (wl-clipboard)',
    )


def pytest_configure(config):
    if images := config.option.container:
        if not config.option.bundle and not config.option.sys_package:
            raise pytest.UsageError('--bundle or --sys-package is required for container')

        if config.option.bundle and config.option.sys_package:
            raise pytest.UsageError('Only one of --bundle or --sys-package should be specified')

        with open(COMPOSE_FILE) as f:
            import yaml

            compose = yaml.safe_load(f)

        aliases = dict()
        by_profile = collections.defaultdict(set)

        for service_name, service_config in compose['services'].items():
            image = service_config['image']
            aliases[service_name] = image

            for profile in service_config.get('profiles', []):
                by_profile[profile].add(image)

        resolved = set()

        for image in images:
            profile = by_profile.get(image, None)
            alias = aliases.get(image, None)

            if not profile and not alias:
                resolved.add(image)
                continue

            if profile:
                resolved.update(profile)

            if alias:
                resolved.add(alias)

        config.stash[IMAGES_STASH_KEY] = resolved

    elif config.option.journald:
        raise pytest.UsageError('--journald can be used with containers only')

    elif config.option.sys_package:
        raise pytest.UsageError('--sys-package  can be used with containers only')


class FdLock:
    def __init__(self, fd):
        self.fd = fd
        self.count = 0

    def __enter__(self):
        if self.count == 0:
            fcntl.flock(self.fd, fcntl.LOCK_EX)

        self.count += 1

        return self

    def __exit__(self, *_):
        self.count -= 1

        if self.count == 0:
            fcntl.flock(self.fd, fcntl.LOCK_UN)


@pytest.fixture(scope='session')
def container_lock(request):
    lock_path = request.config.cache.mkdir('containers') / 'lock'
    fd = os.open(lock_path, os.O_RDWR | os.O_TRUNC | os.O_CREAT, 0o644)

    try:
        yield FdLock(fd)

    finally:
        os.close(fd)


@pytest.fixture(scope='session')
def container(tmp_path_factory, request):
    if hasattr(request, 'param'):
        image = request.param

    elif images := request.config.stash.get(IMAGES_STASH_KEY, None):
        (image,) = images

    else:
        yield None
        return

    syslog_server = request.getfixturevalue('syslog_server')

    create_cmd = [
        'podman',
        '--runtime=crun',
        'container',
        'create',
        '--log-driver=none',
        '--tty',
        '--cap-add=SYS_ADMIN,SYS_NICE,SYS_PTRACE,SETPCAP,NET_RAW,NET_BIND_SERVICE,IPC_LOCK',
        '--security-opt=label=disable',
        '--userns=keep-id',
        '--user=0',
        '--cgroupns=private',
        '--pids-limit=-1',
        f'--volume={SRC_DIR}:{SRC_DIR}:ro',
        f'--volume={os.getcwd()}:{os.getcwd()}:ro',
        f'--volume={tmp_path_factory.getbasetemp()}:{tmp_path_factory.getbasetemp()}',
        f'--volume={syslog_server.server_address}:/run/systemd/journal/syslog',
        f'--workdir={tmp_path_factory.mktemp('home')}',
    ]

    if bundle := request.config.option.bundle:
        bundle = pathlib.Path(bundle).resolve()
        create_cmd.append(f'--volume={bundle}:{bundle}:ro')

    if sys_package := request.config.option.sys_package:
        sys_package = pathlib.Path(sys_package).resolve()
        create_cmd.append(f'--volume={sys_package}:{sys_package}:ro')

    if request.config.option.hw_accel:
        create_cmd.append('--device=/dev/dri/:/dev/dri/:rwm')
        create_cmd.append('--group-add=keep-groups')

    create_cmd.extend([
        image,
        '/sbin/init',
        'systemd.journald.forward_to_syslog=1',
        'systemd.journald.forward_to_console=0',
    ])

    launcher = procutil.Launcher()

    with contextlib.ExitStack() as stack:
        container_lock = request.getfixturevalue('container_lock')

        with container_lock:
            cid = launcher.run(
                *create_cmd,
                timeout=None,
                stdout=subprocess.PIPE,
            ).stdout.decode().rstrip()

            LOGGER.info('Created container %r', cid)

            console_stack = stack.enter_context(contextlib.ExitStack())

            def shutdown():
                with container_lock:
                    launcher.run(
                        'podman',
                        'container',
                        'rm',
                        '--force',
                        '--volumes',
                        f'--time={procutil.DEFAULT_SHUTDOWN_TIMEOUT}',
                        cid,
                        timeout=procutil.DEFAULT_SHUTDOWN_TIMEOUT * 2,
                    )

            stack.callback(shutdown)

            console_stack.enter_context(launcher.spawn(
                'podman',
                '--runtime=crun',
                'container',
                'start',
                '--attach',
                '--sig-proxy=false',
                cid,
            ))

            exit_code = '0'
            attempts = 0

            while attempts < 2 and exit_code == '0':
                exit_code = launcher.run(
                    'podman',
                    '--runtime=crun',
                    'container',
                    'wait',
                    '--condition=running',
                    # interrupt wait if container fails
                    '--condition=exited',
                    '--condition=stopped',
                    cid,
                    stdout=subprocess.PIPE
                ).stdout.decode().strip()

                attempts += 1

            assert exit_code == '-1'

            container_launcher = procutil.ContainerExecLauncher(container_id=cid, user=0)

            container_launcher.run(
                'busctl',
                '--watch-bind=1',
                f'--timeout={procutil.DEFAULT_TIMEOUT // 2}',
                'status',
                timeout=procutil.DEFAULT_TIMEOUT,
            )

            container_launcher.run(
                'gdbus',
                'wait',
                '--system',
                f'--timeout={procutil.DEFAULT_TIMEOUT // 2}',
                'org.freedesktop.login1',
                timeout=procutil.DEFAULT_TIMEOUT,
            )

        yield cid


@pytest.fixture(scope='session')
def process_launcher(container):
    if container is None:
        return procutil.Launcher()

    return procutil.ContainerExecLauncher(
        container_id=container,
        user=os.getuid(),
    )


@pytest.fixture(scope='session')
def global_environment(container, request):
    env = {} if container is not None else {
        k: v
        for k, v in os.environ.items()
        if k not in ENV_FILTER_OUT
    }

    if not request.config.option.hw_accel:
        env['LIBGL_ALWAYS_SOFTWARE'] = 'true'
        env['GBM_ALWAYS_SOFTWARE'] = 'true'
        env['VK_LOADER_DRIVERS_SELECT'] = 'lvp_*'

    env['NO_AT_BRIDGE'] = '1'
    env['GTK_A11Y'] = 'none'

    return env


@pytest.fixture(scope='session')
def os_id(process_launcher):
    return process_launcher.run(
        'sh',
        '-c',
        '. /etc/os-release && echo $ID',
        stdout=subprocess.PIPE
    ).stdout.rstrip().decode()


@pytest.fixture(scope='session')
def sys_package(container, os_id, request):
    sys_package = request.config.option.sys_package

    if not sys_package:
        return sys_package

    process_launcher = procutil.ContainerExecLauncher(container_id=container, user=0)

    if os_id == 'arch':
        process_launcher.run('pacman', '-U', '--noconfirm', str(sys_package))

    else:
        raise Exception(f"Don't know how to install packages on {os_id}")

    return sys_package


@pytest.fixture(scope='session')
def system_bus(process_launcher, global_environment, tmp_path_factory, request):
    system_bus_dir = tmp_path_factory.mktemp('system_bus')
    services_dir = system_bus_dir / 'system-services'
    config_path = system_bus_dir / 'system.conf'

    config_path.write_text(f'''
        <!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
             "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
        <busconfig>
            <type>system</type>
            <keep_umask/>
            <listen>unix:dir={system_bus_dir}</listen>
            <servicedir>{services_dir}</servicedir>
            <policy context="default">
                <allow send_destination="*" eavesdrop="true"/>
                <allow eavesdrop="true"/>
                <allow own="*"/>
            </policy>
        </busconfig>
    ''')

    services_dir.mkdir()

    with contextlib.ExitStack() as stack:
        address_r, address_w = os.pipe()

        with open(address_r, 'rb', buffering=0, closefd=True) as address_reader:
            try:
                proc = stack.enter_context(process_launcher.spawn(
                    str(request.config.option.dbus_daemon),
                    f'--config-file={config_path}',
                    '--nosyslog',
                    '--nofork',
                    f'--print-address={address_w}',
                    pass_fds=(address_w,),
                    env=global_environment,
                ))

                stack.callback(procutil.shutdown_retry, proc)

            finally:
                os.close(address_w)

            # read to end doesn't work when passing fd through podman
            # podman keeps the fd open even when the target process closes it
            proc.address = address_reader.readline().rstrip().decode()

        yield proc


@pytest.fixture(scope='session')
def system_bus_environment(global_environment, request):
    if not request.config.option.system_bus:
        return global_environment

    dbus_daemon = request.getfixturevalue('system_bus')

    return dict(
        global_environment,
        DBUS_SYSTEM_BUS_ADDRESS=dbus_daemon.address,
    )


def pytest_generate_tests(metafunc):
    if 'container' in metafunc.fixturenames:
        images = metafunc.config.stash.get(IMAGES_STASH_KEY, None)

        if images and len(images) > 1:
            metafunc.parametrize('container', images, indirect=True, scope='session')


def pytest_pycollect_makeitem(collector, name, obj):
    if not inspect.isclass(obj):
        return None

    if not collector.istestclass(obj, name):
        return None

    if not hasattr(obj, 'pytest_pycollect_makeitem'):
        return None

    return obj().pytest_pycollect_makeitem(collector=collector, name=name, obj=obj)
