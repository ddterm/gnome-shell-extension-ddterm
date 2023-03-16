import base64
import collections
import contextlib
import datetime
import functools
import itertools
import json
import logging.handlers
import math
import pathlib
import queue
import shlex
import subprocess
import sys
import time
import zipfile

import allpairspy
import filelock
import pytest
import wand.image
import Xlib.display
import Xlib.X

from pytest_html import extras
from gi.repository import GLib, Gio

from . import container_util, dbus_util, glib_util, log_sync


LOGGER = logging.getLogger(__name__)

Rect = collections.namedtuple('Rect', ('x', 'y', 'width', 'height'))
MonitorConfig = collections.namedtuple('MonitorConfig', ('current_index', 'setting'))
MonitorInfo = collections.namedtuple('MonitorInfo', ('index', 'geometry', 'scale', 'workarea'))

THIS_DIR = pathlib.Path(__file__).parent.resolve()
TEST_SRC_DIR = THIS_DIR / 'extension'
SRC_DIR = THIS_DIR.parent

EXTENSIONS_INSTALL_DIR = pathlib.PurePosixPath('/usr/share/gnome-shell/extensions')
USER_NAME = 'gnomeshell'
DISPLAY_NUMBER = 99
X11_DISPLAY_BASE_PORT = 6000
DISPLAY_PORT = X11_DISPLAY_BASE_PORT + DISPLAY_NUMBER
DISPLAY = f':{DISPLAY_NUMBER}'
DBUS_PORT = 1234

MAXIMIZE_MODES = ['not-maximized', 'maximize-early', 'maximize-late']
HORIZONTAL_RESIZE_POSITIONS = ['left', 'right']
VERTICAL_RESIZE_POSITIONS = ['top', 'bottom']
POSITIONS = VERTICAL_RESIZE_POSITIONS + HORIZONTAL_RESIZE_POSITIONS
SIZE_VALUES = [0.5, 0.9, 1.0]
SMALL_SCREEN_SIZE_VALUES = [0.8, 0.85, 0.91]
MORE_SIZE_VALUES = [0.31, 0.36, 0.4] + SMALL_SCREEN_SIZE_VALUES

DEFAULT_IDLE_TIMEOUT_MS = 200
XTE_IDLE_TIMEOUT_MS = DEFAULT_IDLE_TIMEOUT_MS
WAIT_TIMEOUT_MS = 2000
MOVE_RESIZE_WAIT_TIMEOUT_MS = 1000
STARTUP_TIMEOUT_SEC = 10
STARTUP_TIMEOUT_MS = STARTUP_TIMEOUT_SEC * 1000


def mkpairs(*args, **kwargs):
    return list(allpairspy.AllPairs(*args, **kwargs))


@pytest.fixture(scope='session')
def ddterm_metadata(extension_pack):
    if extension_pack:
        with zipfile.ZipFile(extension_pack) as z:
            with z.open('metadata.json') as f:
                return json.load(f)

    else:
        with open(SRC_DIR / 'metadata.json', 'r') as f:
            return json.load(f)


@pytest.fixture(scope='session')
def test_metadata():
    with open(TEST_SRC_DIR / 'metadata.json', 'r') as f:
        return json.load(f)


@pytest.fixture(scope='session')
def xvfb_fbdir(tmpdir_factory):
    return tmpdir_factory.mktemp('xvfb')


@pytest.fixture(scope='session')
def common_volumes(ddterm_metadata, test_metadata, extension_pack, xvfb_fbdir, syslog_server):
    if extension_pack:
        src_mount = (extension_pack, extension_pack, 'ro')
    else:
        src_mount = (SRC_DIR, EXTENSIONS_INSTALL_DIR / ddterm_metadata['uuid'], 'ro')

    return [
        src_mount,
        (TEST_SRC_DIR, EXTENSIONS_INSTALL_DIR / test_metadata['uuid'], 'ro'),
        (xvfb_fbdir, '/xvfb', 'rw'),
        (syslog_server.server_address, '/run/systemd/journal/syslog'),
    ]


@pytest.fixture(scope='session')
def container_start_lock(request):
    return filelock.FileLock(request.config.cache.mkdir('container-starting') / 'lock')


def enable_extension(shell_extensions_interface, uuid):
    info = None

    with glib_util.SignalWait(
        source=shell_extensions_interface,
        signal='g-signal',
        timeout=STARTUP_TIMEOUT_MS
    ) as g_signal:
        shell_extensions_interface.EnableExtension('(s)', uuid, timeout=STARTUP_TIMEOUT_MS)

        while True:
            info = shell_extensions_interface.GetExtensionInfo(
                '(s)', uuid, timeout=STARTUP_TIMEOUT_MS
            )

            if info:
                break

            g_signal.wait()

    assert info['error'] == ''
    assert info['state'] == 1


def resize_point(frame_rect, window_pos, monitor_scale):
    x = frame_rect.x
    y = frame_rect.y
    edge_offset = 3 * monitor_scale

    if window_pos == 'left' or window_pos == 'right':
        y += math.floor(frame_rect.height / 2)

        if window_pos == 'left':
            x += frame_rect.width - edge_offset
        else:
            x += edge_offset
    else:
        x += math.floor(frame_rect.width / 2)

        if window_pos == 'top':
            y += frame_rect.height - edge_offset
        else:
            y += edge_offset

    return x, y


