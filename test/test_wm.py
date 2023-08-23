import base64
import collections
import contextlib
import enum
import inspect
import itertools
import json
import logging
import math
import pathlib

import allpairspy
import pytest
import wand.image
import Xlib.X

from pytest_html import extras
from gi.repository import GLib, Gio

from . import glib_util


LOGGER = logging.getLogger(__name__)

THIS_DIR = pathlib.Path(__file__).parent.resolve()
SRC_DIR = THIS_DIR.parent

USER_NAME = 'gnomeshell'

PRIMARY_MONITOR_INDEX = 0

DEFAULT_IDLE_TIMEOUT_MS = 200
XTE_IDLE_TIMEOUT_MS = DEFAULT_IDLE_TIMEOUT_MS
WAIT_TIMEOUT_MS = 2000
MOVE_RESIZE_WAIT_TIMEOUT_MS = 1000
STARTUP_TIMEOUT_SEC = 15
STARTUP_TIMEOUT_MS = STARTUP_TIMEOUT_SEC * 1000

Rect = collections.namedtuple('Rect', ('x', 'y', 'width', 'height'))
MonitorConfig = collections.namedtuple('MonitorConfig', ('current_index', 'setting'))
MonitorInfo = collections.namedtuple('MonitorInfo', ('index', 'geometry', 'scale', 'workarea'))


class WindowSize(float):
    pass


SIZE_VALUES = [WindowSize(s) for s in [0.31, 0.36, 0.4, 0.5, 0.8, 0.85, 0.9, 0.91, 1.0]]


class MaximizeMode(enum.StrEnum):
    NOT_MAXIMIZED = 'not_maximized'
    MAXIMIZE_EARLY = 'maximize_early'
    MAXIMIZE_LATE = 'maximize_late'


class Position(enum.StrEnum):
    LEFT = 'left'
    RIGHT = 'right'
    TOP = 'top'
    BOTTOM = 'bottom'


class MonitorSetting(enum.StrEnum):
    PRIMARY = 'primary'
    CURRENT = 'current'


MONITOR_CONFIGS = (
    MonitorConfig(0, MonitorSetting.CURRENT),
    MonitorConfig(0, MonitorSetting.PRIMARY),
    MonitorConfig(1, MonitorSetting.CURRENT),
    MonitorConfig(1, MonitorSetting.PRIMARY),
)


class SessionConfig:
    n_monitors = 1
    monitor_configs = (
        MonitorConfig(0, MonitorSetting.CURRENT),
    )
    is_mixed_dpi = False
    logical_pixels = False

    @classmethod
    def configure(cls, container):
        pass

    @classmethod
    def setup(cls, shell_dbus_api):
        pass

    @staticmethod
    def config_volume(path):
        path = pathlib.Path(path).resolve()

        return (
            path,
            pathlib.PurePosixPath('/') / pathlib.PurePosixPath(path.relative_to(THIS_DIR)),
            'ro'
        )

    @classmethod
    def extra_volumes(cls):
        return (
            cls.config_volume(THIS_DIR / 'etc' / 'systemd' / 'system' / 'xvfb@.service.d' / 'fbdir.conf'),
        )

    @classmethod
    def valid_window_size(cls, position, size):
        return True


class X11Session(SessionConfig):
    name = 'gnome-session-x11'


class WaylandSession(SessionConfig):
    name = 'gnome-session-wayland'
    mutter_config_file = None

    @classmethod
    def extra_volumes(cls):
        if not cls.mutter_config_file:
            return super().extra_volumes()

        return super().extra_volumes() + (
            cls.config_volume(THIS_DIR / 'etc' / 'systemd' / 'system' / f'{cls.name}@.service.d' / cls.mutter_config_file),
        )


class SmallScreenSession(WaylandSession):
    @classmethod
    def valid_window_size(cls, position, size):
        return position in [Position.TOP, Position.BOTTOM] or size >= 0.8


class WaylandHighDpiSession(SmallScreenSession):
    mutter_config_file = 'mutter-highdpi.conf'


class WaylandDualMonitorSession(SmallScreenSession):
    n_monitors = 2
    mutter_config_file = 'mutter-dual-monitor.conf'


class WaylandMixedDPISession(SmallScreenSession):
    is_mixed_dpi = True
    n_monitors = 2
    mutter_config_file = 'mutter-mixed-dpi.conf'

    @classmethod
    def setup(cls, shell_dbus_api):
        if shell_dbus_api.version < (42, 0):
            pytest.skip('Mixed DPI is not supported before GNOME Shell 42')

        super().setup(shell_dbus_api)


