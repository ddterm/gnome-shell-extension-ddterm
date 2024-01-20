import logging
import pathlib
import shlex
import subprocess
import sys

import pytest

from gi.repository import Gio

from . import dbus_util, ddterm_fixtures, glib_util


LOGGER = logging.getLogger(__name__)

THIS_DIR = pathlib.Path(__file__).parent.resolve()
SRC_DIR = THIS_DIR.parent


def wait_action_in_group(group, action):
    with glib_util.SignalWait(group, f'action-added::{action}') as w:
        while not group.has_action(action):
            w.wait()


def wait_action_in_group_enabled(group, action, enabled=True):
    wait_action_in_group(group, action)

    with glib_util.SignalWait(group, f'action-enabled-changed::{action}') as w:
        while group.get_action_enabled(action) != enabled:
            w.wait()


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
    def app_executable(self, ddterm_extension_info, enable_test_extension):
        return pathlib.PurePosixPath(ddterm_extension_info['path']) / 'bin/com.github.amezin.ddterm'

    @pytest.fixture(scope='class')
    def run_app(self, container, app_executable):
        container.exec(
            str(app_executable),
            timeout=self.START_STOP_TIMEOUT_SEC,
            user=container.user,
        )

    @pytest.fixture(autouse=True)
    def configure_tmp_dir(self, tmp_path):
        tmp_path.chmod(0o777)

    @pytest.fixture(scope='class')
    def heap_dump_api(self, user_bus_connection, run_app):
        return dbus_util.wait_interface(
            user_bus_connection,
            'com.github.amezin.ddterm',
            '/com/github/amezin/ddterm',
            'com.github.amezin.ddterm.HeapDump',
            timeout=self.START_STOP_TIMEOUT_MS
        )

    def test_cli_leak(self, container, heap_dump_api, tmp_path, app_executable):
        test_file = tmp_path / 'testfile'

        container.exec(
            str(app_executable),
            '--wait',
            '--',
            'bash',
            '-c',
            f'echo 1 >{shlex.quote(str(test_file))}',
            user=container.user,
        )

        assert test_file.read_text() == '1\n'

        heap_dump_api.GC(timeout=self.START_STOP_TIMEOUT_MS)
        dump_pre = heap_dump_api.Dump(
            '(s)', str(tmp_path),
            timeout=self.START_STOP_TIMEOUT_MS
        )

        container.exec(
            str(app_executable),
            '--wait',
            '--',
            'bash',
            '-c',
            f'echo 2 >{shlex.quote(str(test_file))}',
            user=container.user,
        )

        assert test_file.read_text() == '2\n'

        heap_dump_api.GC(timeout=self.START_STOP_TIMEOUT_MS)
        dump_post = heap_dump_api.Dump(
            '(s)', str(tmp_path),
            timeout=self.START_STOP_TIMEOUT_MS
        )

        compare_heap_dumps(dump_pre, dump_post, hide_edge=['window_title_binding'])

    def test_prefs_leak(self, heap_dump_api, tmp_path, app_actions):
        wait_action_in_group(app_actions, 'preferences')
        wait_action_in_group_enabled(app_actions, 'close-preferences', False)

        def open_close_prefs():
            app_actions.activate_action('preferences', None)
            wait_action_in_group_enabled(app_actions, 'close-preferences', True)
            app_actions.activate_action('close-preferences', None)
            wait_action_in_group_enabled(app_actions, 'close-preferences', False)

        open_close_prefs()

        heap_dump_api.GC(timeout=self.START_STOP_TIMEOUT_MS)
        dump_pre = heap_dump_api.Dump(
            '(s)', str(tmp_path),
            timeout=self.START_STOP_TIMEOUT_MS
        )

        open_close_prefs()

        heap_dump_api.GC(timeout=self.START_STOP_TIMEOUT_MS)
        dump_post = heap_dump_api.Dump(
            '(s)', str(tmp_path),
            timeout=self.START_STOP_TIMEOUT_MS
        )

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