class ScreenshotContextManager(contextlib.AbstractContextManager):
    def __init__(self, failing_only, screen_path, extra):
        super().__init__()
        self.failing_only = failing_only
        self.screen_path = screen_path
        self.extra = extra

    def __exit__(self, exc_type, exc_value, traceback):
        if exc_type is None and self.failing_only:
            return

        xwd_blob = pathlib.Path(self.screen_path).read_bytes()

        with wand.image.Image(blob=xwd_blob, format='xwd') as img:
            png_blob = img.make_blob('png')

        self.extra.append(extras.png(base64.b64encode(png_blob).decode('ascii')))


@pytest.fixture
def screenshot(xvfb_fbdir, extra, pytestconfig):
    return ScreenshotContextManager(
        pytestconfig.getoption('--screenshot-failing-only'),
        xvfb_fbdir / 'Xvfb_screen0',
        extra
    )


def compute_target_rect(size, pos, monitor):
    x, y, width, height = monitor.workarea

    if pos in ['top', 'bottom']:
        height = math.trunc(height * size)
        height -= height % monitor.scale

        if pos == 'bottom':
            y += monitor.workarea.height - height
    else:
        width = math.trunc(width * size)
        width -= width % monitor.scale

        if pos == 'right':
            x += monitor.workarea.width - width

    return Rect(x, y, width, height)


def verify_window_geometry(test_interface, size, maximize, pos, monitor):
    if pos in ['top', 'bottom']:
        actual_maximized = test_interface.IsMaximizedVertically()
    else:
        actual_maximized = test_interface.IsMaximizedHorizontally()

    assert maximize == actual_maximized

    target_rect_unmaximized = compute_target_rect(size=size, pos=pos, monitor=monitor)

    assert all(
        coord % monitor.scale == 0
        for coord in target_rect_unmaximized
    )

    wm_current_rect = Rect(*test_interface.GetTargetRect())

    assert wm_current_rect == target_rect_unmaximized

    actual_frame_rect = Rect(*test_interface.GetFrameRect())

    if maximize:
        assert actual_frame_rect == monitor.workarea
    else:
        assert actual_frame_rect == target_rect_unmaximized


@contextlib.contextmanager
def wait_move_resize(
    test_interface,
    window_size,
    window_maximize,
    window_pos,
    monitor,
    max_signals=2,
    idle_timeout_ms=DEFAULT_IDLE_TIMEOUT_MS,
    wait_timeout_ms=MOVE_RESIZE_WAIT_TIMEOUT_MS
):
    glib_util.flush_main_loop()

    LOGGER.info(
        'Wait for window_size=%r window_maximize=%r window_pos=%r monitor=%r',
        window_size, window_maximize, window_pos, monitor.index
    )

    top_or_bottom = window_pos in ['top', 'bottom']
    maximize_sig = 'MaximizedVertically' if top_or_bottom else 'MaximizedHorizontally'

    if window_maximize:
        target_rect = monitor.workarea
    else:
        target_rect = compute_target_rect(
            size=window_size,
            pos=window_pos,
            monitor=monitor
        )

    if top_or_bottom:
        cur_maximized = test_interface.IsMaximizedVertically()
    else:
        cur_maximized = test_interface.IsMaximizedHorizontally()

    current_rect = Rect(*test_interface.GetFrameRect())
    signal_counter = dict()
    idle_timer = glib_util.OneShotTimer()
    wait_timer = glib_util.OneShotTimer()
    loop = GLib.MainLoop()

    def wait_timed_out():
        LOGGER.warning('Expected window geometry not reached')
        loop.quit()

    def idle_timed_out():
        LOGGER.info('Wait complete: %r', signal_counter)
        loop.quit()

    def restart_idle_timer(signal_name):
        if idle_timer.active:
            LOGGER.info('Restarting wait because of signal %r', signal_name)
            idle_timer.cancel()

        if cur_maximized != window_maximize or current_rect != target_rect:
            wait_timer.schedule(wait_timeout_ms, wait_timed_out)
            return

        LOGGER.info(
            "Geometry and maximized state match expected value, "
            "verifying that it won't change again"
        )

        wait_timer.cancel()
        idle_timer.schedule(idle_timeout_ms, idle_timed_out)

    def record_signal(signal):
        signal_counter[signal] = signal_counter.get(signal, 0) + 1

        if signal_counter[signal] > max_signals:
            loop.quit()
        else:
            restart_idle_timer(signal)

    def update_position(signal, params):
        nonlocal current_rect
        new_rect = Rect(*params)

        if current_rect.x != new_rect.x or current_rect.y != new_rect.y:
            current_rect = current_rect._replace(x=new_rect.x, y=new_rect.y)
            record_signal(signal)

    def update_size(signal, params):
        nonlocal current_rect
        new_rect = Rect(*params)

        if current_rect.width != new_rect.width or current_rect.height != new_rect.height:
            current_rect = current_rect._replace(width=new_rect.width, height=new_rect.height)
            record_signal(signal)

    def update_maximized(signal, params):
        nonlocal cur_maximized
        (new_maximized,) = params

        if cur_maximized != new_maximized:
            cur_maximized = new_maximized
            record_signal(signal)

    handlers = {
        'PositionChanged': update_position,
        'SizeChanged': update_size,
        maximize_sig: update_maximized,
        'MoveResizeRequested': lambda signal, _: restart_idle_timer(signal),
        'SettingChanged': lambda signal, _: restart_idle_timer(signal),
    }

    def on_signal(proxy, sender, signal, params):
        handler = handlers.get(signal)

        if handler:
            handler(signal, params.unpack())

    signal_handler = glib_util.SignalConnection(test_interface, 'g-signal', on_signal)

    def run(check=True):
        loop.run()

        signal_handler.disconnect()
        idle_timer.cancel()
        wait_timer.cancel()

        for signal, cnt in signal_counter.items():
            assert cnt <= max_signals, f'Too many {signal!r} signals'

        if check:
            verify_window_geometry(
                test_interface=test_interface,
                size=window_size,
                maximize=window_maximize,
                pos=window_pos,
                monitor=monitor
            )

    with idle_timer, wait_timer, signal_handler:
        restart_idle_timer(None)
        yield run


