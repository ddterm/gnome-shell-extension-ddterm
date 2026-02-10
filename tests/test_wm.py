# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

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

MONITOR_DISABLED = -1


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

    @property
    def maximize_property(self):
        if self == WindowPosition.LEFT or self == WindowPosition.RIGHT:
            return 'MaximizedHorizontally'
        else:
            return 'MaximizedVertically'


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
    if window_size == 1:
        return geometry.Rect(*workarea)

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
    edge_offset = 2

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
    deadline = glibutil.Deadline(timeout)
    app_debug_dbus_interface.wait_name_owner(timeout)

    LOGGER.info(
        'Waiting for %r consecutive frames with no window geometry changes',
        num_idle_frames
    )

    counter = 0

    def reset(signal, source, *args):
        LOGGER.info('Received signal %s%r on %r, restarting wait', signal, args, source)
        nonlocal counter
        counter = 0

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


class CustomSortCollector(pytest.Class):
    def collect(self):
        collected = super().collect()

        # Sort tests to reduce monitor config changes and app restarts.
        # Note: last parameter has highest priority.

        for param_name in (
            'gdk_backend',
            'primary_monitor',
            'monitor1_scale',
            'monitor1_transform',
            'monitor0_scale',
            'monitor0_transform',
            'layout_mode',
        ):
            collected.sort(key=lambda item: item.callspec.params[param_name])

        return collected


