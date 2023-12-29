import collections
import contextlib
import enum
import functools
import logging.handlers
import math
import pathlib

import pytest
import Xlib.X

from gi.repository import GLib, Gio

from . import dbus_util, ddterm_fixtures, glib_util


LOGGER = logging.getLogger(__name__)

Rect = collections.namedtuple('Rect', ('x', 'y', 'width', 'height'))
MonitorConfig = collections.namedtuple('MonitorConfig', ('current_index', 'setting'))
MonitorInfo = collections.namedtuple('MonitorInfo', ('index', 'geometry', 'scale', 'workarea'))
Api = collections.namedtuple('TestApi', ('dbus', 'layout', 'settings', 'mouse_sim', 'shell'))

THIS_DIR = pathlib.Path(__file__).parent.resolve()
TEST_SRC_DIR = THIS_DIR / 'extension'
SRC_DIR = THIS_DIR.parent

DUMMY_APP_ID = 'com.github.ddterm.testapp'

DEFAULT_IDLE_TIMEOUT_MS = 200
XTE_IDLE_TIMEOUT_MS = DEFAULT_IDLE_TIMEOUT_MS
WAIT_TIMEOUT_MS = 2000
MOVE_RESIZE_WAIT_TIMEOUT_MS = 1000
STARTUP_TIMEOUT_SEC = 15
STARTUP_TIMEOUT_MS = STARTUP_TIMEOUT_SEC * 1000


class MaximizeMode(enum.StrEnum):
    NOT_MAXIMIZED = 'not_maximized'
    MAXIMIZE_EARLY = 'maximize_early'
    MAXIMIZE_LATE = 'maximize_late'


class WindowPosition(enum.StrEnum):
    LEFT = 'left'
    RIGHT = 'right'
    TOP = 'top'
    BOTTOM = 'bottom'


class MonitorSetting(enum.StrEnum):
    PRIMARY = 'primary'
    CURRENT = 'current'


@pytest.fixture(scope='module')
def container_volumes(container_volumes):
    return container_volumes + (
        (THIS_DIR / 'dummyapp' / 'dummyapp.js', f'/usr/local/bin/{DUMMY_APP_ID}', 'ro'),
        (
            THIS_DIR / 'dummyapp' / f'{DUMMY_APP_ID}.service',
            f'/usr/share/dbus-1/services/{DUMMY_APP_ID}.service',
            'ro'
        ),
    )


def resize_point(frame_rect, window_pos):
    x = frame_rect.x
    y = frame_rect.y
    edge_offset = 3

    if window_pos == WindowPosition.LEFT or window_pos == WindowPosition.RIGHT:
        y += math.floor(frame_rect.height / 2)

        if window_pos == WindowPosition.LEFT:
            x += frame_rect.width - edge_offset
        else:
            x += edge_offset
    else:
        x += math.floor(frame_rect.width / 2)

        if window_pos == WindowPosition.TOP:
            y += frame_rect.height - edge_offset
        else:
            y += edge_offset

    return x, y


def compute_target_rect(size, pos, monitor):
    x, y, width, height = monitor.workarea

    round_to = int(monitor.scale)

    if pos in [WindowPosition.TOP, WindowPosition.BOTTOM]:
        height *= size
        height -= height % round_to

        if pos == WindowPosition.BOTTOM:
            y += monitor.workarea.height - height
    else:
        width *= size
        width -= width % round_to

        if pos == WindowPosition.RIGHT:
            x += monitor.workarea.width - width

    return Rect(x, y, width, height)