class Layout:
    def __init__(self, test_interface):
        self.monitors = [
            MonitorInfo(
                index=i,
                geometry=Rect(
                    *test_interface.GetMonitorGeometry('(i)', i, timeout=STARTUP_TIMEOUT_MS)
                ),
                workarea=Rect(
                    *test_interface.GetMonitorWorkarea('(i)', i, timeout=STARTUP_TIMEOUT_MS)
                ),
                scale=test_interface.GetMonitorScale('(i)', i, timeout=STARTUP_TIMEOUT_MS)
            ) for i in range(test_interface.GetNMonitors(timeout=STARTUP_TIMEOUT_MS))
        ]

        self.primary_index = test_interface.GetPrimaryMonitor()

        dpis = set(m.scale for m in self.monitors)
        self.is_mixed_dpi = len(dpis) > 1

    def resolve_monitor_index(self, monitor_config):
        if monitor_config.setting == 'current':
            return monitor_config.current_index
        else:
            return self.primary_index

    def resolve_monitor(self, monitor_config):
        return self.monitors[self.resolve_monitor_index(monitor_config)]


class Settings:
    def __init__(self, test_interface):
        self.dbus = test_interface

    def get_value(self, key):
        return self.dbus.call_sync(
            'GetSetting',
            GLib.Variant('(s)', [key]),
            Gio.DBusCallFlags.NONE,
            -1,
            None
        ).get_child_value(0).get_variant()

    def set_value(self, key, value):
        return self.dbus.SetSetting('(sv)', key, value)

    def sync(self):
        self.dbus.SyncSettings()

    def get(self, key):
        return self.get_value(key).unpack()

    def change_value(self, key, value):
        original = self.get_value(key)

        if value == original:
            LOGGER.debug('Setting %r already has the expected value %r', key, value)

        LOGGER.info('Changing setting %r from %r to %r', key, original, value)

        self.set_value(key, value)
        self.sync()

        assert self.get_value(key) == value

    def set_boolean(self, key, value):
        self.change_value(key, GLib.Variant.new_boolean(value))

    def set_double(self, key, value):
        self.change_value(key, GLib.Variant.new_double(value))

    def set_string(self, key, value):
        self.change_value(key, GLib.Variant.new_string(value))


class MouseSim(contextlib.AbstractContextManager):
    def __init__(self, container, test_interface, mods_getter_broken):
        self.container = container
        self.test_interface = test_interface
        self.mods_getter_broken = mods_getter_broken
        self.mouse_button_last = False

        host, port = container.get_port(DISPLAY_PORT)
        display_number = int(port) - X11_DISPLAY_BASE_PORT
        self.display = Xlib.display.Display(f'{host}:{display_number}')

    def close(self):
        self.display.close()

    def __exit__(self, *_):
        self.close()

    def move_to(self, x, y):
        x = math.floor(x)
        y = math.floor(y)

        c_x, c_y, _ = self.test_interface.GetPointer()

        if c_x == x and c_y == y:
            return

        LOGGER.info('Moving mouse from (%r, %r) to (%r, %r)', c_x, c_y, x, y)
        self.display.xtest_fake_input(Xlib.X.MotionNotify, x=x, y=y)
        self.display.sync()

        for _ in glib_util.busy_wait(10, WAIT_TIMEOUT_MS):
            c_x, c_y, _ = self.test_interface.GetPointer()

            if c_x == x and c_y == y:
                break

        LOGGER.info('Mouse is at (%r, %r)', c_x, c_y)

    def button(self, button):
        if not self.mods_getter_broken:
            unused_x, unused_y, c_mods = self.test_interface.GetPointer()
            self.mouse_button_last = c_mods != 0

        if self.mouse_button_last == button:
            return

        LOGGER.info('Pressing mouse button 1' if button else 'Releasing mouse button 1')
        self.display.xtest_fake_input(Xlib.X.ButtonPress if button else Xlib.X.ButtonRelease, 1)
        self.display.sync()

        if self.mods_getter_broken:
            glib_util.sleep(100)
            self.mouse_button_last = button

        else:
            for _ in glib_util.busy_wait(10, WAIT_TIMEOUT_MS):
                unused_x, unused_y, c_mods = self.test_interface.GetPointer()
                self.mouse_button_last = c_mods != 0

                if self.mouse_button_last == button:
                    break

        LOGGER.info('Mouse button pressed = %s', self.mouse_button_last)


class SyncMessageSystemdCat:
    def __init__(self, container):
        self.container = container

    @log_sync.hookimpl
    def log_sync_message(self, msg):
        try:
            self.container.exec('systemd-cat', input=msg.encode(), interactive=True)
            return True

        except Exception:
            LOGGER.exception("Can't send syslog message with systemd-cat")


class SyncMessageDBus:
    def __init__(self, dbus_interface):
        self.dbus_interface = dbus_interface

    @log_sync.hookimpl
    def log_sync_message(self, msg):
        try:
            self.dbus_interface.LogMessage('(s)', msg)
            return True

        except Exception:
            LOGGER.exception("Can't send syslog message through D-Bus")


