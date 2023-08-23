import contextlib
import itertools
import json
import logging
import pathlib
import subprocess
import zipfile

import filelock
import pytest
import yaml
import Xlib.display

from . import container_util, dbus_util, glib_util, log_sync, systemd_container
from .shell_dbus_api import GnomeShellDBusApi
from .syslog_server import SyslogServer


LOGGER = logging.getLogger(__name__)

THIS_DIR = pathlib.Path(__file__).parent.resolve()
SRC_DIR = THIS_DIR.parent
TEST_EXTENSION_SRC_DIR = THIS_DIR / 'extension'

EXTENSIONS_INSTALL_DIR_REL = pathlib.PurePosixPath('share/gnome-shell/extensions')
EXTENSIONS_INSTALL_DIR = pathlib.PurePosixPath('/usr') / EXTENSIONS_INSTALL_DIR_REL
USER_NAME = 'gnomeshell'
DISPLAY_NUMBER = 99
X11_DISPLAY_BASE_PORT = 6000
DISPLAY_PORT = X11_DISPLAY_BASE_PORT + DISPLAY_NUMBER
DISPLAY = f':{DISPLAY_NUMBER}'
DBUS_PORT = 1234

STARTUP_TIMEOUT_SEC = 15
STARTUP_TIMEOUT_MS = STARTUP_TIMEOUT_SEC * 1000

IMAGES_STASH_KEY = pytest.StashKey[list]()


class SyslogMessageMatcher(logging.Filter):
    def __init__(self, msg, name=''):
        super().__init__(name)
        self.msg = msg

    def filter(self, record):
        return super().filter(record) and record.message.endswith(self.msg)

    class Factory:
        def __init__(self, syslogger):
            self.syslogger = syslogger

        @log_sync.hookimpl
        def log_sync_filter(self, msg):
            return SyslogMessageMatcher(name=self.syslogger.name, msg=msg)


class SyncMessageSystemdCat:
    def __init__(self, container):
        self.container = container

    @log_sync.hookimpl
    def log_sync_message(self, msg):
        try:
            self.container.journal_message(msg)
            return True

        except Exception:
            LOGGER.exception("Can't send syslog message with systemd-cat")


class SyncMessageDBus:
    def __init__(self, dbus_interface):
        self.dbus_interface = dbus_interface

    @log_sync.hookimpl
    def log_sync_message(self, msg):
        try:
            self.dbus_interface.LogMessage('(s)', msg)
            return True

        except Exception:
            LOGGER.exception("Can't send syslog message through D-Bus")


@pytest.fixture(scope='session')
def podman(pytestconfig):
    return container_util.Podman(
        *pytestconfig.option.podman,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )


@pytest.fixture(scope='session')
def container_image(request):
    return request.param


@pytest.fixture(scope='session')
def extension_pack(request):
    pack = request.config.getoption('--pack')

    if pack:
        return pack.resolve()


def pytest_addoption(parser):
    parser.addoption(
        '--compose-service',
        action='append',
        default=[],
        help='run tests using the specified container image from compose.yaml. '
             'Can be repeated multiple times to run tests with multiple images.'
    )

    parser.addoption(
        '--image',
        action='append',
        default=[],
        help='run tests using the specified container image. '
             'Can be repeated multiple times to run tests with multiple images.'
    )

    parser.addoption(
        '--podman',
        default=['podman'],
        nargs='+',
        help='podman command/executable path'
    )

    parser.addoption(
        '--screenshot-failing-only',
        default=False,
        action='store_true',
        help='capture screenshots only for failing tests'
    )

    parser.addoption(
        '--pack',
        default=None,
        type=pathlib.Path,
        help='install ddterm from the specified package file'
    )


def pytest_configure(config):
    images = config.getoption('--image')
    compose_services = config.getoption('--compose-service')

    if compose_services or not images:
        with open('compose.yaml') as f:
            compose_config = yaml.safe_load(f)

        if not compose_services:
            compose_services = compose_config['services'].keys()

        images = images + [
            compose_config['services'][name]['image']
            for name in compose_services
        ]

    config.stash[IMAGES_STASH_KEY] = [
        pytest.param(image, marks=pytest.mark.uses_image.with_args(image))
        for image in images
    ]

    config.pluginmanager.register(log_sync.LogSyncPlugin())


def pytest_generate_tests(metafunc):
    if 'container_image' in metafunc.fixturenames:
        metafunc.parametrize(
            'container_image',
            metafunc.config.stash[IMAGES_STASH_KEY],
            indirect=True,
            scope='session'
        )


@pytest.fixture(scope='session')
def syslog_server(tmp_path_factory, log_sync):
    path = tmp_path_factory.mktemp('syslog') / 'socket'

    with SyslogServer(str(path)) as server:
        with server.serve_forever_background(poll_interval=0.1):
            with log_sync.with_registered(SyslogMessageMatcher.Factory(server.logger)):
                yield server


@pytest.fixture(scope='session')
def ddterm_metadata(extension_pack):
    if extension_pack:
        with zipfile.ZipFile(extension_pack) as z:
            with z.open('metadata.json') as f:
                return json.load(f)

    else:
        with open(SRC_DIR / 'metadata.json', 'r') as f:
            return json.load(f)


@pytest.fixture(scope='session')
def test_metadata():
    with open(TEST_EXTENSION_SRC_DIR / 'metadata.json', 'r') as f:
        return json.load(f)


