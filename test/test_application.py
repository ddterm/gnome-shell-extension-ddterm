import logging
import pathlib
import shlex
import subprocess
import sys
import textwrap

import pytest

from gi.repository import Gio

from . import dbus_util, ddterm_fixtures


LOGGER = logging.getLogger(__name__)

THIS_DIR = pathlib.Path(__file__).parent.resolve()
SRC_DIR = THIS_DIR.parent


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


class TestApp(ddterm_fixtures.DDTermFixtures):
    @pytest.fixture
    def app_actions(self, user_bus_connection):
        return Gio.DBusActionGroup.get(
            user_bus_connection,
            'com.github.amezin.ddterm',
            '/com/github/amezin/ddterm'
        )

    @pytest.fixture(autouse=True)
    def enable_screenshots(self, x11_display, screencap):
        screencap.enable(x11_display)

    @pytest.fixture(scope='class')
    def run_app(self, container, launcher_path, enable_test_extension):
        container.exec(
            str(launcher_path),
            timeout=self.START_STOP_TIMEOUT_SEC,
            user=container.user,
        )

    @pytest.fixture(autouse=True)
    def configure_tmp_dir(self, tmp_path):
        tmp_path.chmod(0o777)

    @pytest.fixture(scope='class')
    def debug_api(self, user_bus_connection, run_app):
        return dbus_util.wait_interface(
            user_bus_connection,
            'com.github.amezin.ddterm',
            '/com/github/amezin/ddterm',
            'com.github.amezin.ddterm.Debug',
            timeout=self.START_STOP_TIMEOUT_MS
        )

    def test_cli_leak(self, container, debug_api, tmp_path, launcher_path):
        test_file = tmp_path / 'testfile'

        container.exec(
            str(launcher_path),
            '--wait',
            '--',
            'bash',
            '-c',
            f'echo 1 >{shlex.quote(str(test_file))}',
            user=container.user,
        )

        assert test_file.read_text() == '1\n'

        dump_pre = tmp_path / 'heap-pre.dump'
        debug_api.GC()
        debug_api.DumpHeap('(s)', str(dump_pre), timeout=self.START_STOP_TIMEOUT_MS)

        container.exec(
            str(launcher_path),
            '--wait',
            '--',
            'bash',
            '-c',
            f'echo 2 >{shlex.quote(str(test_file))}',
            user=container.user,
        )

        assert test_file.read_text() == '2\n'

        dump_post = tmp_path / 'heap-post.dump'
        debug_api.GC()
        debug_api.DumpHeap('(s)', str(dump_post), timeout=self.START_STOP_TIMEOUT_MS)

        compare_heap_dumps(dump_pre, dump_post, hide_edge=['window_title_binding'])

    def test_prefs_leak(self, debug_api, tmp_path, app_actions):
        def open_close_prefs():
            commands = [
                'Gio.Application.get_default().preferences()',
                textwrap.dedent('''
                    new Promise(resolve => {
                        const { prefs_dialog } = Gio.Application.get_default();
                        prefs_dialog.connect('destroy', resolve);
                        prefs_dialog.close();
                    })
                '''),
            ]

            for cmd in commands:
                debug_api.Eval('(s)', cmd, timeout=self.START_STOP_TIMEOUT_MS)

        open_close_prefs()

        dump_pre = tmp_path / 'heap-pre.dump'
        debug_api.GC()
        debug_api.DumpHeap('(s)', str(dump_pre), timeout=self.START_STOP_TIMEOUT_MS)

        open_close_prefs()

        dump_post = tmp_path / 'heap-post.dump'
        debug_api.GC()
        debug_api.DumpHeap('(s)', str(dump_post), timeout=self.START_STOP_TIMEOUT_MS)

        compare_heap_dumps(
            dump_pre,
            dump_post,
            hide_node=['_init/Gtk'],
            hide_edge=['cacheir-object']
        )

    def test_manifest(self, container):
        container.exec(
            str(SRC_DIR / 'ddterm' / 'app' / 'tools' / 'dependencies-update.js'),
            '--dry-run',
            timeout=60,
            user=container.user,
        )