class CommonFixtures:
    GNOME_SHELL_SESSION_NAME: str
    N_MONITORS: int
    PRIMARY_MONITOR = 0
    IS_MIXED_DPI = False

    @classmethod
    def mount_configs(cls):
        return [
            '/etc/systemd/system/xvfb@.service.d/fbdir.conf',
            '/etc/systemd/journald.conf.d/syslog.conf',
        ]

    @pytest.fixture(scope='class')
    def container(
        self,
        podman,
        container_image,
        common_volumes,
        container_start_lock,
        log_sync
    ):
        volumes = common_volumes + [
            (
                THIS_DIR / pathlib.PurePosixPath(path).relative_to('/'),
                pathlib.PurePosixPath(path),
                'ro'
            )
            for path in self.mount_configs()
        ]

        cap_add = [
            'SYS_NICE',
            'SYS_PTRACE',
            'SETPCAP',
            'NET_RAW',
            'NET_BIND_SERVICE',
            'DAC_READ_SEARCH',
        ]

        publish_ports = [
            ('127.0.0.1', '', DBUS_PORT),
            ('127.0.0.1', '', DISPLAY_PORT)
        ]

        with container_start_lock:
            c = container_util.Container(
                podman,
                '--pull=never',
                '--log-driver=none',
                '--tty',
                f'--publish={",".join(":".join(str(p) for p in spec) for spec in publish_ports)}',
                f'--cap-add={",".join(cap_add)}',
                *itertools.chain.from_iterable(
                    ('-v', ':'.join(str(part) for part in parts))
                    for parts in volumes
                ),
                container_image,
                timeout=STARTUP_TIMEOUT_SEC
            )

        try:
            c.start(timeout=STARTUP_TIMEOUT_SEC)

            with log_sync.with_registered(SyncMessageSystemdCat(c)):
                c.exec(
                    'busctl', '--system', '--watch-bind=true', 'status',
                    timeout=STARTUP_TIMEOUT_SEC
                )
                c.exec(
                    'systemctl', 'is-system-running', '--wait',
                    timeout=STARTUP_TIMEOUT_SEC
                )

                yield c

        finally:
            c.rm(timeout=STARTUP_TIMEOUT_SEC)

    @pytest.fixture(scope='class')
    def user_env(self, container):
        uid = container.exec('id', '-u', USER_NAME, stdout=subprocess.PIPE).stdout.decode().strip()

        return dict(
            user=USER_NAME,
            env=dict(DBUS_SESSION_BUS_ADDRESS=f'unix:path=/run/user/{uid}/bus')
        )

    @pytest.fixture(scope='class')
    def install_ddterm(self, extension_pack, container, user_env):
        if extension_pack:
            container.exec(
                'gnome-extensions', 'install', str(extension_pack),
                timeout=STARTUP_TIMEOUT_SEC, **user_env
            )

    @pytest.fixture(scope='class')
    def gnome_shell_session(self, container, user_env, install_ddterm):
        container.exec(
            'systemctl', '--user', 'start', f'{self.GNOME_SHELL_SESSION_NAME}@{DISPLAY}',
            timeout=STARTUP_TIMEOUT_SEC, **user_env
        )
        return self.GNOME_SHELL_SESSION_NAME

    @pytest.fixture(scope='class')
    def bus_connection(self, container, user_env):
        for _ in glib_util.busy_wait(100, STARTUP_TIMEOUT_MS):
            if container.exec(
                'busctl', '--user', '--watch-bind=true', '--timeout=1', 'status',
                stdout=subprocess.DEVNULL, check=False, **user_env
            ).returncode == 0:
                break

        with contextlib.closing(dbus_util.connect_tcp(*container.get_port(DBUS_PORT))) as c:
            yield c

    @pytest.fixture(scope='class')
    def shell_extensions_interface(self, bus_connection, gnome_shell_session):
        return dbus_util.wait_interface(
            bus_connection,
            name='org.gnome.Shell',
            path='/org/gnome/Shell',
            interface='org.gnome.Shell.Extensions',
        )

    @pytest.fixture(scope='class')
    def enable_ddterm(self, shell_extensions_interface, ddterm_metadata, install_ddterm):
        enable_extension(shell_extensions_interface, ddterm_metadata['uuid'])

    @pytest.fixture(scope='class')
    def extension_interface(self, bus_connection, enable_ddterm):
        return dbus_util.wait_interface(
            bus_connection,
            name='org.gnome.Shell',
            path='/org/gnome/Shell/Extensions/ddterm',
            interface='com.github.amezin.ddterm.Extension'
        )

    @pytest.fixture(scope='class')
    def enable_test(self, shell_extensions_interface, test_metadata, enable_ddterm):
        enable_extension(shell_extensions_interface, test_metadata['uuid'])

    @pytest.fixture(scope='class')
    def test_interface(self, bus_connection, enable_test, log_sync):
        iface = dbus_util.wait_interface(
            bus_connection,
            name='org.gnome.Shell',
            path='/org/gnome/Shell/Extensions/ddterm',
            interface='com.github.amezin.ddterm.ExtensionTest'
        )

        with log_sync.with_registered(SyncMessageDBus(iface)):
            yield iface

    @pytest.fixture(scope='class', autouse=True)
    def trace(self, test_interface):
        def trace_signal(proxy, sender, signal, params):
            LOGGER.info('%s %r', signal, params.unpack())

        def trace_props(proxy, changed, invalidated):
            for prop in changed.keys():
                LOGGER.info('%s = %r', prop, changed[prop])

            for prop in invalidated:
                LOGGER.info('%s invalidated', prop)

        with glib_util.SignalConnection(test_interface, 'g-signal', trace_signal):
            with glib_util.SignalConnection(test_interface, 'g-properties-changed', trace_props):
                yield

    @pytest.fixture(scope='class', autouse=True)
    def test_setup(self, test_interface):
        test_interface.DisableWelcomeDialog()

        with glib_util.SignalWait(
            test_interface,
            'g-properties-changed',
            timeout=STARTUP_TIMEOUT_MS
        ) as wait1:
            while test_interface.get_cached_property('StartingUp'):
                wait1.wait()

        test_interface.CloseWelcomeDialog()
        test_interface.BlockBanner()
        test_interface.HideOverview()

        with glib_util.SignalWait(
            test_interface,
            'g-properties-changed',
            timeout=STARTUP_TIMEOUT_MS
        ) as wait2:
            while test_interface.get_cached_property('OverviewVisible') or \
                    test_interface.get_cached_property('WelcomeDialogVisible'):
                wait2.wait()

    @pytest.fixture(scope='class')
    def layout(self, test_interface, test_setup):
        return Layout(test_interface)

    @pytest.fixture(scope='class', autouse=True)
    def check_layout(self, layout):
        assert len(layout.monitors) == self.N_MONITORS
        assert layout.primary_index == self.PRIMARY_MONITOR
        assert layout.is_mixed_dpi == self.IS_MIXED_DPI

    @pytest.fixture(scope='class')
    def shell_version(self, shell_extensions_interface):
        version_str = shell_extensions_interface.get_cached_property('ShellVersion').unpack()
        return tuple(
            int(x) if x.isdecimal() else x
            for x in version_str.split('.')
        )

    @pytest.fixture(scope='class')
    def settings(self, test_interface):
        return Settings(test_interface)

    @pytest.fixture(scope='class')
    def mouse_sim(self, test_interface, container, shell_version):
        with MouseSim(container, test_interface, shell_version[:2] == (3, 38)) as mouse_sim:
            yield mouse_sim

    @pytest.fixture(scope='class')
    def test_api(self, test_interface, layout, settings, mouse_sim):
        return collections.namedtuple('TestAPI', ['dbus', 'layout', 'settings', 'mouse_sim'])(
            dbus=test_interface,
            layout=layout,
            settings=settings,
            mouse_sim=mouse_sim
        )

    @pytest.fixture(autouse=True)
    def check_log_errors(self, caplog, syslog_server, ddterm_metadata):
        pattern = f'@{EXTENSIONS_INSTALL_DIR / ddterm_metadata["uuid"]}'

        yield

        all_records = itertools.chain(
            caplog.get_records('setup'),
            caplog.get_records('call'),
            caplog.get_records('teardown')
        )

        errors = [
            record for record in all_records
            if record.levelno >= logging.WARNING
            and record.name.startswith(syslog_server.logger.name)
            and pattern in record.message
        ]

        assert errors == []