@pytest.mark.usefixtures('dummy_app', 'check_log', 'screenshot', 'hide', 'gdk_backend')
class CommonTests:
    def pytest_pycollect_makeitem(self, collector, name, obj):
        return CustomSortCollector.from_parent(collector, name=name, obj=obj)

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
        glibutil.dispatch_pending_sources()

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
    def window_above(self, settings_test_hook, request):
        settings_test_hook.window_above = request.param

        return request.param

    @pytest.fixture
    def window_stick(self, settings_test_hook, request):
        settings_test_hook.window_stick = request.param

        return request.param

    @pytest.fixture
    def window_skip_taskbar(self, settings_test_hook, request):
        settings_test_hook.window_skip_taskbar = request.param

        return request.param

    @pytest.fixture
    def workareas(
        self,
        shell_test_hook,
        monitor_config,  # monitor configuration must be applied before reading workareas!
    ):
        return shell_test_hook.Workareas

    @pytest.fixture
    def current_monitor(self, request, shell_test_hook, workareas):
        glibutil.dispatch_pending_sources()

        workarea = workareas[request.param]
        pointer = shell_test_hook.Pointer

        if workarea.contains(pointer):
            if shell_test_hook.GetCurrentMonitor() == request.param:
                return request.param

        shell_test_hook.SetPointer(*workarea.center())

        assert shell_test_hook.GetCurrentMonitor() == request.param

        return request.param

    @pytest.fixture
    def workarea(self, workareas, window_monitor):
        return workareas[window_monitor]

    @pytest.fixture
    def monitor_scale(self, monitor_config, window_monitor):
        return monitor_config[window_monitor].scale

    @pytest.fixture
    def unmaximized_rect(
        self,
        workarea,
        window_size,
        window_position,
        monitor_scale,
    ):
        return compute_target_rect(
            window_size=window_size,
            window_position=window_position,
            workarea=workarea,
            round_to=int(monitor_scale)
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

    @pytest.fixture(scope='class')
    def workspaces_only_on_primary(self, shell_test_hook):
        return shell_test_hook.Eval('imports.gi.Meta.prefs_get_workspaces_only_on_primary()')

    @pytest.fixture
    def expected_on_all_workspaces(
        self,
        window_stick,
        primary_monitor,
        window_monitor,
        workspaces_only_on_primary,
        shell_dbus_interface,
    ):
        if workspaces_only_on_primary and primary_monitor != window_monitor:
            if shell_dbus_interface.ShellVersion[0] >= 49:
                return {True, False}
            else:
                return {True}

        return {window_stick}

    @pytest.fixture
    def wait_idle(
        self,
        shell_test_hook,
        extension_test_hook,
        app_debug_dbus_interface,
    ):
        return functools.partial(
            wait_idle,
            shell_test_hook=shell_test_hook,
            extension_test_hook=extension_test_hook,
            app_debug_dbus_interface=app_debug_dbus_interface,
        )

    @pytest.fixture
    def max_size_allocations(self):
        return 1

    @pytest.fixture
    def max_window_rect_changes(self):
        return 1

    def test_show(
        self,
        unmaximized_rect,
        expected_rect,
        monitor_scale,
        window_maximize,
        window_above,
        expected_on_all_workspaces,
        window_skip_taskbar,
        expected_show_transitions,
        expected_hide_transitions,
        max_size_allocations,
        max_window_rect_changes,
        app_debug_dbus_interface,
        extension_dbus_interface,
        extension_test_hook,
        shell_test_hook,
        wait_idle,
        gdk_backend,
    ):
        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        glibutil.dispatch_pending_sources()

        assert extension_test_hook.HasWindow
        assert unmaximized_rect == extension_dbus_interface.TargetRect
        assert extension_test_hook.ClientType == gdk_backend
        assert monitor_scale == extension_dbus_interface.TargetMonitorScale

        extension_test_hook.wait_property('RenderedFirstFrame', True)
        wait_idle()

        assert extension_test_hook.WindowRect == expected_rect
        assert extension_test_hook.WindowSkipTaskbar == window_skip_taskbar
        assert extension_test_hook.WindowOnAllWorkspaces in expected_on_all_workspaces
        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'
        assert extension_test_hook.seen_transitions == expected_show_transitions

        if not window_maximize:
            assert extension_test_hook.WindowAbove == window_above

        shell_test_hook.WaitLeisure()

        assert extension_test_hook.WindowRect == expected_rect
        assert extension_test_hook.WindowSkipTaskbar == window_skip_taskbar
        assert extension_test_hook.WindowOnAllWorkspaces in expected_on_all_workspaces
        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'
        assert extension_test_hook.seen_transitions == expected_show_transitions
        assert extension_test_hook.Transitions == set()

        if not window_maximize:
            assert extension_test_hook.WindowAbove == window_above

        extension_dbus_interface.Toggle()
        glibutil.dispatch_pending_sources()

        assert not extension_test_hook.HasWindow

        shell_test_hook.WaitLeisure()

        assert extension_test_hook.seen_transitions == expected_hide_transitions
        assert extension_test_hook.Transitions == set()

        app_debug_dbus_interface.reset_size_allocations()
        extension_dbus_interface.Toggle()
        extension_test_hook.wait_property('RenderedFirstFrame', True)

        if max_window_rect_changes > 1:
            app_debug_dbus_interface.WaitFrame()
            shell_test_hook.Later(shellhook.LaterType.RESIZE)

        assert extension_test_hook.WindowRect == expected_rect
        assert len(set(app_debug_dbus_interface.size_allocations)) <= max_size_allocations
        assert len(app_debug_dbus_interface.size_allocations) <= max_size_allocations + 1
        assert len(set(extension_test_hook.window_rect_snapshots)) <= max_window_rect_changes
        assert len(extension_test_hook.window_rect_snapshots) <= max_window_rect_changes + 1
        assert extension_test_hook.WindowSkipTaskbar == window_skip_taskbar
        assert extension_test_hook.WindowOnAllWorkspaces in expected_on_all_workspaces
        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'

        if not window_maximize:
            assert extension_test_hook.WindowAbove == window_above

        wait_idle()

        assert extension_test_hook.WindowRect == expected_rect
        assert len(set(app_debug_dbus_interface.size_allocations)) <= max_size_allocations
        assert len(app_debug_dbus_interface.size_allocations) <= max_size_allocations + 1
        assert len(set(extension_test_hook.window_rect_snapshots)) <= max_window_rect_changes
        assert len(extension_test_hook.window_rect_snapshots) <= max_window_rect_changes + 1
        assert extension_test_hook.WindowSkipTaskbar == window_skip_taskbar
        assert extension_test_hook.WindowOnAllWorkspaces in expected_on_all_workspaces
        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'
        assert extension_test_hook.seen_transitions == expected_show_transitions

        if not window_maximize:
            assert extension_test_hook.WindowAbove == window_above

        shell_test_hook.WaitLeisure()

        assert extension_test_hook.WindowRect == expected_rect
        assert len(set(app_debug_dbus_interface.size_allocations)) <= max_size_allocations
        assert len(app_debug_dbus_interface.size_allocations) <= max_size_allocations + 1
        assert len(set(extension_test_hook.window_rect_snapshots)) <= max_window_rect_changes
        assert len(extension_test_hook.window_rect_snapshots) <= max_window_rect_changes + 1
        assert extension_test_hook.WindowSkipTaskbar == window_skip_taskbar
        assert extension_test_hook.WindowOnAllWorkspaces in expected_on_all_workspaces
        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'
        assert extension_test_hook.seen_transitions == expected_show_transitions
        assert extension_test_hook.Transitions == set()

        if not window_maximize:
            assert extension_test_hook.WindowAbove == window_above

    @pytest.mark.usefixtures('disable_animations')
    def test_maximize_unmaximize(
        self,
        unmaximized_rect,
        expected_rect,
        workarea,
        monitor_scale,
        window_maximize,
        window_above,
        window_skip_taskbar,
        expected_on_all_workspaces,
        extension_dbus_interface,
        extension_test_hook,
        settings_test_hook,
        shell_test_hook,
        wait_idle,
        gdk_backend,
    ):
        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        glibutil.dispatch_pending_sources()

        assert extension_test_hook.HasWindow
        assert unmaximized_rect == extension_dbus_interface.TargetRect
        assert extension_test_hook.ClientType == gdk_backend
        assert monitor_scale == extension_dbus_interface.TargetMonitorScale

        extension_test_hook.wait_property('RenderedFirstFrame', True)
        wait_idle()

        assert extension_test_hook.WindowRect == expected_rect
        assert not extension_test_hook.seen_transitions
        assert extension_test_hook.WindowSkipTaskbar == window_skip_taskbar
        assert extension_test_hook.WindowOnAllWorkspaces in expected_on_all_workspaces
        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'

        if not window_maximize:
            assert extension_test_hook.WindowAbove == window_above
            settings_test_hook.window_maximize = True

            wait_idle()

        assert extension_test_hook.WindowRect == workarea
        assert settings_test_hook.window_maximize

        settings_test_hook.window_maximize = False

        wait_idle()

        assert extension_test_hook.WindowRect == unmaximized_rect
        assert not settings_test_hook.window_maximize
        assert extension_test_hook.WindowAbove == window_above
        assert extension_test_hook.WindowSkipTaskbar == window_skip_taskbar
        assert extension_test_hook.WindowOnAllWorkspaces in expected_on_all_workspaces
        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'

    @pytest.mark.usefixtures('disable_animations')
    def test_mouse_resize(
        self,
        unmaximized_rect,
        expected_rect,
        workarea,
        window_maximize,
        window_size,
        window_size2,
        window_position,
        monitor_scale,
        extension_dbus_interface,
        extension_test_hook,
        shell_dbus_interface,
        shell_test_hook,
        wait_idle,
        settings_test_hook,
        gdk_backend,
    ):
        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        glibutil.dispatch_pending_sources()

        assert extension_test_hook.HasWindow
        assert unmaximized_rect == extension_dbus_interface.TargetRect
        assert extension_test_hook.ClientType == gdk_backend
        assert monitor_scale == extension_dbus_interface.TargetMonitorScale

        extension_test_hook.wait_property('RenderedFirstFrame', True)
        wait_idle()
        shell_test_hook.WaitLeisure()

        assert extension_test_hook.WindowRect == expected_rect
        assert not extension_test_hook.seen_transitions
        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'

        start = resize_point(expected_rect, window_position)

        expected_rect_resized = compute_target_rect(
            window_size=window_size2,
            window_position=window_position,
            workarea=workarea,
            round_to=int(monitor_scale)
        )

        end = resize_point(expected_rect_resized, window_position)

        shell_test_hook.SetPointer(*start)

        try:
            shell_test_hook.mouse_down()
            shell_test_hook.wait_property('GrabActive', True)
            extension_test_hook.wait_property(window_position.maximize_property, False)

            wait_idle()
            shell_test_hook.WaitLeisure()

            assert extension_test_hook.WindowRect == expected_rect

            shell_test_hook.SetPointer(*end)
            extension_test_hook.wait_property('WindowRect', expected_rect_resized)

            wait_idle()

            assert extension_test_hook.WindowRect == expected_rect_resized

        finally:
            shell_test_hook.mouse_up()
            shell_test_hook.wait_property('GrabActive', False)

        wait_idle()

        assert settings_test_hook.window_size == pytest.approx(
            window_size2,
            abs=monitor_scale / min(workarea.width, workarea.height)
        )

        assert extension_test_hook.WindowRect == compute_target_rect(
            window_size=settings_test_hook.window_size,
            window_position=window_position,
            workarea=workarea,
            round_to=int(monitor_scale)
        )

    @pytest.mark.usefixtures('disable_animations')
    def test_resize_maximize_unmaximize(
        self,
        unmaximized_rect,
        workarea,
        window_size,
        window_size2,
        window_position,
        monitor_scale,
        extension_dbus_interface,
        extension_test_hook,
        settings_test_hook,
        shell_test_hook,
        wait_idle,
        gdk_backend,
    ):
        settings_test_hook.window_maximize = False

        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        glibutil.dispatch_pending_sources()

        assert extension_test_hook.HasWindow
        assert unmaximized_rect == extension_dbus_interface.TargetRect
        assert extension_test_hook.ClientType == gdk_backend
        assert monitor_scale == extension_dbus_interface.TargetMonitorScale

        wait_idle()

        assert extension_test_hook.WindowRect == unmaximized_rect
        assert not extension_test_hook.seen_transitions
        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'

        expected_rect2 = compute_target_rect(
            window_size=window_size2,
            window_position=window_position,
            workarea=workarea,
            round_to=int(monitor_scale)
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
        return load_params(PARAMS_DIR / f'{name}.gen').filter('class', cls)

    def pytest_generate_tests(self, metafunc):
        p = self.get_parametrization(metafunc.definition.originalname)

        p.apply(metafunc, indirect=list(set(p.argnames) & set(dir(self))))


class TestX11(CommonTests, fixtures.GnomeSessionX11Fixtures):
    @pytest.fixture
    def monitor_layout(
        self,
        layout_mode,
        monitor0_scale,
        monitor0_transform,
        monitor1_scale,
        monitor1_transform
    ):
        assert monitor1_scale == 0
        assert monitor0_transform == displayconfig.Transform.NORMAL
        assert monitor1_transform == MONITOR_DISABLED
        assert layout_mode == displayconfig.LayoutMode.PHYSICAL

        return (displayconfig.SimpleMonitorConfig(scale=monitor0_scale),)

    @pytest.fixture
    def gdk_backend(self, request):
        assert request.param == GdkBackend.X11

        return request.param


class TestWayland(CommonTests, fixtures.GnomeSessionWaylandFixtures):
    @pytest.fixture
    def monitor_layout(
        self,
        layout_mode,
        monitor0_scale,
        monitor0_transform,
        monitor1_scale,
        monitor1_transform
    ):
        assert monitor1_scale == 0
        assert monitor1_transform == MONITOR_DISABLED

        return (
            displayconfig.SimpleMonitorConfig(scale=monitor0_scale, transform=monitor0_transform),
        )

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
        glibutil.dispatch_pending_sources()

        if settings_test_hook.force_x11_gdk_backend == force_x11:
            return request.param

        if extension_test_hook.AppRunning:
            app_dbus_actions.activate_action('quit', None)

            extension_test_hook.wait_property(
                'AppRunning',
                False,
                timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS
            )

        settings_test_hook.force_x11_gdk_backend = force_x11

        return request.param


class TestWaylandTwoMonitors(TestWayland):
    @pytest.fixture
    def monitor_layout(
        self,
        layout_mode,
        monitor0_scale,
        monitor0_transform,
        monitor1_scale,
        monitor1_transform
    ):
        m0 = displayconfig.SimpleMonitorConfig(scale=monitor0_scale, transform=monitor0_transform)

        if monitor0_transform in (
            displayconfig.Transform.NORMAL,
            displayconfig.Transform.FLIPPED,
            displayconfig.Transform.ROTATE_180,
            displayconfig.Transform.ROTATE_180_FLIPPED,
        ):
            m0_size = m0.width
        else:
            m0_size = m0.height

        if layout_mode == displayconfig.LayoutMode.PHYSICAL:
            m1 = displayconfig.SimpleMonitorConfig(
                x=m0_size,
                scale=monitor1_scale,
                transform=monitor1_transform,
            )

        else:
            m1 = displayconfig.SimpleMonitorConfig(
                x=round(m0_size / monitor0_scale),
                scale=monitor1_scale,
                transform=monitor1_transform,
            )

        return m0, m1

    @pytest.fixture(scope='class')
    def initial_monitor_layout(self):
        m0 = displayconfig.SimpleMonitorConfig()
        m1 = displayconfig.SimpleMonitorConfig(x=m0.width)

        return m0, m1

    @pytest.fixture
    def max_size_allocations(
        self,
        gdk_backend,
        layout_mode,
        monitor_layout,
        window_monitor,
        current_monitor,
        shell_dbus_interface,
    ):
        if gdk_backend == GdkBackend.X11:
            return 1

        if layout_mode == displayconfig.LayoutMode.LOGICAL:
            return 1

        if monitor_layout[0].scale == monitor_layout[1].scale:
            return 1

        if window_monitor == current_monitor:
            return 1

        return 2

    @pytest.fixture
    def max_window_rect_changes(self, max_size_allocations):
        return max_size_allocations


@pytest.mark.usefixtures('check_log')
class TestWaylandNoMonitors(fixtures.GnomeSessionWaylandFixtures):
    @pytest.fixture(scope='class')
    def initial_monitor_layout(self):
        return []

    @pytest.fixture(scope='class')
    def shell_init(self, disable_extension_updates):
        pass

    def test_smoke(self, extension_init):
        pass
