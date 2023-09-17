import json
import pathlib
import re
import subprocess

import filelock
import pytest
import yaml
import zipfile

from . import container_util, gnome_container, log_filter, log_sync
from .syslog_server import SyslogServer


THIS_DIR = pathlib.Path(__file__).parent.resolve()
TEST_SRC_DIR = THIS_DIR / 'extension'
SRC_DIR = THIS_DIR.parent

IMAGES_STASH_KEY = pytest.StashKey[list]()

pytest_plugins = ['markdown_report', 'screenshot']


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


class SyslogMessageMatcher:
    def __init__(self, syslogger):
        self.syslogger = syslogger

    @log_sync.hookimpl
    def log_sync_filter(self, msg):
        return log_filter.RegexLogFilter(
            name=self.syslogger.name,
            pattern=f': {re.escape(msg)}$'
        )


@pytest.fixture(scope='session')
def syslog_server(tmp_path_factory, log_sync):
    path = tmp_path_factory.mktemp('syslog') / 'socket'

    with SyslogServer(str(path)) as server:
        with server.serve_forever_background(poll_interval=0.1):
            with log_sync.with_registered(SyslogMessageMatcher(server.logger)):
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
    with open(TEST_SRC_DIR / 'metadata.json', 'r') as f:
        return json.load(f)


@pytest.fixture(scope='session')
def container_create_lock(request):
    return filelock.FileLock(request.config.cache.mkdir('container-creating') / 'lock')


@pytest.fixture(scope='session')
def container_volumes(ddterm_metadata, test_metadata, extension_pack, tmp_path_factory):
    sys_install_dir = gnome_container.GnomeContainer.extensions_system_install_path()

    if extension_pack:
        install_mount = (extension_pack, extension_pack, 'ro')
    else:
        install_mount = (SRC_DIR, sys_install_dir / ddterm_metadata['uuid'], 'ro')

    basetemp = tmp_path_factory.getbasetemp()
    basetemp.chmod(0o777)

    return (
        (SRC_DIR, SRC_DIR, 'ro'),
        install_mount,
        (TEST_SRC_DIR, sys_install_dir / test_metadata['uuid'], 'ro'),
        (basetemp, basetemp)
    )
