import contextlib
import math
import pathlib

import pytest
import yaml

from . import container_util


TEST_SRC_DIR = pathlib.Path(__file__).parent.resolve()
IMAGES_STASH_KEY = pytest.StashKey[list]()


@pytest.fixture(scope='session')
def global_tmp_path(tmp_path_factory):
    return tmp_path_factory.getbasetemp().parent


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


def pytest_generate_tests(metafunc):
    if 'container_image' in metafunc.fixturenames:
        metafunc.parametrize(
            'container_image',
            metafunc.config.stash[IMAGES_STASH_KEY],
            indirect=True,
            scope='session'
        )


def get_runtest_cm(item, when):
    cm = item.get_closest_marker('runtest_cm')
    if cm:
        return cm.args[0](item, when)

    return contextlib.nullcontext()


@pytest.hookimpl(hookwrapper=True, trylast=True)
def pytest_runtest_setup(item):
    with get_runtest_cm(item, 'setup'):
        yield


@pytest.hookimpl(hookwrapper=True, trylast=True)
def pytest_runtest_call(item):
    with get_runtest_cm(item, 'call'):
        yield


@pytest.hookimpl(hookwrapper=True, trylast=True)
def pytest_runtest_teardown(item):
    with get_runtest_cm(item, 'teardown'):
        yield


@pytest.hookimpl(hookwrapper=True)
def pytest_xdist_auto_num_workers(config):
    result = yield
    result.force_result(math.ceil(result.get_result() * 2 / 3))
