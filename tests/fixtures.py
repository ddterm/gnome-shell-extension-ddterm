# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import contextlib
import logging
import os
import pathlib
import sys
import warnings

import pytest

from gi.repository import GLib, Gio

from . import (
    apphook,
    dbusutil,
    displayconfig,
    extensiondbus,
    extensionhook,
    glibutil,
    logparser,
    procutil,
    settingshook,
    shelldbus,
    shellextdbus,
    shellhook,
)


LOGGER = logging.getLogger(__name__)

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent

IGNORED_LOG_ISSUES = [
    # https://gitlab.gnome.org/GNOME/gjs/-/issues/610
    'Gio.UnixInputStream has been moved to a separate platform-specific library.',
]

IGNORED_LOG_ISSUES_BY_OS = {
    'opensuse-tumbleweed': [
        *IGNORED_LOG_ISSUES,
        # openSUSE Tumbleweed has separate package for GLibUnix typelib,
        # and it's not a dependency of gnome-shell
        "Requiring GLibUnix, version 2.0: "
        "Typelib file for namespace 'GLibUnix', version '2.0' not found",
        "GLib.unix_set_fd_nonblocking has been moved to a separate platform-specific library.",
        "GLib.unix_signal_add has been moved to a separate platform-specific library.",
    ]
}

MAX_GNOME_VERSION = 99


def mkdir(path):
    path.mkdir(mode=0o700)
    return path


