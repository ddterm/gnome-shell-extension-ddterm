import contextlib
import enum
import functools
import logging
import math
import pathlib
import warnings

import pytest

from gi.repository import GLib, Gio

from . import dbusutil, displayconfig, fixtures, geometry, glibutil, pictparam, shellhook


THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
PARAMS_DIR = THIS_DIR / 'pict'

LOGGER = logging.getLogger(__name__)


@enum.unique
class WindowPosition(enum.StrEnum):
    TOP = 'top'
    BOTTOM = 'bottom'
    LEFT = 'left'
    RIGHT = 'right'

    @property
    def scale_transition(self):
        if self == WindowPosition.LEFT or self == WindowPosition.RIGHT:
            return 'scale-x'
        else:
            return 'scale-y'


@enum.unique
class AnimationMode(enum.StrEnum):
    GNOME_DEFAULT = 'gnome-default'
    DDTERM_DEFAULT = 'ddterm-default'
    DDTERM_DISABLE = 'ddterm-disable'
    GLOBAL_DISABLE = 'global-disable'

    def expected_transitions(self, window_position):
        if self == AnimationMode.DDTERM_DISABLE or self == AnimationMode.GLOBAL_DISABLE:
            return set()

        if self == AnimationMode.GNOME_DEFAULT:
            return {'opacity', 'scale-x', 'scale-y'}

        return {'opacity', window_position.scale_transition}

    @property
    def enable_global(self):
        return self != AnimationMode.GLOBAL_DISABLE

    @property
    def settings(self):
        if self == AnimationMode.GLOBAL_DISABLE:
            return {}

        if self == AnimationMode.GNOME_DEFAULT:
            return {'override-window-animation': False}

        mode = {
            AnimationMode.DDTERM_DEFAULT: 'linear',
            AnimationMode.DDTERM_DISABLE: 'disable',
        }[self]

        return {
            'override-window-animation': True,
            'show-animation': mode,
            'hide-animation': mode,
        }


@enum.unique
class WindowMonitor(enum.StrEnum):
    CURRENT = 'current'
    PRIMARY = 'primary'
    CONNECTOR = 'connector'


@enum.unique
class GdkBackend(enum.StrEnum):
    X11 = 'x11'
    WAYLAND = 'wayland'


def compute_target_rect(window_size, window_position, workarea, round_to=1):
    x, y, width, height = workarea.x, workarea.y, workarea.width, workarea.height

    if window_position in [WindowPosition.TOP, WindowPosition.BOTTOM]:
        height *= window_size
        height -= height % round_to

        if window_position == WindowPosition.BOTTOM:
            y += workarea.height - height
    else:
        width *= window_size
        width -= width % round_to

        if window_position == WindowPosition.RIGHT:
            x += workarea.width - width

    return geometry.Rect(x=x, y=y, width=width, height=height)


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


@functools.cache
def load_params(filename):
    return pictparam.Parametrization.load(filename, globals())


def wait_idle(
    shell_test_hook,
    extension_test_hook,
    app_debug_dbus_interface,
    num_idle_frames=2,
    timeout=dbusutil.DEFAULT_TIMEOUT_MS,
):
    LOGGER.info(
        'Waiting for %r consecutive frames with no window geometry changes',
        num_idle_frames
    )

    counter = 0

    def reset(signal, source, *args):
        LOGGER.info('Received signal %s%r on %r, restarting wait', signal, args, source)
        nonlocal counter
        counter = 0

    deadline = glibutil.Deadline(timeout)

    with contextlib.ExitStack() as stack:
        for signal in (
            'MoveResizeRequested',
            'notify::WindowRect',
            'notify::MaximizedHorizontally',
            'notify::MaximizedVertically',
        ):
            stack.enter_context(
                glibutil.signal_handler(
                    extension_test_hook,
                    signal,
                    functools.partial(reset, signal)
                )
            )

        for signal in ('ConfigureEvent', 'WindowStateEvent', 'SizeAllocate'):
            stack.enter_context(
                glibutil.signal_handler(
                    app_debug_dbus_interface,
                    signal,
                    functools.partial(reset, signal)
                )
            )

        while counter < num_idle_frames:
            counter += 1

            try:
                app_debug_dbus_interface.WaitFrame(timeout=min(deadline.remaining_ms, 1000))

            except GLib.Error as ex:
                if ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.TIMED_OUT):
                    warnings.warn('Wait for next frame timed out. Happens on XWayland.')

                else:
                    raise

            shell_test_hook.Later(shellhook.LaterType.RESIZE, timeout=deadline.remaining_ms)

            LOGGER.info('%r consecutive frames with no window geometry changes', counter)


