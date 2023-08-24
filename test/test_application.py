import logging
import pathlib
import shlex
import subprocess
import sys
import time

import pytest

from gi.repository import Gio

from . import dbus_util, ddterm_fixtures, glib_util


LOGGER = logging.getLogger(__name__)

THIS_DIR = pathlib.Path(__file__).parent.resolve()
TEST_SRC_DIR = THIS_DIR / 'extension'
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


def compare_heap_dumps(dump_pre, dump_post):
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

    @pytest.fixture
    def notebook_actions(self, user_bus_connection):
        return Gio.DBusActionGroup.get(
            user_bus_connection,
            'com.github.amezin.ddterm',
            '/com/github/amezin/ddterm/window/1/notebook'
        )

    @pytest.fixture
    def run_app(self, ddterm_extension_interface, test_extension_interface, app_actions):
        ddterm_extension_interface.Activate(timeout=self.START_STOP_TIMEOUT_MS)

        def app_running():
            return test_extension_interface.get_cached_property('IsAppRunning').unpack()

        def has_window():
            return test_extension_interface.get_cached_property('HasWindow').unpack()

        with glib_util.SignalWait(
            test_extension_interface,
            'g-properties-changed',
            timeout=self.START_STOP_TIMEOUT_MS
        ) as w:
            while not app_running() or not has_window():
                w.wait()

        try:
            yield

        finally:
            app_actions.activate_action('quit', None)

            with glib_util.SignalWait(test_extension_interface, 'g-properties-changed') as w:
                while app_running() or has_window():
                    w.wait()

    @pytest.fixture(scope='class')
    def heap_dump_dir(self, tmp_path_factory):
        path = tmp_path_factory.mktemp('heap')
        path.chmod(0o777)
        return path

    @pytest.fixture(scope='class')
    def container_volumes(self, container_volumes, heap_dump_dir):
        return container_volumes + (
            (heap_dump_dir, heap_dump_dir),
        )

    @pytest.fixture
    def heap_dump_api(self, user_bus_connection, run_app):
        return dbus_util.wait_interface(
            user_bus_connection,
            'com.github.amezin.ddterm',
            '/com/github/amezin/ddterm',
            'com.github.amezin.ddterm.HeapDump',
            timeout=self.START_STOP_TIMEOUT_MS
        )

    def test_tab_leak(self, heap_dump_api, heap_dump_dir, notebook_actions):
        wait_action_in_group(notebook_actions, 'new-tab')
        wait_action_in_group(notebook_actions, 'close-current-tab')

        heap_dump_api.GC(timeout=self.START_STOP_TIMEOUT_MS)
        dump_pre = heap_dump_api.Dump(
            '(s)', str(heap_dump_dir),
            timeout=self.START_STOP_TIMEOUT_MS
        )

        notebook_actions.activate_action('new-tab', None)
        notebook_actions.activate_action('close-current-tab', None)
        time.sleep(0.5)

        heap_dump_api.GC(timeout=self.START_STOP_TIMEOUT_MS)
        dump_post = heap_dump_api.Dump(
            '(s)', str(heap_dump_dir),
            timeout=self.START_STOP_TIMEOUT_MS
        )

        compare_heap_dumps(dump_pre, dump_post)

    def test_prefs_leak(self, heap_dump_api, heap_dump_dir, app_actions):
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
            '(s)', str(heap_dump_dir),
            timeout=self.START_STOP_TIMEOUT_MS
        )

        open_close_prefs()
        time.sleep(0.5)

        heap_dump_api.GC(timeout=self.START_STOP_TIMEOUT_MS)
        dump_post = heap_dump_api.Dump(
            '(s)', str(heap_dump_dir),
            timeout=self.START_STOP_TIMEOUT_MS
        )

        compare_heap_dumps(dump_pre, dump_post)

    def test_manifest(self, container):
        container.exec(
            str(SRC_DIR / 'ddterm' / 'app' / 'tools' / 'dependencies-update.js'),
            '--dry-run',
            timeout=60,
            user=container.user,
        )
