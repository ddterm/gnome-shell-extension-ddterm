import json
import os
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
SRC_DIR = THIS_DIR.parent

DDTERM_METADATA_KEY = pytest.StashKey[dict]()
IMAGES_STASH_KEY = pytest.StashKey[list]()
LEGACY_MODE_KEY = pytest.StashKey[bool]()

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
    return request.config.getoption('--pack').resolve()


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

    pack_from_env = os.getenv('DDTERM_BUILT_PACK')

    parser.addoption(
        '--pack',
        default=pathlib.Path(pack_from_env) if pack_from_env else None,
        required=not pack_from_env,
        type=pathlib.Path,
        help='built ddterm extension package (ddterm@amezin.github.com.shell-extension.zip)',
    )


def pytest_configure(config):
    images = config.getoption('--image')
    compose_services = config.getoption('--compose-service')
    extension_pack = config.getoption('--pack')

    with zipfile.ZipFile(extension_pack) as z:
        with z.open('metadata.json') as f:
            ddterm_metadata = json.load(f)

    config.stash[DDTERM_METADATA_KEY] = ddterm_metadata

    legacy_mode = '45' not in ddterm_metadata['shell-version']
    config.stash[LEGACY_MODE_KEY] = legacy_mode

    image_profile = 'legacy' if legacy_mode else 'esm'

    if compose_services or not images:
        with open('compose.yaml') as f:
            compose_config = yaml.safe_load(f)

        if not compose_services:
            compose_services = [
                name
                for name, desc in compose_config['services'].items()
                if image_profile in desc.get('profiles', [])
            ]

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
def ddterm_metadata(request):
    return request.config.stash[DDTERM_METADATA_KEY]


@pytest.fixture(scope='session')
def legacy_mode(request):
    return request.config.stash[LEGACY_MODE_KEY]


@pytest.fixture(scope='session')
def test_extension_src_dir(legacy_mode):
    return THIS_DIR / ('extension-legacy' if legacy_mode else 'extension')


@pytest.fixture(scope='session')
def test_metadata(test_extension_src_dir):
    with open(test_extension_src_dir / 'metadata.json', 'r') as f:
        return json.load(f)


@pytest.fixture(scope='session')
def container_create_lock(request):
    return filelock.FileLock(request.config.cache.mkdir('container-creating') / 'lock')


@pytest.fixture(scope='session')
def container_volumes(
    ddterm_metadata,
    test_metadata,
    extension_pack,
    tmp_path_factory,
    test_extension_src_dir
):
    sys_install_dir = gnome_container.GnomeContainer.extensions_system_install_path()
    install_mount = (extension_pack, extension_pack, 'ro')

    basetemp = tmp_path_factory.getbasetemp()
    basetemp.chmod(0o777)

    return (
        (SRC_DIR, SRC_DIR, 'ro'),
        install_mount,
        (test_extension_src_dir, sys_install_dir / test_metadata['uuid'], 'ro'),
        (basetemp, basetemp)
    )