class WaylandFractionalScalingSession(SmallScreenSession):
    mutter_config_file = 'mutter-fractional.conf'
    logical_pixels = True

    @classmethod
    def configure(cls, container):
        super().configure(container)

        container.exec(
            'gsettings', 'set', 'org.gnome.mutter', 'experimental-features',
            json.dumps(['scale-monitor-framebuffer']),
            timeout=STARTUP_TIMEOUT_SEC, user=USER_NAME
        )


ALL_SESSIONS = (
    X11Session,
    WaylandSession,
    WaylandHighDpiSession,
    WaylandDualMonitorSession,
    WaylandMixedDPISession,
    WaylandFractionalScalingSession,
)


@pytest.fixture(scope='session')
def session_config(request):
    return request.param


@pytest.fixture(scope='session')
def xvfb_fbdir(tmpdir_factory):
    return tmpdir_factory.mktemp('xvfb')


@pytest.fixture(scope='session')
def container_volumes(container_volumes, xvfb_fbdir, session_config):
    return container_volumes + (
        (xvfb_fbdir, '/xvfb', 'rw'),
    ) + tuple(session_config.extra_volumes())


@pytest.fixture(scope='session')
def shell_session_name(session_config):
    return session_config.name


@pytest.fixture(scope='session')
def configure_shell_session(configure_shell_session, container, session_config):
    session_config.configure(container)


def resize_point(frame_rect, window_pos, monitor_scale):
    x = frame_rect.x
    y = frame_rect.y
    edge_offset = 3 * monitor_scale

    if window_pos == Position.LEFT or window_pos == Position.RIGHT:
        y += math.floor(frame_rect.height / 2)

        if window_pos == Position.LEFT:
            x += frame_rect.width - edge_offset
        else:
            x += edge_offset
    else:
        x += math.floor(frame_rect.width / 2)

        if window_pos == Position.TOP:
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


def compute_target_rect(size, pos, monitor, logical_pixels):
    x, y, width, height = monitor.workarea

    round_to = int(monitor.scale)

    if logical_pixels:
        round_to *= round_to

    if pos in [Position.TOP, Position.BOTTOM]:
        height *= size
        height -= height % round_to

        if pos == Position.BOTTOM:
            y += monitor.workarea.height - height
    else:
        width *= size
        width -= width % round_to

        if pos == Position.RIGHT:
            x += monitor.workarea.width - width

    return Rect(x, y, width, height)