class GnomeSessionFixtures:
    @pytest.fixture(scope='class')
    def home_dir(self, tmp_path_factory):
        return tmp_path_factory.mktemp(self.__class__.__name__)

    @pytest.fixture(scope='class')
    def xdg_config_home(self, home_dir):
        return mkdir(home_dir / '.config')

    @pytest.fixture(scope='class')
    def xdg_cache_home(self, home_dir):
        return mkdir(home_dir / '.cache')

    @pytest.fixture(scope='class')
    def xdg_runtime_dir(self, xdg_cache_home):
        return xdg_cache_home

    @pytest.fixture(scope='class')
    def local_dir(self, home_dir):
        return mkdir(home_dir / '.local')

    @pytest.fixture(scope='class')
    def xdg_state_home(self, local_dir):
        return mkdir(local_dir / 'state')

    @pytest.fixture(scope='class')
    def xdg_data_home(self, local_dir):
        return mkdir(local_dir / 'share')

    @pytest.fixture(scope='class')
    def gnome_data_dir(self, xdg_data_home):
        return mkdir(xdg_data_home / 'gnome-shell')

    @pytest.fixture(scope='class')
    def base_environment(
        self,
        system_bus_environment,
        xdg_runtime_dir,
        xdg_config_home,
        xdg_cache_home,
        xdg_state_home,
    ):
        env = dict(
            system_bus_environment,
            XDG_RUNTIME_DIR=str(xdg_runtime_dir),
            XDG_CONFIG_HOME=str(xdg_config_home),
            XDG_CACHE_HOME=str(xdg_cache_home),
            XDG_STATE_HOME=str(xdg_state_home),
        )

        return env

    @pytest.fixture(scope='class')
    def data_environment(
        self,
        base_environment,
        xdg_data_home,
        gnome_data_dir,
        process_launcher,
        request,
    ):
        env = {
            **base_environment,
            'XDG_DATA_HOME': str(xdg_data_home),
        }

        process_launcher.run(
            str(request.config.option.gnome_extensions_tool),
            'install',
            str(request.config.option.package),
            env=env,
        )

        (gnome_data_dir / 'lock-warning-shown').touch()

        for v in range(40, MAX_GNOME_VERSION + 1):
            (gnome_data_dir / f'update-check-{v}').touch()

        (gnome_data_dir / 'extension-updates').mkdir(mode=0o555)

        return env

    @pytest.fixture(scope='class')
    def environment(self, request, base_environment):
        if request.config.option.package:
            return request.getfixturevalue('data_environment')
        else:
            return base_environment

    @pytest.fixture(scope='class')
    def dbus_services_dir(self, xdg_runtime_dir):
        return mkdir(mkdir(xdg_runtime_dir / 'dbus-1') / 'services')

    @pytest.fixture(scope='class')
    def dbus_daemon(
        self,
        container,
        process_launcher,
        dbus_daemon_environment,
        request,
    ):
        LOGGER.info('D-Bus daemon environment: %r', dbus_daemon_environment)

        assert 'XDG_RUNTIME_DIR' in dbus_daemon_environment

        with contextlib.ExitStack() as stack:
            address_r, address_w = os.pipe()

            with open(address_r, 'rb', buffering=0, closefd=True) as address_reader:
                try:
                    proc = stack.enter_context(process_launcher.spawn(
                        str(request.config.option.dbus_daemon),
                        '--session',
                        '--nopidfile',
                        '--syslog' if container else '--nosyslog',
                        '--nofork',
                        '--address=unix:runtime=yes',
                        f'--print-address={address_w}',
                        pass_fds=(address_w,),
                        env=dbus_daemon_environment,
                    ))

                finally:
                    os.close(address_w)

                # read to end doesn't work when passing fd through podman
                # podman keeps the fd open even when the target process closes it
                proc.address = address_reader.readline().rstrip().decode()

            yield proc

    @pytest.fixture(scope='class')
    def dbus_environment(self, dbus_daemon_environment, dbus_daemon):
        env = {
            **dbus_daemon_environment,
            'DBUS_SESSION_BUS_ADDRESS': dbus_daemon.address,
        }

        LOGGER.info('D-Bus client environment: %r', env)

        return env

    @pytest.fixture(scope='class')
    def dbus_connection(self, dbus_daemon):
        connection = dbusutil.connect(dbus_daemon.address)

        try:
            yield connection

        finally:
            dbusutil.close(connection)

    @pytest.fixture(scope='class')
    def initial_monitor_layout(self):
        return (displayconfig.SimpleMonitorConfig(),)

    @pytest.fixture(scope='class')
    def xvfb_screen_config(self, initial_monitor_layout):
        width = max(monitor.x + monitor.width for monitor in initial_monitor_layout)
        height = max(monitor.y + monitor.height for monitor in initial_monitor_layout)

        return f'{width}x{height}x24'

    @pytest.fixture(scope='class')
    def xvfb(self, process_launcher, environment, xvfb_screen_config, request):
        display_r, display_w = os.pipe()

        with contextlib.ExitStack() as stack:
            with open(display_r, 'rb', buffering=0, closefd=True) as display_reader:
                try:
                    proc = stack.enter_context(process_launcher.spawn(
                        str(request.config.option.xvfb),
                        '-screen',
                        '0',
                        str(xvfb_screen_config),
                        '-nolisten',
                        'tcp',
                        '-terminate',
                        '-displayfd',
                        str(display_w),
                        pass_fds=(display_w,),
                        env=environment,
                    ))

                finally:
                    os.close(display_w)

                # read to end doesn't work when passing fd through podman
                # podman keeps the fd open even when the target process closes it
                proc.display = f':{display_reader.readline().rstrip().decode()}'

            yield proc

    @pytest.fixture(scope='class')
    def x11_environment(self, environment, xvfb):
        return {
            **environment,
            'DISPLAY': xvfb.display,
        }

    @pytest.fixture(scope='class')
    def disable_welcome_dialog(self, process_launcher, dbus_environment, request):
        process_launcher.run(
            str(request.config.option.gsettings_tool),
            'set',
            'org.gnome.shell',
            'welcome-dialog-last-shown-version',
            str(GLib.Variant('s', f'{MAX_GNOME_VERSION}.0')),
            env=dbus_environment,
        )

    @pytest.fixture(scope='class')
    def shell_process(
        self,
        container,
        process_launcher,
        gnome_shell_environment,
        gnome_shell_args,
        dbus_daemon,
        dbus_connection,
        dbus_environment,
        disable_welcome_dialog,
        sys_package,
        request,
    ):
        LOGGER.info('GNOME Shell environment: %r', gnome_shell_environment)

        def shutdown_dbus_daemon(timeout=procutil.DEFAULT_SHUTDOWN_TIMEOUT):
            if dbus_daemon.poll() is not None:
                return

            real_pid = \
                dbus_connection.get_stream().get_socket().get_credentials().get_unix_pid()

            procutil.shutdown_retry(dbus_daemon, real_pid=real_pid, timeout=timeout)

        process_launcher.run('mkdir', '-p', '-m', '01777', '/tmp/.X11-unix')

        process_launcher.run(
            str(request.config.option.gsettings_tool),
            'set',
            'org.gnome.mutter',
            'experimental-features',
            str(GLib.Variant('as', ('scale-monitor-framebuffer',))),
            env=dbus_environment,
        )

        if request.config.option.journald:
            wrapper = ('systemd-cat',)
        else:
            wrapper = tuple()

        with contextlib.ExitStack() as stack:
            with contextlib.ExitStack() as launch_stack:
                stdout_pipe_r, stdout_pipe_w = os.pipe2(os.O_CLOEXEC | os.O_DIRECT)
                launch_stack.callback(os.close, stdout_pipe_w)

                stdout_pipe_r = stack.enter_context(
                    open(stdout_pipe_r, 'rb', buffering=0, closefd=True)
                )

                stdout_tee_w = stack.enter_context(
                    open(sys.stdout.fileno(), 'wb', buffering=0, closefd=False)
                )

                stdout_parser = logparser.LogParser(stdout_pipe_r, stdout_tee_w)
                stdout_parser.start()
                stack.callback(stdout_parser.join, timeout=procutil.DEFAULT_SHUTDOWN_TIMEOUT)

                stderr_pipe_r, stderr_pipe_w = os.pipe2(os.O_CLOEXEC | os.O_DIRECT)
                launch_stack.callback(os.close, stderr_pipe_w)

                stderr_pipe_r = stack.enter_context(
                    open(stderr_pipe_r, 'rb', buffering=0, closefd=True)
                )

                stderr_tee_w = stack.enter_context(
                    open(sys.stderr.fileno(), 'wb', buffering=0, closefd=False)
                )

                stderr_parser = logparser.LogParser(stderr_pipe_r, stderr_tee_w)
                stderr_parser.start()
                stack.callback(stderr_parser.join, timeout=procutil.DEFAULT_SHUTDOWN_TIMEOUT)

                # Other processes will inherit GNOME Shell's stdout.
                # This will keep log parsers blocked in read().
                # But stopping D-Bus daemon should terminate all of them.
                stack.callback(shutdown_dbus_daemon)

                proc = stack.enter_context(
                    process_launcher.spawn(
                        *wrapper,
                        str(request.config.option.gnome_shell),
                        '--sm-disable',
                        '--unsafe-mode',
                        *gnome_shell_args,
                        stdout=stdout_pipe_w,
                        stderr=stderr_pipe_w,
                        env=gnome_shell_environment,
                    )
                )

            bus_name_owner = dbusutil.wait_name(dbus_connection, 'org.gnome.Shell')
            # Wait for all D-Bus objects to be exported
            bus_name_owner2 = dbusutil.wait_name(dbus_connection, 'org.gtk.MountOperationHandler')

            assert bus_name_owner == bus_name_owner2

            yield proc

    @pytest.fixture(scope='class')
    def shell_dbus_interface(self, shell_process, dbus_connection):
        proxy = shelldbus.Proxy.create(g_connection=dbus_connection)
        yield proxy
        proxy.terminate()

    @pytest.fixture(scope='class')
    def shell_extensions_dbus_interface(self, shell_process, dbus_connection):
        return shellextdbus.Proxy.create(g_connection=dbus_connection)

    @pytest.fixture(scope='class')
    def display_config(self, shell_process, dbus_connection):
        return displayconfig.DisplayConfig.create(dbus_connection)

    @pytest.fixture(scope='class')
    def shell_test_hook(self, shell_dbus_interface, log_sync):
        proxy = shellhook.Proxy.create(shell_dbus_interface)

        try:
            deadline = glibutil.Deadline(dbusutil.DEFAULT_LONG_TIMEOUT_MS)

            # GNOME Shell before 46 doesn't await eval() result.
            # Shell hook emits PropertiesChanged immediately after export.
            # Wait for it.
            while not proxy.get_cached_property_names():
                proxy.ensure_connected()

                glibutil.wait_any_source(timeout_ms=deadline.check_remaining_ms())

            log_sync_plugin = shellhook.LogSyncPlugin(proxy)
            log_sync.register(log_sync_plugin)

            try:
                proxy.unsafe_mode = False

                try:
                    yield proxy
                finally:
                    proxy.unsafe_mode = True

            finally:
                log_sync.unregister(log_sync_plugin)

        finally:
            proxy.Destroy()

    @pytest.fixture(scope='class')
    def disable_extension_updates(self, shell_dbus_interface):
        shell_dbus_interface.Eval(
            'Object.defineProperty(Main.extensionManager, "updatesSupported", { value: false })'
        )

    @pytest.fixture(scope='class')
    def shell_init(
        self,
        disable_extension_updates,
        shell_test_hook,
        display_config,
        initial_monitor_layout
    ):
        shell_test_hook.wait_property('StartingUp', False, timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)

        display_config.configure(initial_monitor_layout)

        shell_test_hook.Later(shellhook.LaterType.BEFORE_REDRAW)
        shell_test_hook.Later(shellhook.LaterType.IDLE)

    @pytest.fixture(scope='class')
    def extension_init(self, shell_init, shell_extensions_dbus_interface):
        return shell_extensions_dbus_interface.EnableExtension('ddterm@amezin.github.com')

    @pytest.fixture(scope='class')
    def extension_test_hook(self, shell_test_hook, extension_init):
        proxy = extensionhook.Proxy.create(shell_test_hook)

        try:
            proxy.DebugLog = True
            proxy.AppExtraArgs = apphook.APP_EXTRA_ARGS
            proxy.AppExtraEnv = [
                'G_MESSAGES_DEBUG=ddterm',
            ]

            yield proxy

        finally:
            proxy.Destroy()

    @pytest.fixture(scope='class')
    def settings_test_hook(self, shell_test_hook, extension_init):
        proxy = settingshook.Proxy.create(shell_test_hook)

        try:
            yield proxy

        finally:
            proxy.Destroy()

    @pytest.fixture(scope='class')
    def extension_dbus_interface(self, dbus_connection, extension_init):
        proxy = extensiondbus.Proxy.create(g_connection=dbus_connection)

        yield proxy

        # TODO: lots of errors if window is visible during shutdown
        if proxy.is_connected():
            proxy.Hide()
            glibutil.dispatch_pending_sources()

    @pytest.fixture(scope='class')
    def app_debug_dbus_interface(self, dbus_connection, extension_test_hook, app_dbus_actions):
        return apphook.Proxy.create(g_connection=dbus_connection)

    @pytest.fixture(scope='class')
    def app_dbus_actions(self, dbus_connection):
        return Gio.DBusActionGroup.get(
            dbus_connection,
            'com.github.amezin.ddterm',
            '/com/github/amezin/ddterm',
        )

    @pytest.fixture(scope='class')
    def hide_overview(self, shell_dbus_interface, shell_init):
        shell_dbus_interface.OverviewActive = False

    @pytest.fixture
    def disable_animations(self, shell_test_hook):
        shell_test_hook.EnableAnimations = False

    @pytest.fixture
    def hide(self, extension_dbus_interface, extension_test_hook, shell_test_hook):
        # Make sure has-window cached value is up to date
        glibutil.dispatch_pending_sources()

        if extension_test_hook.HasWindow:
            extension_dbus_interface.Hide()
            extension_test_hook.wait_property('HasWindow', False)

        shell_test_hook.WaitLeisure()
        shell_test_hook.Later(shellhook.LaterType.IDLE)

        yield

        # Make sure has-window cached value is up to date
        glibutil.dispatch_pending_sources()

        if extension_test_hook.HasWindow and extension_dbus_interface.is_connected():
            extension_dbus_interface.Hide()

            if extension_test_hook.is_connected():
                extension_test_hook.wait_property('HasWindow', False)

    @pytest.fixture(scope='class')
    def ignored_log_issues(self, container, os_id):
        if not container:
            return IGNORED_LOG_ISSUES

        return IGNORED_LOG_ISSUES_BY_OS.get(os_id, IGNORED_LOG_ISSUES)

    @pytest.fixture
    def check_log(self, caplog, ignored_log_issues):
        def collect_issues(when):
            for record in caplog.get_records(when):
                if record.levelno < logging.INFO:
                    continue

                message = getattr(record, 'message', None)

                if 'JS WARNING' not in message and record.levelno < logging.WARNING:
                    continue

                if message is None:
                    message = record.getMessage()

                if 'ddterm@amezin.github.com' not in message:
                    continue

                if any(pattern in message for pattern in ignored_log_issues):
                    warnings.warn(f'Ignored known issue: {message}')
                    continue

                yield message

        issues = list(collect_issues('setup'))

        if issues:
            raise Exception('\n'.join(issues))

        yield

        for when in ('setup', 'call', 'teardown'):
            issues.extend(collect_issues(when))

        if issues:
            raise Exception('\n'.join(issues))

    @pytest.fixture(scope='class')
    def dummy_app(
        self,
        dbus_environment,
        process_launcher,
        dbus_connection,
        shell_test_hook,
        hide_overview,
        pytestconfig,
    ):
        with process_launcher.spawn(
            str(pytestconfig.option.gjs),
            str(THIS_DIR / 'dummy-app.js'),
            env=dbus_environment,
        ) as proc:
            try:
                shell_test_hook.wait_property('FocusApp', 'com.github.ddterm.DummyApp')
                yield proc

            finally:
                Gio.DBusActionGroup.get(
                    dbus_connection,
                    'com.github.ddterm.DummyApp',
                    '/com/github/ddterm/DummyApp',
                ).activate_action('quit', None)


