# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
import pathlib
import shlex
import subprocess
import sys

import pytest

from . import glibutil, dbusutil, fixtures, geometry, shellhook


THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
SRC_DIR = THIS_DIR.parent

LOGGER = logging.getLogger(__name__)

GC_CYCLES = 2


def diff_heap(dump_old, dump_new, hide_node=[], hide_edge=[], gray_roots=True, weak_maps=True):
    ignore_args = [
        '--hide-edge',
        'dump_heap_dbus_invocation',
    ]

    if not gray_roots:
        ignore_args.append('--no-gray-roots')

    if not weak_maps:
        ignore_args.append('--no-weak-maps')

    for node in hide_node:
        ignore_args.extend(('--hide-node', node))

    for edge in hide_edge:
        ignore_args.extend(('--hide-edge', edge))

    heapgraph_argv = [
        sys.executable,
        str(SRC_DIR / 'tools' / 'heapgraph.py'),
        *ignore_args,
        '--diff-heap',
        str(dump_old),
        str(dump_new),
        'GObject',
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
    return heapgraph.stdout


class AppControl:
    def __init__(
        self,
        *,
        extension_dbus_interface,
        extension_test_hook,
        shell_test_hook,
        app_debug_dbus_interface,
    ):
        self.extension_dbus_interface = extension_dbus_interface
        self.extension_test_hook = extension_test_hook
        self.shell_test_hook = shell_test_hook
        self.app_debug_dbus_interface = app_debug_dbus_interface

    def activate(self):
        deadline = glibutil.Deadline(dbusutil.DEFAULT_LONG_TIMEOUT_MS)

        self.extension_dbus_interface.Activate(timeout=deadline.check_remaining_ms())

        self.extension_test_hook.wait_property(
            'RenderedFirstFrame',
            True,
            timeout=deadline.check_remaining_ms()
        )

        self.app_debug_dbus_interface.wait_name_owner(deadline.check_remaining_ms())
        self.app_debug_dbus_interface.WaitFrame(timeout=deadline.check_remaining_ms())

        self.shell_test_hook.Later(
            shellhook.LaterType.RESIZE,
            timeout=deadline.check_remaining_ms()
        )

        self.app_debug_dbus_interface.WaitIdle(timeout=deadline.check_remaining_ms())
        self.shell_test_hook.WaitLeisure(timeout=deadline.check_remaining_ms())

        # Some things in Gtk (for example, parsing in Vte) are scheduled by timer only
        self.app_debug_dbus_interface.WaitTime(100)

    def quit(self):
        self.app_debug_dbus_interface.ActivateAction('app.quit')

        deadline = glibutil.Deadline(dbusutil.DEFAULT_LONG_TIMEOUT_MS)

        while self.is_running():
            self.extension_test_hook.wait_property(
                'AppRunning',
                False,
                timeout=deadline.check_remaining_ms()
            )

            self.extension_test_hook.wait_property(
                'HasWindow',
                False,
                timeout=deadline.check_remaining_ms()
            )

    def is_running(self):
        return self.extension_test_hook.AppRunning or self.extension_test_hook.HasWindow


@pytest.mark.usefixtures('check_log', 'screenshot', 'hide_overview', 'disable_animations')
class TestApp(fixtures.GnomeSessionWaylandFixtures):
    @pytest.fixture(autouse=True)
    def window_settings(self, settings_test_hook):
        settings_test_hook.window_size = 1.0
        settings_test_hook.window_maximize = True

    @pytest.fixture
    def system_color_scheme(self, shell_test_hook, request):
        shell_test_hook.ColorScheme = request.param

        return request.param

    @pytest.fixture
    def app_color_scheme(self, settings_test_hook, request):
        settings_test_hook.theme_variant = request.param

        return request.param

    @pytest.fixture
    def window_above(self, settings_test_hook, request):
        settings_test_hook.window_above = request.param

        return request.param

    @pytest.fixture
    def hide_when_focus_lost(self, settings_test_hook, request):
        settings_test_hook.hide_when_focus_lost = request.param

        return request.param

    @pytest.fixture
    def app_control(
        self,
        extension_dbus_interface,
        extension_test_hook,
        shell_test_hook,
        app_debug_dbus_interface,
    ):
        return AppControl(
            extension_dbus_interface=extension_dbus_interface,
            extension_test_hook=extension_test_hook,
            shell_test_hook=shell_test_hook,
            app_debug_dbus_interface=app_debug_dbus_interface,
        )

    @pytest.fixture
    def app_active(self, app_control):
        app_control.activate()

    @pytest.mark.usefixtures('system_color_scheme', 'app_color_scheme', 'hide', 'app_active')
    @pytest.mark.parametrize(
        'system_color_scheme',
        ('prefer-dark', 'prefer-light', 'default'),
        indirect=True
    )
    @pytest.mark.parametrize(
        'app_color_scheme',
        ('system', 'light', 'dark'),
        indirect=True
    )
    def test_dark_mode(
        self,
        system_color_scheme,
        app_color_scheme,
        extension_test_hook,
        shell_test_hook,
    ):
        workarea = shell_test_hook.Workareas[0]

        if app_color_scheme == 'system':
            dark = system_color_scheme == 'prefer-dark'
        else:
            dark = app_color_scheme == 'dark'

        assert extension_test_hook.WindowRect == workarea

        red, green, blue, alpha = shell_test_hook.PickColor(*workarea.center())

        if dark:
            assert red < 127 and green < 127 and blue < 127
        else:
            assert red > 128 and green > 128 and blue > 128

    @pytest.fixture(scope='class')
    def extension_path(self, extension_init):
        return pathlib.Path(extension_init['path'])

    @pytest.fixture(scope='class')
    def launcher_path(self, extension_path):
        return extension_path / 'bin' / 'com.github.amezin.ddterm'

    @pytest.mark.usefixtures('window_above', 'hide_when_focus_lost', 'hide', 'app_active')
    @pytest.mark.parametrize('window_above', (True, False), indirect=True)
    @pytest.mark.parametrize('hide_when_focus_lost', (True, False), indirect=True)
    def test_wl_clipboard(
        self,
        process_launcher,
        dbus_environment,
        shell_test_hook,
        app_debug_dbus_interface,
        launcher_path,
        tmp_path,
        request,
    ):
        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'

        n_tabs = app_debug_dbus_interface.NumTabs

        process_launcher.run(
            str(launcher_path),
            '--wait',
            '--no-environment',
            '--keep-open',
            '--',
            'sh',
            '-c',
            f'echo wl-clipboard-test-content | {shlex.quote(str(request.config.option.wl_copy))}',
            env=dbus_environment,
        )

        shell_test_hook.Later(shellhook.LaterType.SYNC_STACK)

        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'

        test_file = tmp_path / 'wl-clipboard-test-file'

        process_launcher.run(
            str(launcher_path),
            '--wait',
            '--no-environment',
            '--keep-open',
            '--',
            'sh',
            '-c',
            f'{shlex.quote(str(request.config.option.wl_paste))} >{shlex.quote(str(test_file))}',
            env=dbus_environment,
        )

        shell_test_hook.Later(shellhook.LaterType.SYNC_STACK)

        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'
        assert test_file.read_text() == 'wl-clipboard-test-content\n\n'

        app_debug_dbus_interface.wait_property('NumTabs', n_tabs + 2)
        app_debug_dbus_interface.WaitIdle()

    @pytest.mark.usefixtures('app_active')
    @pytest.mark.parametrize('wait', [True, False])
    def test_cli_leak(
        self,
        process_launcher,
        dbus_environment,
        app_debug_dbus_interface,
        launcher_path,
        tmp_path,
        wait
    ):
        n_tabs = app_debug_dbus_interface.NumTabs
        test_file = tmp_path / 'testfile'
        dump_pre = tmp_path / 'heap-pre.dump'
        dump_post = tmp_path / 'heap-post.dump'

        for dump_path in [dump_pre, dump_post]:
            with app_debug_dbus_interface.watch_property('NumTabs') as num_tabs_watch:
                process_launcher.run(
                    str(launcher_path),
                    *(['--wait'] if wait else []),
                    '--',
                    'sh',
                    '-c',
                    f'echo 1 >{shlex.quote(str(test_file))}',
                    env=dbus_environment,
                )

                if not wait:
                    assert num_tabs_watch.get() == n_tabs + 1

                assert test_file.read_text() == '1\n'

                if wait:
                    assert num_tabs_watch.get() == n_tabs + 1

            dump_pre = tmp_path / 'heap-pre.dump'
            app_debug_dbus_interface.wait_property('NumTabs', n_tabs)
            app_debug_dbus_interface.WaitFrame()

            for i in range(GC_CYCLES):
                app_debug_dbus_interface.GC()
                app_debug_dbus_interface.WaitIdle()

            app_debug_dbus_interface.DumpHeap(dump_path)

        assert diff_heap(
            dump_pre,
            dump_post,
            hide_edge=['window_title_binding', 'cacheir-object']
        ) == ''

    @pytest.mark.usefixtures('app_active')
    def test_prefs_leak(
        self,
        app_debug_dbus_interface,
        shell_test_hook,
        tmp_path,
    ):
        dump_pre = tmp_path / 'heap-pre.dump'
        dump_post = tmp_path / 'heap-post.dump'

        for dump_path in [dump_pre, dump_post]:
            with shell_test_hook.watch_signal('WindowShown') as window_shown:
                app_debug_dbus_interface.ActivateAction('app.preferences')
                window_shown.get()

            with shell_test_hook.watch_signal('WindowUnmanaged') as window_unmanaged:
                shell_test_hook.key_down(shellhook.Key.ESCAPE)

                try:
                    window_unmanaged.get()
                finally:
                    shell_test_hook.key_up(shellhook.Key.ESCAPE)

            app_debug_dbus_interface.WaitFrame()

            for i in range(GC_CYCLES):
                app_debug_dbus_interface.GC()
                app_debug_dbus_interface.WaitIdle()

            app_debug_dbus_interface.DumpHeap(dump_path)

        assert diff_heap(
            dump_pre,
            dump_post,
            hide_edge=['cacheir-object']
        ) == ''

    @pytest.mark.parametrize('script_name', ('gtk3.js', 'gtk4.js'))
    def test_prefs_leak2(
        self,
        dbus_environment,
        process_launcher,
        extension_path,
        tmp_path,
        script_name,
        pytestconfig
    ):
        dump_pre = tmp_path / 'heap-pre.dump'
        dump_post = tmp_path / 'heap-post.dump'

        process_launcher.run(
            str(pytestconfig.option.gjs),
            '-m',
            str(SRC_DIR / 'ddterm' / 'pref' / 'test' / script_name),
            '--base-url',
            extension_path.as_uri(),
            '--heap-dump-1',
            str(dump_pre),
            '--heap-dump-2',
            str(dump_post),
            env=dbus_environment,
        )

        assert diff_heap(
            dump_pre,
            dump_post,
            hide_edge=['cacheir-object'],
        ) == ''

    @pytest.mark.usefixtures('hide', 'app_active')
    @pytest.mark.parametrize('widget', ('terminal', 'tab'))
    def test_context_menu_leak(
        self,
        app_debug_dbus_interface,
        shell_test_hook,
        tmp_path,
        widget,
    ):
        workarea = shell_test_hook.Workareas[0]

        widget_location = {
            'terminal': workarea.center(),
            'tab': geometry.Point(workarea.center().x, workarea.y + workarea.height - 16)
        }[widget]

        dump_pre = tmp_path / 'heap-pre.dump'
        dump_post = tmp_path / 'heap-post.dump'

        for dump_path in [dump_pre, dump_post]:
            shell_test_hook.SetPointer(*widget_location)

            app_debug_dbus_interface.WaitFrame()

            with shell_test_hook.watch_signal('WindowCreated') as window_created:
                shell_test_hook.mouse_down(shellhook.MouseButton.SECONDARY)
                shell_test_hook.mouse_up(shellhook.MouseButton.SECONDARY)

                window_created.get()

            shell_test_hook.SetPointer(widget_location.x - 1, widget_location.y)

            app_debug_dbus_interface.WaitFrame()

            with shell_test_hook.watch_signal('WindowUnmanaged') as window_unmanaged:
                shell_test_hook.mouse_down()
                shell_test_hook.mouse_up()

                window_unmanaged.get()

            app_debug_dbus_interface.WaitFrame()

            for i in range(GC_CYCLES):
                app_debug_dbus_interface.GC()
                app_debug_dbus_interface.WaitIdle()

            app_debug_dbus_interface.DumpHeap(dump_path)

        assert diff_heap(
            dump_pre,
            dump_post,
            hide_edge=['cacheir-object'],
        ) == ''

    @pytest.mark.usefixtures('app_active')
    def test_tab_leak(
        self,
        app_debug_dbus_interface,
        shell_test_hook,
        tmp_path,
    ):
        n_tabs = app_debug_dbus_interface.NumTabs
        dump_pre = tmp_path / 'heap-pre.dump'
        dump_post = tmp_path / 'heap-post.dump'

        for dump_path in [dump_pre, dump_post]:
            app_debug_dbus_interface.ActivateAction('notebook.new-tab')
            app_debug_dbus_interface.wait_property('NumTabs', n_tabs + 1)

            app_debug_dbus_interface.WaitFrame()

            app_debug_dbus_interface.ActivateAction('page.close')
            app_debug_dbus_interface.wait_property('NumTabs', n_tabs)

            app_debug_dbus_interface.WaitFrame()

            for i in range(GC_CYCLES):
                app_debug_dbus_interface.GC()
                app_debug_dbus_interface.WaitIdle()

            app_debug_dbus_interface.DumpHeap(dump_path)

        assert diff_heap(
            dump_pre,
            dump_post,
            hide_edge=['window_title_binding', 'cacheir-object']
        ) == ''

    @pytest.mark.usefixtures('hide', 'app_active')
    def test_tab_and_context_menu_leak(
        self,
        app_debug_dbus_interface,
        shell_test_hook,
        tmp_path,
    ):
        n_tabs = app_debug_dbus_interface.NumTabs
        workarea = shell_test_hook.Workareas[0]
        widget_location = workarea.center()

        dump_pre = tmp_path / 'heap-pre.dump'
        dump_post = tmp_path / 'heap-post.dump'

        for dump_path in [dump_pre, dump_post]:
            app_debug_dbus_interface.ActivateAction('notebook.new-tab')
            app_debug_dbus_interface.wait_property('NumTabs', n_tabs + 1)

            shell_test_hook.SetPointer(*widget_location)

            app_debug_dbus_interface.WaitFrame()

            with shell_test_hook.watch_signal('WindowCreated') as window_created:
                shell_test_hook.mouse_down(shellhook.MouseButton.SECONDARY)
                shell_test_hook.mouse_up(shellhook.MouseButton.SECONDARY)

                window_created.get()

            shell_test_hook.SetPointer(widget_location.x - 1, widget_location.y)

            app_debug_dbus_interface.WaitFrame()

            with shell_test_hook.watch_signal('WindowUnmanaged') as window_unmanaged:
                shell_test_hook.mouse_down()
                shell_test_hook.mouse_up()

                window_unmanaged.get()

            app_debug_dbus_interface.WaitFrame()

            app_debug_dbus_interface.ActivateAction('page.close')
            app_debug_dbus_interface.wait_property('NumTabs', n_tabs)

            app_debug_dbus_interface.WaitFrame()

            for i in range(GC_CYCLES):
                app_debug_dbus_interface.GC()
                app_debug_dbus_interface.WaitIdle()

            app_debug_dbus_interface.DumpHeap(dump_path)

        assert diff_heap(
            dump_pre,
            dump_post,
            hide_edge=['window_title_binding', 'cacheir-object'],
        ) == ''

    @pytest.fixture(scope='class')
    def session_path(self, xdg_cache_home):
        return pathlib.Path(xdg_cache_home) / 'com.github.amezin.ddterm' / 'session'

    def test_session_save_restore(
        self,
        app_control,
        app_debug_dbus_interface,
        dbus_environment,
        process_launcher,
        session_path,
        launcher_path,
    ):
        if app_control.is_running():
            app_control.quit()

        session_path.unlink(missing_ok=True)
        app_control.activate()

        process_launcher.run(
            str(launcher_path),
            '--wait',
            '--keep-open',
            '--title',
            'Custom title',
            '--',
            'sh',
            '-c',
            'echo Test',
            env=dbus_environment,
        )

        process_launcher.run(
            str(launcher_path),
            '--wait',
            '--keep-open',
            '--',
            'sh',
            '-c',
            "echo '\033]2;Title from shell\007Test output'",
            env=dbus_environment,
        )

        app_debug_dbus_interface.wait_property('NumTabs', 3)

        assert app_debug_dbus_interface.Eval(
            'this.window.active_notebook.view.get_nth_page(0).child.terminal.child_pid'
        ) != 0

        assert app_debug_dbus_interface.Eval(
            'this.window.active_notebook.view.get_nth_page(1).child.terminal.child_pid'
        ) == 0

        assert app_debug_dbus_interface.Eval(
            'this.window.active_notebook.view.get_nth_page(2).child.terminal.child_pid'
        ) == 0

        # Wait for VTE parser
        app_debug_dbus_interface.WaitTime(100)

        state1 = app_debug_dbus_interface.Eval('this.window.serialize_state().recursiveUnpack()')
        pages1 = state1['notebook1']['pages']

        assert len(pages1) == 3

        assert 'banner' not in pages1[0]
        assert pages1[0]['use-custom-title'] is False

        assert 'banner' in pages1[1]
        assert pages1[1]['use-custom-title'] is True
        assert pages1[1]['title'] == 'Custom title'
        assert pages1[1]['text'] == 'Test'

        assert 'banner' in pages1[2]
        assert pages1[2]['use-custom-title'] is False
        assert pages1[2]['title'] == 'Title from shell'
        assert pages1[2]['text'] == 'Test output'

        app_control.quit()
        app_control.activate()

        assert app_debug_dbus_interface.NumTabs == 3

        assert app_debug_dbus_interface.Eval(
            'this.window.active_notebook.view.get_nth_page(0).child.terminal.child_pid'
        ) != 0

        assert app_debug_dbus_interface.Eval(
            'this.window.active_notebook.view.get_nth_page(1).child.terminal.child_pid'
        ) == 0

        assert app_debug_dbus_interface.Eval(
            'this.window.active_notebook.view.get_nth_page(2).child.terminal.child_pid'
        ) == 0

        state2 = app_debug_dbus_interface.Eval('this.window.serialize_state().recursiveUnpack()')
        pages2 = state2['notebook1']['pages']

        del pages1[0]['title']
        del pages1[0]['text']
        del pages2[0]['title']
        del pages2[0]['text']

        assert state1 == state2