@pytest.mark.usefixtures('screenshot', 'hide_overview', 'hide', 'gdk_backend')
class CommonTests:
    @pytest.fixture
    def animation_mode(self, shell_test_hook, settings_test_hook, request):
        shell_test_hook.EnableAnimations = request.param.enable_global

        for key, value in request.param.settings.items():
            settings_test_hook.set_property(key, value)

        yield request.param

        shell_test_hook.EnableAnimations = False

    @pytest.fixture
    def monitor_config(
        self,
        monitor_layout,
        primary_monitor,
        layout_mode,
        dbus_connection,
        display_config,
        shell_test_hook,
        extension_test_hook,
        app_dbus_actions,
    ):
        # Make sure cached property values (especially 'app-running') are up to date
        glibutil.process_pending_events()

        if layout_mode != display_config.cached_state.layout_mode:
            # Hack: Gtk 3 doesn't seem to handle layout mode switch well,
            # restart the app
            if extension_test_hook.AppRunning:
                app_dbus_actions.activate_action('quit', None)

                extension_test_hook.wait_property(
                    'AppRunning',
                    False,
                    timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS
                )

        display_config.configure(
            monitor_layout,
            layout_mode=layout_mode,
            primary_index=primary_monitor,
        )

        if not display_config.cached_state_valid:
            # It seems that moving the panel (changing the primary monitor)
            # can take 2 frames
            shell_test_hook.Later(shellhook.LaterType.BEFORE_REDRAW)
            shell_test_hook.Later(shellhook.LaterType.IDLE)
            shell_test_hook.Later(shellhook.LaterType.BEFORE_REDRAW)
            shell_test_hook.Later(shellhook.LaterType.IDLE)
            display_config.get_current_state()

        return monitor_layout

    @pytest.fixture
    def gdk_backend(
        self,
        request,
        dbus_connection,
        extension_test_hook,
        settings_test_hook,
        app_dbus_actions
    ):
        force_x11 = request.param == GdkBackend.X11

        # Make sure cached value is up to date
        glibutil.process_pending_events()

        if settings_test_hook.force_x11_gdk_backend == force_x11:
            return request.param

        settings_test_hook.force_x11_gdk_backend = force_x11

        if extension_test_hook.AppRunning:
            app_dbus_actions.activate_action('quit', None)

            extension_test_hook.wait_property(
                'AppRunning',
                False,
                timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS
            )

        return request.param

    @pytest.fixture
    def window_size(self, settings_test_hook, request):
        settings_test_hook.window_size = request.param

        return request.param

    @pytest.fixture
    def window_position(self, settings_test_hook, request):
        settings_test_hook.window_position = request.param

        return request.param

    @pytest.fixture
    def window_maximize(self, settings_test_hook, request):
        settings_test_hook.window_maximize = request.param

        return request.param

    @pytest.fixture
    def window_monitor(
        self,
        settings_test_hook,
        display_config,
        current_monitor,
        primary_monitor,
        window_monitor_connector,
        request,
    ):
        if window_monitor_connector != -1:
            cached_monitors = display_config.cached_state.logical_monitors
            connector_name = cached_monitors[window_monitor_connector].connector
            settings_test_hook.window_monitor_connector = connector_name

        settings_test_hook.window_monitor = request.param

        return {
            WindowMonitor.CURRENT: current_monitor,
            WindowMonitor.PRIMARY: primary_monitor,
            WindowMonitor.CONNECTOR: window_monitor_connector,
        }[request.param]

    @pytest.fixture
    def workareas(
        self,
        shell_test_hook,
        monitor_config,  # monitor configuration must be applied before reading workareas!
    ):
        return shell_test_hook.Workareas

    @pytest.fixture
    def current_monitor(self, request, shell_test_hook, workareas):
        glibutil.process_pending_events()

        workarea = workareas[request.param]
        pointer = shell_test_hook.Pointer

        if pointer.x >= workarea.x and pointer.x <= workarea.x + workarea.width:
            if pointer.y >= workarea.y and pointer.y <= workarea.y + workarea.height:
                if shell_test_hook.GetCurrentMonitor() == request.param:
                    return request.param

        shell_test_hook.SetPointer(
            workarea.x + round(workarea.width / 2),
            workarea.y + round(workarea.height / 2),
        )

        if request.config.option.force_xvfb:
            if shell_test_hook.GetCurrentMonitor() != request.param:
                shell_test_hook.Eval(
                    'global.backend.get_monitor_manager().emit("monitors-changed-internal")'
                )

        assert shell_test_hook.GetCurrentMonitor() == request.param

        return request.param

    @pytest.fixture
    def workarea(self, workareas, window_monitor):
        return workareas[window_monitor]

    @pytest.fixture
    def unmaximized_rect(
        self,
        workarea,
        window_size,
        window_position,
        window_monitor,
        monitor_config,
    ):
        return compute_target_rect(
            window_size=window_size,
            window_position=window_position,
            workarea=workarea,
            round_to=int(monitor_config[window_monitor].scale)
        )

    @pytest.fixture
    def expected_rect(self, window_maximize, workarea, unmaximized_rect):
        return workarea if window_maximize else unmaximized_rect

    @pytest.fixture
    def expected_show_transitions(self, window_position, animation_mode):
        return animation_mode.expected_transitions(window_position)

    @pytest.fixture
    def expected_hide_transitions(self, window_position, animation_mode):
        return animation_mode.expected_transitions(window_position)

    @pytest.fixture
    def wait_idle(
        self,
        shell_test_hook,
        extension_test_hook,
        app_debug_dbus_interface,
    ):
        global wait_idle

        return functools.partial(
            wait_idle,
            shell_test_hook=shell_test_hook,
            extension_test_hook=extension_test_hook,
            app_debug_dbus_interface=app_debug_dbus_interface,
        )

    @pytest.fixture
    def max_size_allocations(self):
        return 1

    def test_show(
        self,
        unmaximized_rect,
        expected_rect,
        workarea,
        window_size,
        window_maximize,
        expected_show_transitions,
        expected_hide_transitions,
        max_size_allocations,
        app_debug_dbus_interface,
        extension_dbus_interface,
        extension_test_hook,
        shell_test_hook,
        wait_idle,
    ):
        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        glibutil.process_pending_events()

        assert extension_test_hook.HasWindow
        assert unmaximized_rect == extension_dbus_interface.TargetRect

        extension_test_hook.wait_property('RenderedFirstFrame', True)
        wait_idle()

        assert extension_test_hook.WindowRect == expected_rect
        assert extension_test_hook.seen_transitions == expected_show_transitions

        shell_test_hook.WaitLeisure()

        assert extension_test_hook.WindowRect == expected_rect
        assert extension_test_hook.seen_transitions == expected_show_transitions
        assert extension_test_hook.Transitions == set()

        extension_dbus_interface.Toggle()
        glibutil.process_pending_events()

        assert not extension_test_hook.HasWindow
        assert extension_test_hook.Transitions == expected_hide_transitions

        shell_test_hook.WaitLeisure()

        assert extension_test_hook.seen_transitions == expected_hide_transitions
        assert extension_test_hook.Transitions == set()

        app_debug_dbus_interface.reset_size_allocations()
        extension_dbus_interface.Toggle()
        extension_test_hook.wait_property('RenderedFirstFrame', True)
        wait_idle()

        assert extension_test_hook.WindowRect == expected_rect
        assert len(set(app_debug_dbus_interface.size_allocations)) <= max_size_allocations
        assert len(app_debug_dbus_interface.size_allocations) <= max_size_allocations + 1
        assert extension_test_hook.seen_transitions == expected_show_transitions

        shell_test_hook.WaitLeisure()

        assert extension_test_hook.WindowRect == expected_rect
        assert len(set(app_debug_dbus_interface.size_allocations)) <= max_size_allocations
        assert len(app_debug_dbus_interface.size_allocations) <= max_size_allocations + 1
        assert extension_test_hook.seen_transitions == expected_show_transitions
        assert extension_test_hook.Transitions == set()

    @pytest.mark.usefixtures('disable_animations')
    def test_maximize_unmaximize(
        self,
        unmaximized_rect,
        expected_rect,
        workarea,
        window_size,
        window_maximize,
        extension_dbus_interface,
        extension_test_hook,
        settings_test_hook,
        wait_idle,
    ):
        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        glibutil.process_pending_events()

        assert extension_test_hook.HasWindow
        assert unmaximized_rect == extension_dbus_interface.TargetRect

        extension_test_hook.wait_property('RenderedFirstFrame', True)
        wait_idle()

        assert extension_test_hook.WindowRect == expected_rect
        assert not extension_test_hook.seen_transitions

        if not window_maximize:
            settings_test_hook.window_maximize = True

            wait_idle()

        assert extension_test_hook.WindowRect == workarea
        assert settings_test_hook.window_maximize

        settings_test_hook.window_maximize = False

        wait_idle()

        assert extension_test_hook.WindowRect == unmaximized_rect
        assert not settings_test_hook.window_maximize

    @pytest.mark.usefixtures('disable_animations')
    def test_mouse_resize(
        self,
        unmaximized_rect,
        expected_rect,
        workarea,
        window_size,
        window_size2,
        window_position,
        window_maximize,
        window_monitor,
        monitor_config,
        extension_dbus_interface,
        extension_test_hook,
        shell_test_hook,
        wait_idle,
    ):
        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        glibutil.process_pending_events()

        assert extension_test_hook.HasWindow
        assert unmaximized_rect == extension_dbus_interface.TargetRect

        extension_test_hook.wait_property('RenderedFirstFrame', True)
        wait_idle()

        assert extension_test_hook.WindowRect == expected_rect
        assert not extension_test_hook.seen_transitions

        start = resize_point(expected_rect, window_position)

        expected_rect2 = compute_target_rect(
            window_size=window_size2,
            window_position=window_position,
            workarea=workarea,
            round_to=int(monitor_config[window_monitor].scale)
        )

        end = resize_point(expected_rect2, window_position)

        shell_test_hook.SetPointer(*start)

        try:
            shell_test_hook.MouseDown()

            wait_idle()

            assert extension_test_hook.WindowRect == expected_rect

            shell_test_hook.SetPointer(*end)

        finally:
            shell_test_hook.MouseUp()

        wait_idle()

        assert extension_test_hook.WindowRect == expected_rect2

    @pytest.mark.usefixtures('disable_animations')
    def test_resize_maximize_unmaximize(
        self,
        unmaximized_rect,
        workarea,
        window_size,
        window_size2,
        window_position,
        window_monitor,
        monitor_config,
        extension_dbus_interface,
        extension_test_hook,
        settings_test_hook,
        wait_idle,
    ):
        settings_test_hook.window_maximize = False

        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        glibutil.process_pending_events()

        assert extension_test_hook.HasWindow
        assert unmaximized_rect == extension_dbus_interface.TargetRect

        wait_idle()

        assert extension_test_hook.WindowRect == unmaximized_rect
        assert not extension_test_hook.seen_transitions

        expected_rect2 = compute_target_rect(
            window_size=window_size2,
            window_position=window_position,
            workarea=workarea,
            round_to=int(monitor_config[window_monitor].scale)
        )

        settings_test_hook.window_size = window_size2

        wait_idle()

        assert extension_test_hook.WindowRect == expected_rect2

        settings_test_hook.window_maximize = True

        wait_idle()

        assert extension_test_hook.WindowRect == workarea
        assert settings_test_hook.window_maximize

        settings_test_hook.window_maximize = False

        wait_idle()

        assert extension_test_hook.WindowRect == expected_rect2
        assert not settings_test_hook.window_maximize

    @classmethod
    def get_parametrization(cls, name):
        p = load_params(PARAMS_DIR / f'{name}.gen').filter('class', cls)
        # Reduce monitor config changes - more like in real use, and faster
        # Note: last order_by() has highest priority
        p = p.order_by('monitor1_scale').order_by('monitor0_scale')
        p = p.order_by('primary_monitor')
        p = p.order_by('layout_mode')  # Change requires restarting the app
        p = p.order_by('gdk_backend')  # Change requires restarting the app
        return p

    def pytest_generate_tests(self, metafunc):
        indirect = {
            'animation_mode',
            'gdk_backend',
            'current_monitor',
            'window_position',
            'window_size',
            'window_maximize',
            'window_monitor',
        }

        self.get_parametrization(metafunc.definition.originalname).apply(
            metafunc,
            indirect=list(indirect & set(metafunc.fixturenames))
        )