def verify_window_geometry(test_interface, size, maximize, pos, monitor, logical_pixels):
    if pos in [Position.TOP, Position.BOTTOM]:
        actual_maximized = test_interface.IsMaximizedVertically()
    else:
        actual_maximized = test_interface.IsMaximizedHorizontally()

    assert maximize == actual_maximized

    target_rect_unmaximized = compute_target_rect(
        size=size,
        pos=pos,
        monitor=monitor,
        logical_pixels=logical_pixels
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
    logical_pixels,
    max_signals=2,
    idle_timeout_ms=DEFAULT_IDLE_TIMEOUT_MS,
    wait_timeout_ms=MOVE_RESIZE_WAIT_TIMEOUT_MS
):
    glib_util.flush_main_loop()

    LOGGER.info(
        'Wait for window_size=%r window_maximize=%r window_pos=%r monitor=%r',
        window_size, window_maximize, window_pos, monitor.index
    )

    top_or_bottom = window_pos in [Position.TOP, Position.BOTTOM]
    maximize_sig = 'MaximizedVertically' if top_or_bottom else 'MaximizedHorizontally'

    if window_maximize:
        target_rect = monitor.workarea
    else:
        target_rect = compute_target_rect(
            size=window_size,
            pos=window_pos,
            monitor=monitor,
            logical_pixels=logical_pixels
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
                monitor=monitor,
                logical_pixels=logical_pixels
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


class MouseSim:
    def __init__(self, x11_display, test_interface):
        self.display = x11_display
        self.test_interface = test_interface
        self.mouse_button_last = False

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


@pytest.fixture(scope='session', autouse=True)
def session_setup(test_interface, session_config, shell_dbus_api):
    session_config.setup(shell_dbus_api)

    with glib_util.SignalWait(
        test_interface,
        'g-properties-changed',
        timeout=STARTUP_TIMEOUT_MS
    ) as wait1:
        while test_interface.get_cached_property('StartingUp'):
            wait1.wait()

    test_interface.BlockBanner(timeout=STARTUP_TIMEOUT_MS)
    test_interface.HideOverview(timeout=STARTUP_TIMEOUT_MS)

    with glib_util.SignalWait(
        test_interface,
        'g-properties-changed',
        timeout=STARTUP_TIMEOUT_MS
    ) as wait2:
        while test_interface.get_cached_property('OverviewVisible') or \
                test_interface.get_cached_property('WelcomeDialogVisible'):
            wait2.wait()


@pytest.fixture(scope='session')
def layout(test_interface):
    return Layout(test_interface)


@pytest.fixture(scope='session', autouse=True)
def check_layout(layout, session_config):
    assert layout.primary_index == PRIMARY_MONITOR_INDEX
    assert len(layout.monitors) == session_config.n_monitors
    assert layout.is_mixed_dpi == session_config.is_mixed_dpi


@pytest.fixture(scope='session')
def settings(test_interface):
    return Settings(test_interface)


@pytest.fixture(scope='session')
def mouse_sim(test_interface, x11_display):
    return MouseSim(x11_display, test_interface)


@pytest.fixture(scope='session')
def test_api(test_interface, layout, settings, mouse_sim):
    return collections.namedtuple('TestAPI', ['dbus', 'layout', 'settings', 'mouse_sim'])(
        dbus=test_interface,
        layout=layout,
        settings=settings,
        mouse_sim=mouse_sim
    )


def common_test_show(
    session_config,
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
    test_api.settings.set_boolean('window-maximize', window_maximize == MaximizeMode.MAXIMIZE_EARLY)
    test_api.settings.set_string('window-position', window_pos)
    test_api.settings.set_string('window-monitor', monitor_config.setting)

    with glib_util.SignalWait(
        source=test_api.dbus,
        signal='g-properties-changed',
        timeout=STARTUP_TIMEOUT_MS
    ) as prop_wait:
        test_api.dbus.Toggle(timeout=STARTUP_TIMEOUT_MS)

        while not test_api.dbus.get_cached_property('RenderedFirstFrame'):
            prop_wait.wait()

    settings_maximize = test_api.settings.get('window-maximize')
    should_maximize = \
        window_maximize == MaximizeMode.MAXIMIZE_EARLY or (window_size == 1.0 and settings_maximize)

    mixed_dpi_penalty = 3 if test_api.layout.is_mixed_dpi else 0

    with wait_move_resize(
        test_api.dbus,
        window_size,
        should_maximize,
        window_pos,
        window_monitor,
        session_config.logical_pixels,
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
            session_config.logical_pixels,
            1 + mixed_dpi_penalty
        ) as wait2:
            test_api.settings.set_boolean('window-maximize', True)
            wait2()


def param_find_by_type(param_row, match_type):
    for param in param_row:
        if isinstance(param, match_type):
            return param

    return None


def param_filter(param_row):
    session_config = None
    monitor_config = None
    window_size = []
    window_pos = []

    for p in param_row:
        if inspect.isclass(p) and issubclass(p, SessionConfig):
            assert session_config is None
            session_config = p

        elif isinstance(p, MonitorConfig):
            assert monitor_config is None
            monitor_config = p

        elif isinstance(p, WindowSize):
            window_size.append(p)

        elif isinstance(p, Position):
            window_pos.append(p)

    if session_config is None:
        return True

    if monitor_config is not None:
        if monitor_config.current_index >= session_config.n_monitors:
            return False

    return all(
        session_config.valid_window_size(pos, size)
        for pos, size in itertools.product(window_pos, window_size)
    )


def param_different(param_row, param_type):
    values = [v for v in param_row if isinstance(v, param_type)]

    assert len(values) <= 2
    return len(values) < 2 or values[0] != values[1]


@pytest.mark.parametrize(
    ('session_config', 'monitor_config', 'window_size', 'window_maximize', 'window_pos'),
    allpairspy.AllPairs(
        (ALL_SESSIONS, MONITOR_CONFIGS, SIZE_VALUES, list(MaximizeMode), list(Position)),
        filter_func=param_filter
    ),
    indirect=('session_config',),
    scope='session'
)
def test_show(
    test_api,
    window_size,
    window_maximize,
    window_pos,
    monitor_config,
    session_config,
    screenshot
):
    with screenshot:
        common_test_show(
            session_config,
            test_api,
            window_size,
            window_maximize,
            window_pos,
            monitor_config
        )


@pytest.mark.parametrize(
    ('session_config', 'monitor_config', 'window_size', 'window_maximize', 'window_size2', 'window_pos'),
    allpairspy.AllPairs(
        (ALL_SESSIONS, MONITOR_CONFIGS, SIZE_VALUES, list(MaximizeMode), SIZE_VALUES, list(Position)),
        filter_func=param_filter
    ),
    indirect=('session_config',),
    scope='session'
)
def test_resize_xte(
    test_api,
    window_size,
    window_maximize,
    window_size2,
    window_pos,
    monitor_config,
    session_config,
    screenshot,
    request
):
    monitor = test_api.layout.resolve_monitor(monitor_config)

    with screenshot:
        common_test_show(
            session_config,
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

        target_frame_rect = compute_target_rect(
            size=window_size2,
            pos=window_pos,
            monitor=monitor,
            logical_pixels=session_config.logical_pixels
        )

        target_x, target_y = resize_point(target_frame_rect, window_pos, monitor.scale)

        try:
            with wait_move_resize(
                test_api.dbus,
                1.0 if window_maximize != MaximizeMode.NOT_MAXIMIZED else window_size,
                False,
                window_pos,
                monitor,
                session_config.logical_pixels,
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
                monitor=monitor,
                logical_pixels=session_config.logical_pixels
            ) != target_frame_rect:
                wait3.wait()

        with wait_move_resize(
            test_api.dbus,
            window_size2,
            False,
            window_pos,
            monitor,
            session_config.logical_pixels,
            1
        ) as wait4:
            wait4()


@pytest.mark.parametrize(
    ('session_config', 'monitor_config', 'window_pos', 'window_pos2', 'window_size'),
    allpairspy.AllPairs(
        (ALL_SESSIONS, MONITOR_CONFIGS, list(Position), list(Position), SIZE_VALUES),
        filter_func=lambda p: param_filter(p) and param_different(p, Position)
    ),
    indirect=('session_config',),
    scope='session'
)
def test_change_position(
    test_api,
    window_size,
    window_pos,
    window_pos2,
    monitor_config,
    session_config,
    screenshot
):
    with screenshot:
        common_test_show(
            session_config,
            test_api,
            window_size,
            MaximizeMode.NOT_MAXIMIZED,
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
            monitor,
            session_config.logical_pixels
        ) as wait:
            test_api.settings.set_string('window-position', window_pos2)
            wait()


@pytest.mark.parametrize(
    ('session_config', 'monitor_config', 'window_size', 'window_maximize', 'window_pos'),
    allpairspy.AllPairs(
        (ALL_SESSIONS, MONITOR_CONFIGS, SIZE_VALUES, list(MaximizeMode), list(Position)),
        filter_func=param_filter
    ),
    indirect=('session_config',),
    scope='session'
)
def test_unmaximize(
    test_api,
    window_size,
    window_maximize,
    window_pos,
    monitor_config,
    session_config,
    screenshot
):
    with screenshot:
        common_test_show(
            session_config,
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
            monitor,
            session_config.logical_pixels
        ) as wait:
            test_api.settings.set_boolean('window-maximize', False)
            wait()


@pytest.mark.parametrize(
    ('session_config', 'monitor_config', 'window_size', 'window_size2', 'window_pos'),
    allpairspy.AllPairs(
        (ALL_SESSIONS, MONITOR_CONFIGS, SIZE_VALUES, SIZE_VALUES, list(Position)),
        filter_func=param_filter
    ),
    indirect=('session_config',),
    scope='session'
)
def test_unmaximize_correct_size(
    test_api,
    window_size,
    window_size2,
    window_pos,
    monitor_config,
    session_config,
    screenshot
):
    with screenshot:
        common_test_show(
            session_config,
            test_api,
            window_size,
            MaximizeMode.NOT_MAXIMIZED,
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
            monitor,
            session_config.logical_pixels
        ) as wait1:
            test_api.settings.set_double('window-size', window_size2)
            wait1()

        with wait_move_resize(
            test_api.dbus,
            window_size2,
            True,
            window_pos,
            monitor,
            session_config.logical_pixels
        ) as wait2:
            test_api.settings.set_boolean('window-maximize', True)
            wait2()

        with wait_move_resize(
            test_api.dbus,
            window_size2,
            False,
            window_pos,
            monitor,
            session_config.logical_pixels
        ) as wait3:
            test_api.settings.set_boolean('window-maximize', False)
            wait3()


@pytest.mark.parametrize(
    ('session_config', 'monitor_config', 'window_size', 'window_size2', 'window_pos'),
    allpairspy.AllPairs(
        (ALL_SESSIONS, MONITOR_CONFIGS, SIZE_VALUES, SIZE_VALUES, list(Position)),
        filter_func=lambda p: param_filter(p) and param_different(p, WindowSize)
    ),
    indirect=('session_config',),
    scope='session'
)
def test_unmaximize_on_size_change(
    test_api,
    window_size,
    window_size2,
    window_pos,
    monitor_config,
    session_config,
    screenshot
):
    with screenshot:
        common_test_show(
            session_config,
            test_api,
            window_size,
            MaximizeMode.MAXIMIZE_EARLY,
            window_pos,
            monitor_config
        )

        monitor = test_api.layout.resolve_monitor(monitor_config)

        with wait_move_resize(
            test_api.dbus,
            window_size2,
            window_size2 == 1.0,
            window_pos,
            monitor,
            session_config.logical_pixels
        ) as wait:
            test_api.settings.set_double('window-size', window_size2)
            wait()
