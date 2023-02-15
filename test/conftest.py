import logging
import pathlib

import pytest
import yaml

from . import container_util, log_sync
from .syslog_server import SyslogServer


TEST_SRC_DIR = pathlib.Path(__file__).parent.resolve()
IMAGES_STASH_KEY = pytest.StashKey[list]()


@pytest.fixture(scope='session')
def podman(pytestconfig):
    return container_util.Podman(pytestconfig.option.podman)


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


@pytest.fixture(scope='session')
def syslog_server(tmp_path_factory, log_sync):
    path = tmp_path_factory.mktemp('syslog') / 'socket'

    with SyslogServer(str(path)) as server:
        with server.serve_forever_background(poll_interval=0.1):
            with log_sync.with_registered(SyslogMessageMatcher.Factory(server.logger)):
                yield server