class CommonTests(CommonFixtures):
    def common_test_show(
        self,
        test_api,
        window_size,
        window_maximize,
        window_pos,
        monitor_config
    ):
        glib_util.flush_main_loop()

        if test_api.dbus.get_cached_property('HasWindow'):
            with glib_util.SignalWait(test_api.dbus, 'g-properties-changed') as prop_wait:
                test_api.dbus.Toggle()

                while test_api.dbus.get_cached_property('HasWindow'):
                    prop_wait.wait()

        glib_util.flush_main_loop()

        current_monitor_rect = test_api.layout.monitors[monitor_config.current_index].geometry

        test_api.mouse_sim.move_to(
            current_monitor_rect.x + math.floor(current_monitor_rect.width / 2),
            current_monitor_rect.y + math.floor(current_monitor_rect.height / 2)
        )

        actual_current_monitor = test_api.dbus.GetCurrentMonitor()

        if actual_current_monitor != monitor_config.current_index:
            test_api.dbus.UpdateCurrentMonitor()
            actual_current_monitor = test_api.dbus.GetCurrentMonitor()

        assert actual_current_monitor == monitor_config.current_index

        window_monitor = test_api.layout.resolve_monitor(monitor_config)
        prev_maximize = test_api.settings.get('window-maximize')

        test_api.settings.set_double('window-size', window_size)
        test_api.settings.set_boolean('window-maximize', window_maximize == 'maximize-early')
        test_api.settings.set_string('window-position', window_pos)
        test_api.settings.set_string('window-monitor', monitor_config.setting)

        with glib_util.SignalWait(
            source=test_api.dbus,
            signal='g-properties-changed',
            timeout=STARTUP_TIMEOUT_MS
        ) as prop_wait:
            test_api.dbus.Toggle()

            while not test_api.dbus.get_cached_property('RenderedFirstFrame'):
                prop_wait.wait()

        settings_maximize = test_api.settings.get('window-maximize')
        should_maximize = \
            window_maximize == 'maximize-early' or (window_size == 1.0 and settings_maximize)

        mixed_dpi_penalty = 3 if test_api.layout.is_mixed_dpi else 0

        with wait_move_resize(
            test_api.dbus,
            window_size,
            should_maximize,
            window_pos,
            window_monitor,
            (0 if prev_maximize == should_maximize else 1) + mixed_dpi_penalty
        ) as wait1:
            wait1()

        if window_maximize == 'maximize-late':
            with wait_move_resize(
                test_api.dbus,
                window_size,
                True,
                window_pos,
                window_monitor,
                1 + mixed_dpi_penalty
            ) as wait2:
                test_api.settings.set_boolean('window-maximize', True)
                wait2()

    @pytest.mark.parametrize(
        ['window_size', 'window_maximize', 'window_pos'],
        mkpairs([MORE_SIZE_VALUES, MAXIMIZE_MODES, VERTICAL_RESIZE_POSITIONS])
    )
    def test_show_v(
        self,
        test_api,
        window_size,
        window_maximize,
        window_pos,
        monitor_config,
        shell_version,
        screenshot
    ):
        with screenshot:
            self.common_test_show(
                test_api,
                window_size,
                window_maximize,
                window_pos,
                monitor_config
            )

    def test_show_h(
        self,
        test_api,
        window_size,
        window_maximize,
        window_pos,
        monitor_config,
        shell_version,
        screenshot
    ):
        with screenshot:
            self.common_test_show(
                test_api,
                window_size,
                window_maximize,
                window_pos,
                monitor_config
            )

    @pytest.mark.parametrize(
        ['window_size', 'window_maximize', 'window_size2', 'window_pos'],
        mkpairs([SIZE_VALUES, MAXIMIZE_MODES, SIZE_VALUES, POSITIONS])
    )
    def test_resize_xte(
        self,
        test_api,
        window_size,
        window_maximize,
        window_size2,
        window_pos,
        monitor_config,
        shell_version,
        screenshot,
        request
    ):
        monitor = test_api.layout.resolve_monitor(monitor_config)

        if shell_version < (3, 39):
            if monitor.index == 1 and window_pos == 'bottom' and window_size2 == 1:
                request.applymarker(pytest.mark.xfail(
                    reason='For unknown reason it fails to resize to full height on 2nd monitor'
                ))

        with screenshot:
            self.common_test_show(
                test_api,
                window_size,
                window_maximize,
                window_pos,
                monitor_config
            )

            test_api.dbus.WaitLeisure()
            glib_util.sleep(XTE_IDLE_TIMEOUT_MS)
            test_api.dbus.WaitLeisure()

            initial_frame_rect = Rect(*test_api.dbus.GetFrameRect())

            initial_x, initial_y = resize_point(initial_frame_rect, window_pos, monitor.scale)

            test_api.mouse_sim.move_to(initial_x, initial_y)

            target_frame_rect = compute_target_rect(window_size2, window_pos, monitor)
            target_x, target_y = resize_point(target_frame_rect, window_pos, monitor.scale)

            try:
                with wait_move_resize(
                    test_api.dbus,
                    1.0 if window_maximize != 'not-maximized' else window_size,
                    False,
                    window_pos,
                    monitor,
                    3,
                    XTE_IDLE_TIMEOUT_MS
                ) as wait1:
                    test_api.mouse_sim.button(True)
                    wait1()

                test_api.mouse_sim.move_to(target_x, target_y)

                # mutter doesn't emit position-changed/size-changed while resizing
                for _ in glib_util.busy_wait(100, WAIT_TIMEOUT_MS):
                    if Rect(*test_api.dbus.GetFrameRect()) == target_frame_rect:
                        break

            finally:
                test_api.mouse_sim.button(False)

            with glib_util.SignalWait(test_api.dbus, 'g-signal') as wait3:
                while compute_target_rect(
                    test_api.settings.get('window-size'),
                    window_pos,
                    monitor
                ) != target_frame_rect:
                    wait3.wait()

            with wait_move_resize(
                test_api.dbus,
                window_size2,
                False,
                window_pos,
                monitor,
                1
            ) as wait4:
                wait4()

    @pytest.mark.parametrize(
        ['window_pos', 'window_pos2', 'window_size'],
        mkpairs(
            [POSITIONS, POSITIONS, SIZE_VALUES],
            filter_func=lambda p: (len(p) < 2) or (p[0] != p[1])
        )
    )
    def test_change_position(
        self,
        test_api,
        window_size,
        window_pos,
        window_pos2,
        monitor_config,
        screenshot
    ):
        with screenshot:
            self.common_test_show(
                test_api,
                window_size,
                'not-maximized',
                window_pos,
                monitor_config
            )

            initially_maximized = test_api.settings.get('window-maximize')
            monitor = test_api.layout.resolve_monitor(monitor_config)

            with wait_move_resize(
                test_api.dbus,
                window_size,
                window_size == 1.0 and initially_maximized,
                window_pos2,
                monitor
            ) as wait:
                test_api.settings.set_string('window-position', window_pos2)
                wait()

    @pytest.mark.parametrize(
        ['window_size', 'window_maximize', 'window_pos'],
        mkpairs([SIZE_VALUES, MAXIMIZE_MODES, POSITIONS])
    )
    def test_unmaximize(
        self,
        test_api,
        window_size,
        window_maximize,
        window_pos,
        monitor_config,
        screenshot
    ):
        with screenshot:
            self.common_test_show(
                test_api,
                window_size,
                window_maximize,
                window_pos,
                monitor_config
            )

            monitor = test_api.layout.resolve_monitor(monitor_config)

            with wait_move_resize(
                test_api.dbus,
                window_size,
                False,
                window_pos,
                monitor
            ) as wait:
                test_api.settings.set_boolean('window-maximize', False)
                wait()

    @pytest.mark.parametrize(
        ['window_size', 'window_size2', 'window_pos'],
        mkpairs([SIZE_VALUES, SIZE_VALUES, POSITIONS])
    )
    def test_unmaximize_correct_size(
        self,
        test_api,
        window_size,
        window_size2,
        window_pos,
        monitor_config,
        screenshot
    ):
        with screenshot:
            self.common_test_show(
                test_api,
                window_size,
                'not-maximized',
                window_pos,
                monitor_config
            )

            monitor = test_api.layout.resolve_monitor(monitor_config)
            initially_maximized = test_api.settings.get('window-maximize')

            with wait_move_resize(
                test_api.dbus,
                window_size2,
                window_size == 1.0 and window_size2 == 1.0 and initially_maximized,
                window_pos,
                monitor
            ) as wait1:
                test_api.settings.set_double('window-size', window_size2)
                wait1()

            with wait_move_resize(
                test_api.dbus,
                window_size2,
                True,
                window_pos,
                monitor
            ) as wait2:
                test_api.settings.set_boolean('window-maximize', True)
                wait2()

            with wait_move_resize(
                test_api.dbus,
                window_size2,
                False,
                window_pos,
                monitor
            ) as wait3:
                test_api.settings.set_boolean('window-maximize', False)
                wait3()

    @pytest.mark.parametrize(
        ['window_size', 'window_size2', 'window_pos'],
        mkpairs(
            [SIZE_VALUES, SIZE_VALUES, POSITIONS],
            filter_func=lambda p: (len(p) < 2) or (p[0] != p[1])
        )
    )
    def test_unmaximize_on_size_change(
        self,
        test_api,
        window_size,
        window_size2,
        window_pos,
        monitor_config,
        screenshot
    ):
        with screenshot:
            self.common_test_show(
                test_api,
                window_size,
                'maximize-early',
                window_pos,
                monitor_config
            )

            monitor = test_api.layout.resolve_monitor(monitor_config)

            with wait_move_resize(
                test_api.dbus,
                window_size2,
                window_size2 == 1.0,
                window_pos,
                monitor
            ) as wait:
                test_api.settings.set_double('window-size', window_size2)
                wait()


