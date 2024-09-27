import logging
import pathlib
import shlex
import subprocess
import sys

import pytest

from . import dbusutil, fixtures, shellhook


THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
SRC_DIR = THIS_DIR.parent

LOGGER = logging.getLogger(__name__)


def compare_heap_dumps(dump_pre, dump_post, hide_node=[], hide_edge=[]):
    ignore_args = [
        '--no-gray-roots',
        '--no-weak-maps',
    ]

    for node in hide_node:
        ignore_args.extend(('--hide-node', node))

    for edge in hide_edge:
        ignore_args.extend(('--hide-edge', edge))

    heapgraph_argv = [
        sys.executable,
        str(SRC_DIR / 'tools' / 'heapgraph.py'),
        *ignore_args,
        '--diff-heap',
        str(dump_pre),
        str(dump_post),
        'GObject'
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


@pytest.mark.usefixtures('screenshot', 'hide_overview', 'disable_animations')
class TestApp(fixtures.GnomeSessionWaylandFixtures):
    @pytest.fixture(autouse=True)
    def window_settings(self, settings_test_hook):
        settings_test_hook.window_size = 1.0
        settings_test_hook.window_maximize = True

    @pytest.fixture
    def color_scheme(self, shell_test_hook, request):
        shell_test_hook.ColorScheme = request.param

        return request.param

    @pytest.fixture
    def window_above(self, settings_test_hook, request):
        settings_test_hook.window_above = request.param

        return request.param

    @pytest.fixture
    def hide_when_focus_lost(self, settings_test_hook, request):
        settings_test_hook.hide_when_focus_lost = request.param

        return request.param

    @pytest.mark.usefixtures('hide')
    @pytest.mark.parametrize(
        'color_scheme',
        ('prefer-dark', 'prefer-light', 'default'),
        indirect=True
    )
    def test_dark_mode(
        self,
        color_scheme,
        extension_dbus_interface,
        extension_test_hook,
        shell_test_hook,
    ):
        workarea = shell_test_hook.Workareas[0]

        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        extension_test_hook.wait_property('RenderedFirstFrame', True)
        shell_test_hook.WaitLeisure()

        assert extension_test_hook.WindowRect == workarea

        red, green, blue, alpha = shell_test_hook.PickColor(
            workarea.x + workarea.width // 2,
            workarea.y + workarea.height // 2,
        )

        if color_scheme == 'prefer-dark':
            assert red < 127 and green < 127 and blue < 127
        else:
            assert red > 128 and green > 128 and blue > 128

    @pytest.fixture(scope='class')
    def launcher_path(self, extension_init):
        return pathlib.Path(extension_init['path']) / 'bin' / 'com.github.amezin.ddterm'

    @pytest.mark.usefixtures('window_above', 'hide_when_focus_lost', 'hide')
    @pytest.mark.parametrize('window_above', (True, False), indirect=True)
    @pytest.mark.parametrize('hide_when_focus_lost', (True, False), indirect=True)
    def test_wl_clipboard(
        self,
        process_launcher,
        dbus_environment,
        extension_dbus_interface,
        extension_test_hook,
        shell_test_hook,
        launcher_path,
        tmp_path
    ):
        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        extension_test_hook.wait_property('RenderedFirstFrame', True)

        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'

        process_launcher.run(
            str(launcher_path),
            '--wait',
            '--no-environment',
            '--keep-open',
            '--',
            'bash',
            '-c',
            'echo wl-clipboard-test-content | wl-copy',
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
            'bash',
            '-c',
            f'wl-paste >{shlex.quote(str(test_file))}',
            env=dbus_environment,
        )

        shell_test_hook.Later(shellhook.LaterType.SYNC_STACK)

        assert shell_test_hook.FocusApp == 'com.github.amezin.ddterm'
        assert test_file.read_text() == 'wl-clipboard-test-content\n\n'

    def test_cli_leak(
        self,
        process_launcher,
        dbus_environment,
        app_debug_dbus_interface,
        extension_dbus_interface,
        extension_test_hook,
        launcher_path,
        tmp_path
    ):
        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        extension_test_hook.wait_property('RenderedFirstFrame', True)

        test_file = tmp_path / 'testfile'

        process_launcher.run(
            str(launcher_path),
            '--wait',
            '--',
            'bash',
            '-c',
            f'echo 1 >{shlex.quote(str(test_file))}',
            env=dbus_environment,
        )

        assert test_file.read_text() == '1\n'

        dump_pre = tmp_path / 'heap-pre.dump'
        app_debug_dbus_interface.GC()
        app_debug_dbus_interface.DumpHeap(dump_pre)

        process_launcher.run(
            str(launcher_path),
            '--wait',
            '--',
            'bash',
            '-c',
            f'echo 2 >{shlex.quote(str(test_file))}',
            env=dbus_environment,
        )

        assert test_file.read_text() == '2\n'

        dump_post = tmp_path / 'heap-post.dump'
        app_debug_dbus_interface.GC()
        app_debug_dbus_interface.DumpHeap(dump_post)

        compare_heap_dumps(dump_pre, dump_post, hide_edge=['window_title_binding'])

    def test_prefs_leak(
        self,
        app_debug_dbus_interface,
        extension_dbus_interface,
        extension_test_hook,
        tmp_path,
    ):
        extension_dbus_interface.Activate(timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS)
        extension_test_hook.wait_property('RenderedFirstFrame', True)

        app_debug_dbus_interface.ShowPreferences()
        app_debug_dbus_interface.HidePreferences()
        app_debug_dbus_interface.WaitIdle()

        dump_pre = tmp_path / 'heap-pre.dump'
        app_debug_dbus_interface.GC()
        app_debug_dbus_interface.DumpHeap(dump_pre)

        app_debug_dbus_interface.ShowPreferences()
        app_debug_dbus_interface.HidePreferences()
        app_debug_dbus_interface.WaitIdle()

        dump_post = tmp_path / 'heap-post.dump'
        app_debug_dbus_interface.GC()
        app_debug_dbus_interface.DumpHeap(dump_post)

        compare_heap_dumps(
            dump_pre,
            dump_post,
            hide_node=['_init/Gtk'],
            hide_edge=['cacheir-object']
        )

    def test_dependencies(self, process_launcher):
        process_launcher.run(
            str(SRC_DIR / 'ddterm' / 'app' / 'tools' / 'dependencies-update.js'),
            '--dry-run',
            timeout=60,
        )