@pytest.fixture(scope='session')
def container_create_lock(request):
    return filelock.FileLock(request.config.cache.mkdir('container-creating') / 'lock')


@pytest.fixture(scope='session')
def container_volumes(ddterm_metadata, test_metadata, extension_pack):
    if extension_pack:
        src_mount = (extension_pack, extension_pack, 'ro')
    else:
        src_mount = (SRC_DIR, EXTENSIONS_INSTALL_DIR / ddterm_metadata['uuid'], 'ro')

    return (
        src_mount,
        (TEST_EXTENSION_SRC_DIR, EXTENSIONS_INSTALL_DIR / test_metadata['uuid'], 'ro'),
    )


@pytest.fixture(scope='session')
def container_ports():
    return [
        ('127.0.0.1', '', DBUS_PORT),
        ('127.0.0.1', '', DISPLAY_PORT)
    ]


@pytest.fixture(scope='session')
def container(
    podman,
    container_image,
    container_volumes,
    container_ports,
    syslog_server,
    container_create_lock,
    log_sync
):
    with container_create_lock:
        c = systemd_container.SystemdContainer.create(
            podman,
            container_image,
            volumes=container_volumes,
            publish=container_ports,
            timeout=STARTUP_TIMEOUT_SEC,
            syslog_server=syslog_server,
            unit='multi-user.target'
        )

    try:
        c.start(timeout=STARTUP_TIMEOUT_SEC)

        with log_sync.with_registered(SyncMessageSystemdCat(c)):
            c.wait_system_running(timeout=STARTUP_TIMEOUT_SEC)
            yield c

    finally:
        c.rm(timeout=STARTUP_TIMEOUT_SEC)


@pytest.fixture(scope='session')
def user_bus_connection(container):
    with contextlib.closing(dbus_util.connect_tcp(*container.get_port(DBUS_PORT))) as c:
        yield c


@pytest.fixture(scope='session')
def x11_display(container):
    host, port = container.get_port(DISPLAY_PORT)
    display_number = int(port) - X11_DISPLAY_BASE_PORT
    display = Xlib.display.Display(f'{host}:{display_number}')
    yield display
    display.close()


@pytest.fixture(scope='session')
def install_ddterm(extension_pack, container):
    if extension_pack:
        container.exec(
            'gnome-extensions', 'install', str(extension_pack),
            timeout=STARTUP_TIMEOUT_SEC, user=USER_NAME
        )


@pytest.fixture(scope='session')
def shell_session_name():
    return 'gnome-session-x11'


@pytest.fixture(scope='session')
def disable_welcome_dialog(container):
    container.exec(
        'gsettings', 'set', 'org.gnome.shell', 'welcome-dialog-last-shown-version', '"99.0"',
        timeout=STARTUP_TIMEOUT_SEC, user=USER_NAME
    )


@pytest.fixture(scope='session')
def configure_shell_session(install_ddterm, disable_welcome_dialog):
    pass


@pytest.fixture(scope='session')
def shell_session(container, configure_shell_session, shell_session_name):
    container.exec(
        'systemctl', 'start', f'{shell_session_name}@{DISPLAY}.target',
        timeout=STARTUP_TIMEOUT_SEC
    )


@pytest.fixture(scope='session')
def shell_dbus_api(user_bus_connection, shell_session):
    return GnomeShellDBusApi(user_bus_connection)


@pytest.fixture(scope='session')
def enable_ddterm(shell_dbus_api, ddterm_metadata):
    shell_dbus_api.enable_extension(ddterm_metadata['uuid'])


@pytest.fixture(scope='session')
def enable_test(shell_dbus_api, test_metadata, enable_ddterm):
    shell_dbus_api.enable_extension(test_metadata['uuid'])


@pytest.fixture(scope='session')
def extension_interface(user_bus_connection, enable_ddterm):
    return dbus_util.wait_interface(
        user_bus_connection,
        name='org.gnome.Shell',
        path='/org/gnome/Shell/Extensions/ddterm',
        interface='com.github.amezin.ddterm.Extension'
    )


@pytest.fixture(scope='session')
def test_interface(user_bus_connection, enable_test, log_sync):
    def trace_signal(proxy, sender, signal, params):
        LOGGER.info('%s %r', signal, params.unpack())

    def trace_props(proxy, changed, invalidated):
        for prop in changed.keys():
            LOGGER.info('%s = %r', prop, changed[prop])

        for prop in invalidated:
            LOGGER.info('%s invalidated', prop)

    iface = dbus_util.wait_interface(
        user_bus_connection,
        name='org.gnome.Shell',
        path='/org/gnome/Shell/Extensions/ddterm',
        interface='com.github.amezin.ddterm.ExtensionTest'
    )

    with log_sync.with_registered(SyncMessageDBus(iface)), \
            glib_util.SignalConnection(iface, 'g-signal', trace_signal), \
            glib_util.SignalConnection(iface, 'g-properties-changed', trace_props):
        yield iface


@pytest.fixture(autouse=True)
def check_log_errors(caplog, syslog_server, ddterm_metadata):
    pattern = f'@{EXTENSIONS_INSTALL_DIR_REL / ddterm_metadata["uuid"]}'

    yield

    all_records = itertools.chain(
        caplog.get_records('setup'),
        caplog.get_records('call'),
        caplog.get_records('teardown')
    )

    errors = [
        record for record in all_records
        if record.levelno >= logging.WARNING
        and record.name.startswith(syslog_server.logger.name)
        and pattern in record.message
    ]

    assert errors == []