def verify_window_geometry(test_interface, size, maximize, pos, monitor):
    if pos in [WindowPosition.TOP, WindowPosition.BOTTOM]:
        actual_maximized = test_interface.IsMaximizedVertically()
    else:
        actual_maximized = test_interface.IsMaximizedHorizontally()

    assert maximize == actual_maximized

    target_rect_unmaximized = compute_target_rect(
        size=size,
        pos=pos,
        monitor=monitor
    )

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

    top_or_bottom = window_pos in [WindowPosition.TOP, WindowPosition.BOTTOM]
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
    loop = GLib.MainLoop.new(GLib.MainContext.get_thread_default(), False)

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
        if monitor_config.setting == MonitorSetting.CURRENT:
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
    def __init__(self, x11_display, test_interface):
        self.display = x11_display
        self.test_interface = test_interface
        self.mouse_button_last = False

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
        unused_x, unused_y, c_mods = self.test_interface.GetPointer()
        self.mouse_button_last = c_mods != 0

        if self.mouse_button_last == button:
            return

        LOGGER.info('Pressing mouse button 1' if button else 'Releasing mouse button 1')
        self.display.xtest_fake_input(Xlib.X.ButtonPress if button else Xlib.X.ButtonRelease, 1)
        self.display.sync()

        for _ in glib_util.busy_wait(10, WAIT_TIMEOUT_MS):
            unused_x, unused_y, c_mods = self.test_interface.GetPointer()
            self.mouse_button_last = c_mods != 0

            if self.mouse_button_last == button:
                break

        LOGGER.info('Mouse button pressed = %s', self.mouse_button_last)