class LargeScreenMixin(CommonTests):
    @pytest.mark.parametrize(
        ['window_size', 'window_maximize', 'window_pos'],
        mkpairs([MORE_SIZE_VALUES, MAXIMIZE_MODES, HORIZONTAL_RESIZE_POSITIONS])
    )
    @functools.wraps(CommonTests.test_show_h)
    def test_show_h(self, *args, **kwargs):
        super().test_show_h(*args, **kwargs)


class SmallScreenMixin(CommonTests):
    @pytest.mark.parametrize(
        ['window_size', 'window_maximize', 'window_pos'],
        mkpairs([SMALL_SCREEN_SIZE_VALUES, MAXIMIZE_MODES, HORIZONTAL_RESIZE_POSITIONS])
    )
    @functools.wraps(CommonTests.test_show_h)
    def test_show_h(self, *args, **kwargs):
        super().test_show_h(*args, **kwargs)


@pytest.mark.parametrize('monitor_config', [
    MonitorConfig(0, 'current')
])
class SingleMonitorTests(CommonTests):
    N_MONITORS = 1


@pytest.mark.parametrize('monitor_config', [
    MonitorConfig(1, 'primary'),
    MonitorConfig(1, 'current'),
    # MonitorConfig(0, 'current'), # not interesting
])
class DualMonitorTests(CommonTests):
    N_MONITORS = 2


