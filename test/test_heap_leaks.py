import contextlib
import datetime
import functools
import logging
import pathlib
import queue
import shlex
import subprocess
import sys
import time

import pytest

from gi.repository import GLib, Gio

from . import glib_util


LOGGER = logging.getLogger(__name__)

THIS_DIR = pathlib.Path(__file__).parent.resolve()
SRC_DIR = THIS_DIR.parent

STARTUP_TIMEOUT_SEC = 15
STARTUP_TIMEOUT_MS = STARTUP_TIMEOUT_SEC * 1000


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


@pytest.fixture
def app_actions(user_bus_connection, enable_ddterm):
    return Gio.DBusActionGroup.get(
        user_bus_connection,
        'com.github.amezin.ddterm',
        '/com/github/amezin/ddterm'
    )


@pytest.fixture
def notebook_actions(user_bus_connection, enable_ddterm):
    return Gio.DBusActionGroup.get(
        user_bus_connection,
        'com.github.amezin.ddterm',
        '/com/github/amezin/ddterm/window/1/notebook'
    )


@pytest.fixture(autouse=True)
def run_app(extension_interface, test_interface, app_actions):
    extension_interface.Activate(timeout=STARTUP_TIMEOUT_MS)

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
def heap_dump_dir(tmp_path_factory):
    path = tmp_path_factory.mktemp('heap')
    path.chmod(0o777)
    return path


@pytest.fixture(scope='session')
def container_volumes(container_volumes, heap_dump_dir):
    return container_volumes + ((heap_dump_dir, heap_dump_dir),)


@pytest.fixture
def leak_detector(syslog_server, app_actions, heap_dump_dir):
    wait_action_in_group(app_actions, 'gc')
    wait_action_in_group(app_actions, 'dump-heap')

    return functools.partial(
        detect_heap_leaks,
        syslogger=syslog_server.logger,
        app_actions=app_actions,
        heap_dump_dir=heap_dump_dir
    )


def test_tab_leak(leak_detector, notebook_actions):
    wait_action_in_group(notebook_actions, 'new-tab')
    wait_action_in_group(notebook_actions, 'close-current-tab')

    with leak_detector():
        notebook_actions.activate_action('new-tab', None)
        notebook_actions.activate_action('close-current-tab', None)
        time.sleep(0.5)


def test_prefs_leak(leak_detector, app_actions):
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