class CommonTests(ddterm_fixtures.DDTermFixtures):
    N_MONITORS = 1
    PRIMARY_MONITOR = 0
    IS_MIXED_DPI = False

    SUBCLASSES = {}

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)

        cls.SUBCLASSES[cls.__name__] = cls

    @pytest.fixture(scope='class', autouse=True)
    def test_setup(self, test_extension_interface, shell_dbus_api):
        shell_dbus_api.set_overview_active(False, timeout=STARTUP_TIMEOUT_MS)

    @pytest.fixture(scope='class')
    def layout(self, test_extension_interface, test_setup):
        return Layout(test_extension_interface)

    @pytest.fixture(scope='class', autouse=True)
    def check_layout(self, layout):
        assert len(layout.monitors) == self.N_MONITORS
        assert layout.primary_index == self.PRIMARY_MONITOR
        assert layout.is_mixed_dpi == self.IS_MIXED_DPI

    @pytest.fixture(scope='class')
    def settings(self, test_extension_interface):
        return Settings(test_extension_interface)

    @pytest.fixture(scope='class')
    def mouse_sim(self, test_extension_interface, x11_display):
        return MouseSim(x11_display, test_extension_interface)

    @pytest.fixture(autouse=True)
    def enable_screenshots(self, x11_display, screencap):
        screencap.enable(x11_display)

    @pytest.fixture(scope='class', autouse=True)
    def make_dummy_window(self, test_extension_interface, user_bus_connection):
        with glib_util.SignalWait(
            test_extension_interface,
            'g-properties-changed',
            timeout=STARTUP_TIMEOUT_MS
        ) as prop_wait:
            app_interface = dbus_util.wait_interface(
                user_bus_connection,
                DUMMY_APP_ID,
                '/' + DUMMY_APP_ID.replace('.', '/'),
                'org.freedesktop.Application',
                timeout=STARTUP_TIMEOUT_MS
            )

            app_interface.Activate('(a{sv})', {}, timeout=STARTUP_TIMEOUT_MS)

            app_id = GLib.Variant.new_string(DUMMY_APP_ID)
            while test_extension_interface.get_cached_property('ActiveApp') != app_id:
                prop_wait.wait()

    @pytest.fixture
    def test_api(self, test_extension_interface, layout, settings, mouse_sim, shell_dbus_api):
        return Api(
            dbus=test_extension_interface,
            layout=layout,
            settings=settings,
            mouse_sim=mouse_sim,
            shell=shell_dbus_api,
        )

    @pytest.fixture
    def monitor_config(self, monitor_setting, monitor_current):
        return MonitorConfig(monitor_current, monitor_setting)

    def test_show(self, test_api, monitor_config, window_pos, window_size, window_maximize):
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
        test_api.settings.set_string('window-position', window_pos)
        test_api.settings.set_string('window-monitor', monitor_config.setting)
        test_api.settings.set_boolean(
            'window-maximize',
            window_maximize == MaximizeMode.MAXIMIZE_EARLY
        )

        with glib_util.SignalWait(
            source=test_api.dbus,
            signal='g-properties-changed',
            timeout=STARTUP_TIMEOUT_MS
        ) as prop_wait:
            test_api.dbus.Toggle(timeout=STARTUP_TIMEOUT_MS)

            while not test_api.dbus.get_cached_property('RenderedFirstFrame'):
                prop_wait.wait()

        settings_maximize = test_api.settings.get('window-maximize')
        should_maximize = (
            window_maximize == MaximizeMode.MAXIMIZE_EARLY or
            (window_size == 1.0 and settings_maximize)
        )

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

        if window_maximize == MaximizeMode.MAXIMIZE_LATE:
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

        assert test_api.dbus.get_cached_property('ActiveApp').unpack() == 'com.github.amezin.ddterm'

    def test_mouse_resize(
        self,
        test_api,
        monitor_config,
        window_pos,
        window_size,
        window_size2,
        window_maximize,
        request
    ):
        monitor = test_api.layout.resolve_monitor(monitor_config)

        self.test_show(
            test_api=test_api,
            window_size=window_size,
            window_maximize=window_maximize,
            window_pos=window_pos,
            monitor_config=monitor_config
        )

        test_api.dbus.WaitLeisure()
        glib_util.sleep(XTE_IDLE_TIMEOUT_MS)
        test_api.dbus.WaitLeisure()

        initial_frame_rect = Rect(*test_api.dbus.GetFrameRect())

        initial_x, initial_y = resize_point(initial_frame_rect, window_pos)

        test_api.mouse_sim.move_to(initial_x, initial_y)

        target_frame_rect = compute_target_rect(
            size=window_size2,
            pos=window_pos,
            monitor=monitor
        )

        target_x, target_y = resize_point(target_frame_rect, window_pos)

        try:
            with wait_move_resize(
                test_api.dbus,
                1.0 if window_maximize != MaximizeMode.NOT_MAXIMIZED else window_size,
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
                size=test_api.settings.get('window-size'),
                pos=window_pos,
                monitor=monitor
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

    def test_change_position(self, test_api, monitor_config, window_pos, window_pos2, window_size):
        self.test_show(
            test_api=test_api,
            window_size=window_size,
            window_maximize=MaximizeMode.NOT_MAXIMIZED,
            window_pos=window_pos,
            monitor_config=monitor_config
        )

        initially_maximized = test_api.settings.get('window-maximize')
        monitor = test_api.layout.resolve_monitor(monitor_config)

        with wait_move_resize(
            test_api.dbus,
            window_size,
            window_size == 1.0 and initially_maximized,
            window_pos2,
            monitor,
        ) as wait:
            test_api.settings.set_string('window-position', window_pos2)
            wait()

    def test_unmaximize(self, test_api, monitor_config, window_pos, window_size, window_maximize):
        self.test_show(
            test_api=test_api,
            window_size=window_size,
            window_maximize=window_maximize,
            window_pos=window_pos,
            monitor_config=monitor_config
        )

        monitor = test_api.layout.resolve_monitor(monitor_config)

        with wait_move_resize(
            test_api.dbus,
            window_size,
            False,
            window_pos,
            monitor,
        ) as wait:
            test_api.settings.set_boolean('window-maximize', False)
            wait()

    def test_unmaximize_correct_size(
        self,
        test_api,
        monitor_config,
        window_pos,
        window_size,
        window_size2
    ):
        self.test_show(
            test_api=test_api,
            window_size=window_size,
            window_maximize=MaximizeMode.NOT_MAXIMIZED,
            window_pos=window_pos,
            monitor_config=monitor_config
        )

        monitor = test_api.layout.resolve_monitor(monitor_config)
        initially_maximized = test_api.settings.get('window-maximize')

        with wait_move_resize(
            test_api.dbus,
            window_size2,
            window_size == 1.0 and window_size2 == 1.0 and initially_maximized,
            window_pos,
            monitor,
        ) as wait1:
            test_api.settings.set_double('window-size', window_size2)
            wait1()

        with wait_move_resize(
            test_api.dbus,
            window_size2,
            True,
            window_pos,
            monitor,
        ) as wait2:
            test_api.settings.set_boolean('window-maximize', True)
            wait2()

        with wait_move_resize(
            test_api.dbus,
            window_size2,
            False,
            window_pos,
            monitor,
        ) as wait3:
            test_api.settings.set_boolean('window-maximize', False)
            wait3()

    def test_unmaximize_on_size_change(
        self,
        test_api,
        monitor_config,
        window_pos,
        window_size,
        window_size2
    ):
        self.test_show(
            test_api=test_api,
            window_size=window_size,
            window_maximize=MaximizeMode.MAXIMIZE_EARLY,
            window_pos=window_pos,
            monitor_config=monitor_config
        )

        monitor = test_api.layout.resolve_monitor(monitor_config)

        with wait_move_resize(
            test_api.dbus,
            window_size2,
            window_size2 == 1.0,
            window_pos,
            monitor,
        ) as wait:
            test_api.settings.set_double('window-size', window_size2)
            wait()

    PARAM_TYPES = {
        'session': None,
        'monitor_setting': str,
        'monitor_current': int,
        'window_size': float,
        'window_size2': float,
        'window_pos': WindowPosition,
        'window_pos2': WindowPosition,
        'window_maximize': MaximizeMode,
    }

    @staticmethod
    @functools.lru_cache
    def load_parametrization(filename):
        text = (THIS_DIR / 'pict' / filename).read_text()
        lines = text.splitlines()
        paramnames = lines[0].split('\t')
        paramtypes = tuple(CommonTests.PARAM_TYPES[name] for name in paramnames)
        paramvalues = collections.defaultdict(list)
        keyindex = paramnames.index('session')

        for line in lines[1:]:
            fields = line.split('\t')
            key = CommonTests.SUBCLASSES[fields[keyindex]]

            paramvalues[key].append(tuple(
                paramtypes[i](v) for i, v in enumerate(fields) if i != keyindex
            ))

        paramnames.pop(keyindex)
        return tuple(paramnames), paramvalues

    @classmethod
    def get_parametrization(cls, method_name):
        paramnames, paramvalues = cls.load_parametrization(f'{method_name}.gen')
        return paramnames, paramvalues[cls]

    def pytest_generate_tests(self, metafunc):
        metafunc.parametrize(
            *self.get_parametrization(metafunc.definition.originalname)
        )


class TestXSession(CommonTests):
    GNOME_SHELL_SESSION_NAME = 'gnome-session-x11'


class TestWaylandSession(CommonTests):
    GNOME_SHELL_SESSION_NAME = 'gnome-session-wayland'


def config_volume(path):
    host_path = THIS_DIR / pathlib.Path(path)

    return (
        host_path,
        pathlib.PurePosixPath('/') / host_path.relative_to(THIS_DIR),
        'ro'
    )


class TestWaylandHighDpi(TestWaylandSession):
    @pytest.fixture(scope='class')
    def container_volumes(self, container_volumes):
        return container_volumes + (
            config_volume(
                'etc/systemd/system/gnome-session-wayland@.service.d/mutter-highdpi.conf'
            ),
        )


class TestWaylandDualMonitor(TestWaylandSession):
    N_MONITORS = 2

    @pytest.fixture(scope='class')
    def container_volumes(self, container_volumes):
        return container_volumes + (
            config_volume(
                'etc/systemd/system/gnome-session-wayland@.service.d/mutter-dual-monitor.conf'
            ),
        )


@pytest.mark.flaky
class TestWaylandMixedDPI(TestWaylandDualMonitor):
    IS_MIXED_DPI = True

    @pytest.fixture(scope='class')
    def container_volumes(self, container_volumes):
        return container_volumes + (
            config_volume(
                'etc/systemd/system/gnome-session-wayland@.service.d/mutter-mixed-dpi.conf'
            ),
        )

    @pytest.fixture(scope='class', autouse=True)
    def check_mixed_dpi_supported(self, shell_dbus_api):
        if shell_dbus_api.version < (42, 0):
            pytest.skip('Mixed DPI is not supported by ddterm on GNOME Shell <42')


class TestWaylandFractionalScaling(TestWaylandSession):
    @pytest.fixture(scope='class')
    def container_volumes(self, container_volumes):
        return container_volumes + (
            config_volume(
                'etc/systemd/system/gnome-session-wayland@.service.d/mutter-fractional.conf'
            ),
        )

    def configure_session(self, container, request):
        container.gsettings_set(
            'org.gnome.mutter', 'experimental-features', ['scale-monitor-framebuffer'],
            timeout=STARTUP_TIMEOUT_SEC
        )

        super().configure_session(container, request)


class TestWaylandHighDpiScaleFramebuffer(TestWaylandHighDpi):
    def configure_session(self, container, request):
        container.gsettings_set(
            'org.gnome.mutter', 'experimental-features', ['scale-monitor-framebuffer'],
            timeout=STARTUP_TIMEOUT_SEC
        )

        super().configure_session(container, request)