class TestXSession(SingleMonitorTests, LargeScreenMixin):
    GNOME_SHELL_SESSION_NAME = 'gnome-xsession'


class TestWayland(SingleMonitorTests, LargeScreenMixin):
    GNOME_SHELL_SESSION_NAME = 'gnome-wayland-nested'


class TestWaylandHighDpi(SingleMonitorTests, SmallScreenMixin):
    GNOME_SHELL_SESSION_NAME = 'gnome-wayland-nested'

    @classmethod
    def mount_configs(cls):
        return super().mount_configs() + [
            '/etc/systemd/user/gnome-wayland-nested@.service.d/mutter-highdpi.conf'
        ]


class TestWaylandDualMonitor(DualMonitorTests, SmallScreenMixin):
    GNOME_SHELL_SESSION_NAME = 'gnome-wayland-nested'

    @classmethod
    def mount_configs(cls):
        return super().mount_configs() + [
            '/etc/systemd/user/gnome-wayland-nested@.service.d/mutter-dual-monitor.conf'
        ]


@pytest.mark.flaky
class TestWaylandMixedDPI(DualMonitorTests, SmallScreenMixin):
    GNOME_SHELL_SESSION_NAME = 'gnome-wayland-nested'
    IS_MIXED_DPI = True

    @classmethod
    def mount_configs(cls):
        return super().mount_configs() + [
            '/etc/systemd/user/gnome-wayland-nested@.service.d/mutter-mixed-dpi.conf'
        ]

    @functools.wraps(CommonTests.test_show_v)
    def test_show_v(self, *args, shell_version, **kwargs):
        if shell_version < (42, 0):
            pytest.skip('Mixed DPI is not supported before GNOME Shell 42')

        super().test_show_v(*args, shell_version=shell_version, **kwargs)

    @functools.wraps(SmallScreenMixin.test_show_v)
    def test_show_h(self, *args, shell_version, **kwargs):
        if shell_version < (42, 0):
            pytest.skip('Mixed DPI is not supported before GNOME Shell 42')

        super().test_show_h(*args, shell_version=shell_version, **kwargs)

    @pytest.mark.skip
    def test_resize_xte(self, monitor_config):
        pass

    @pytest.mark.skip
    def test_change_position(self, monitor_config):
        pass

    @pytest.mark.skip
    def test_unmaximize(self, monitor_config):
        pass

    @pytest.mark.skip
    def test_unmaximize_correct_size(self, monitor_config):
        pass

    @pytest.mark.skip
    def test_unmaximize_on_size_change(self, monitor_config):
        pass