class TestX11(CommonTests, fixtures.GnomeSessionX11Fixtures):
    @pytest.fixture
    def monitor_layout(self, layout_mode, monitor0_scale, monitor1_scale):
        assert monitor1_scale == 0
        assert layout_mode == displayconfig.LayoutMode.PHYSICAL

        return (displayconfig.SimpleMonitorConfig(scale=monitor0_scale),)


class TestWayland(CommonTests, fixtures.GnomeSessionWaylandFixtures):
    @pytest.fixture
    def monitor_layout(self, layout_mode, monitor0_scale, monitor1_scale):
        assert monitor1_scale == 0

        return (displayconfig.SimpleMonitorConfig(scale=monitor0_scale),)

    @pytest.fixture
    def expected_show_transitions(
        self,
        window_position,
        animation_mode,
        shell_dbus_interface,
        gdk_backend
    ):
        if gdk_backend == GdkBackend.X11 and shell_dbus_interface.ShellVersion < (45,):
            # Known bug - no show/map animation on XWayland
            return set()

        return animation_mode.expected_transitions(window_position)


class TestWaylandTwoMonitors(TestWayland):
    @pytest.fixture
    def monitor_layout(self, layout_mode, monitor0_scale, monitor1_scale):
        m0 = displayconfig.SimpleMonitorConfig(scale=monitor0_scale)

        if layout_mode == displayconfig.LayoutMode.PHYSICAL:
            m1 = displayconfig.SimpleMonitorConfig(x=m0.width, scale=monitor1_scale)

        else:
            m1 = displayconfig.SimpleMonitorConfig(
                x=round(m0.width / monitor0_scale),
                scale=monitor1_scale
            )

        return m0, m1

    @pytest.fixture(scope='class')
    def initial_monitor_layout(self):
        m0 = displayconfig.SimpleMonitorConfig()
        m1 = displayconfig.SimpleMonitorConfig(x=m0.width)

        return m0, m1

    @pytest.fixture
    def max_size_allocations(self, gdk_backend, layout_mode, monitor_layout):
        if gdk_backend == GdkBackend.X11:
            return 1

        if layout_mode == displayconfig.LayoutMode.LOGICAL:
            return 1

        if monitor_layout[0].scale == monitor_layout[1].scale:
            return 1

        return 2