class GnomeSessionX11Fixtures(GnomeSessionFixtures):
    @pytest.fixture(scope='class')
    def dbus_daemon_environment(self, x11_environment):
        return {
            **x11_environment,
            'XDG_SESSION_TYPE': 'x11',
        }

    @pytest.fixture(scope='class')
    def gnome_shell_environment(self, dbus_environment):
        return dbus_environment

    @pytest.fixture(scope='class')
    def gnome_shell_args(self):
        return ('--x11',)


class GnomeSessionWaylandFixtures(GnomeSessionFixtures):
    @pytest.fixture(scope='class')
    def wayland_display(self):
        return 'wayland-test'

    @pytest.fixture(scope='class')
    def dbus_daemon_environment(self, environment, wayland_display):
        return {
            **environment,
            'WAYLAND_DISPLAY': wayland_display,
            'XDG_SESSION_TYPE': 'wayland',
        }

    @pytest.fixture(scope='class')
    def gnome_shell_environment_nested(
        self,
        dbus_environment,
        x11_environment,
        initial_monitor_layout
    ):
        return {
            **dbus_environment,
            **x11_environment,
            'MUTTER_DEBUG_NUM_DUMMY_MONITORS': str(len(initial_monitor_layout)),
            'MUTTER_DEBUG_DUMMY_MONITOR_SCALES': ','.join(
                str(monitor.scale) for monitor in initial_monitor_layout
            ),
            'MUTTER_DEBUG_DUMMY_MODE_SPECS': ':'.join(set(
                f'{monitor.width}x{monitor.height}'
                for monitor in initial_monitor_layout
            )),
        }

    @pytest.fixture(scope='class')
    def gnome_shell_environment(self, dbus_environment):
        return dbus_environment

    @pytest.fixture(scope='class')
    def gnome_shell_args(self, wayland_display, initial_monitor_layout):
        return (
            '--headless',
            f'--wayland-display={wayland_display}',
            *(
                f'--virtual-monitor={monitor.width}x{monitor.height}'
                for monitor in initial_monitor_layout
            ),
        )

    @pytest.fixture(scope='class', autouse=True)
    def check_hw_acceleration(self, request, shell_test_hook):
        enabled = shell_test_hook.Eval('global.backend.is_rendering_hardware_accelerated()')
        requested = request.config.option.hw_accel

        if requested and not enabled:
            warnings.warn('Hardware acceleration was requested, but not working')

        if enabled and not requested:
            warnings.warn('Hardware acceleration working, but was not requested')