def wait_action_in_group(group, action):
    with glib_util.SignalWait(group, f'action-added::{action}') as w:
        while not group.has_action(action):
            w.wait()


def wait_action_in_group_enabled(group, action, enabled=True):
    wait_action_in_group(group, action)

    with glib_util.SignalWait(group, f'action-enabled-changed::{action}') as w:
        while group.get_action_enabled(action) != enabled:
            w.wait()


@contextlib.contextmanager
def detect_heap_leaks(syslogger, app_actions, heap_dump_dir):

    def dump_heap():
        timestamp = datetime.datetime.now(datetime.timezone.utc)
        heap_dump_file = heap_dump_dir / f'{timestamp.isoformat().replace(":", "-")}.heap'

        app_actions.activate_action('gc', None)

        handler = logging.handlers.QueueHandler(queue.SimpleQueue())
        syslogger.addHandler(handler)

        try:
            app_actions.activate_action('dump-heap', GLib.Variant('s', str(heap_dump_file)))

            for record in iter(lambda: handler.queue.get(timeout=1), None):
                if record.message.endswith(f'Dumped heap to {heap_dump_file}'):
                    return heap_dump_file

        finally:
            syslogger.removeHandler(handler)

    dump_pre = dump_heap()

    yield

    dump_post = dump_heap()

    heapgraph_argv = [
        sys.executable,
        str(SRC_DIR / 'tools' / 'heapgraph.py'),
        '--hide-node',
        '_init/Gtk',
        '--no-gray-roots',
        '--no-weak-maps',
        '--diff-heap',
        str(dump_pre),
        str(dump_post),
        'GObject_Object'
    ]

    LOGGER.info('Running heapgraph: %r', shlex.join(heapgraph_argv))

    heapgraph = subprocess.run(
        heapgraph_argv,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
        text=True
    )

    LOGGER.info('heapgraph stderr:\n%s\nstdout:\n%s\n', heapgraph.stderr, heapgraph.stdout)
    assert heapgraph.stdout == ''


class TestHeapLeaks(CommonFixtures):
    GNOME_SHELL_SESSION_NAME = 'gnome-xsession'
    N_MONITORS = 1

    @pytest.fixture
    def app_actions(self, bus_connection):
        return Gio.DBusActionGroup.get(
            bus_connection,
            'com.github.amezin.ddterm',
            '/com/github/amezin/ddterm'
        )

    @pytest.fixture
    def win_actions(self, bus_connection):
        return Gio.DBusActionGroup.get(
            bus_connection,
            'com.github.amezin.ddterm',
            '/com/github/amezin/ddterm/window/1'
        )

    @pytest.fixture(autouse=True)
    def run_app(self, extension_interface, test_interface, app_actions, win_actions):
        extension_interface.Activate()

        def app_running():
            return test_interface.get_cached_property('IsAppRunning').unpack()

        def has_window():
            return test_interface.get_cached_property('HasWindow').unpack()

        with glib_util.SignalWait(test_interface, 'g-properties-changed', STARTUP_TIMEOUT_MS) as w:
            while not app_running() or not has_window():
                w.wait()

        try:
            yield

        finally:
            app_actions.activate_action('quit', None)

            with glib_util.SignalWait(test_interface, 'g-properties-changed') as w:
                while app_running() or has_window():
                    w.wait()

    @pytest.fixture(scope='session')
    def heap_dump_dir(self, tmp_path_factory):
        path = tmp_path_factory.mktemp('heap')
        path.chmod(0o777)
        return path

    @pytest.fixture(scope='session')
    def common_volumes(self, common_volumes, heap_dump_dir):
        return common_volumes + [(heap_dump_dir, heap_dump_dir)]

    @pytest.fixture
    def leak_detector(self, syslog_server, app_actions, heap_dump_dir):
        wait_action_in_group(app_actions, 'gc')
        wait_action_in_group(app_actions, 'dump-heap')

        return functools.partial(
            detect_heap_leaks,
            syslogger=syslog_server.logger,
            app_actions=app_actions,
            heap_dump_dir=heap_dump_dir
        )

    def test_tab_leak(self, leak_detector, win_actions):
        wait_action_in_group(win_actions, 'new-tab')
        wait_action_in_group(win_actions, 'close-current-tab')

        with leak_detector():
            win_actions.activate_action('new-tab', None)
            win_actions.activate_action('close-current-tab', None)
            time.sleep(0.5)

    def test_prefs_leak(self, leak_detector, app_actions, win_actions):
        wait_action_in_group(app_actions, 'preferences')
        wait_action_in_group_enabled(app_actions, 'close-preferences', False)

        def open_close_prefs():
            app_actions.activate_action('preferences', None)
            wait_action_in_group_enabled(app_actions, 'close-preferences', True)
            app_actions.activate_action('close-preferences', None)
            wait_action_in_group_enabled(app_actions, 'close-preferences', False)

        open_close_prefs()
        time.sleep(0.5)

        with leak_detector():
            open_close_prefs()
            time.sleep(0.5)


class TestDependencies(CommonFixtures):
    GNOME_SHELL_SESSION_NAME = 'gnome-xsession'
    N_MONITORS = 1

    @pytest.fixture(scope='session')
    def common_volumes(self, common_volumes):
        mount = (SRC_DIR, SRC_DIR, 'ro')
        if mount in common_volumes:
            return common_volumes

        return common_volumes + [mount]

    def test_manifest(self, container, user_env):
        container.exec(
            str(SRC_DIR / 'ddterm' / 'app' / 'tools' / 'dependencies-update.js'),
            '--dry-run',
            timeout=60,
            **user_env
        )
