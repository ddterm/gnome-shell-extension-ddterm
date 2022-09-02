import contextlib
import logging
import os
import pathlib

import pytest

from . import container_util, image_util


LOGGER = logging.getLogger(__name__)

TEST_SRC_DIR = pathlib.Path(__file__).parent.resolve()
IMAGES_STASH_KEY = pytest.StashKey[list]();


@pytest.fixture(scope='session')
def global_tmp_path(tmp_path_factory):
    return tmp_path_factory.getbasetemp().parent


@pytest.fixture(scope='session')
def podman(pytestconfig):
    return container_util.Podman(pytestconfig.option.podman)


@pytest.fixture(scope='session')
def iidfile_dir(global_tmp_path):
    path = global_tmp_path / 'iidfiles'
    path.mkdir(exist_ok=True)
    return path


@pytest.fixture(scope='session')
def container_image(request, podman, iidfile_dir):
    return request.param.make(podman, iidfile_dir)


def pytest_addoption(parser):
    parser.addoption('--container-image', action='append', default=[])
    parser.addoption('--container-dockerfile', action='append', default=[], type=pathlib.Path)
    parser.addoption('--podman', default=['podman'], nargs='+')
    parser.addoption('--pull', default=False, action='store_true')
    parser.addoption('--screenshot-failing-only', default=False, action='store_true')


def short_path(path):
    relative = os.path.relpath(path)
    absolute = os.path.abspath(path)
    return relative if len(relative) < len(absolute) else absolute


def pytest_configure(config):
    images = config.getoption('--container-image')
    dockerfiles = config.getoption('--container-dockerfile')
    pull = config.getoption('--pull')

    existing_images = [
        pytest.param(
            (image_util.RemoteImage if pull else image_util.LocalImage)(image),
            marks=pytest.mark.uses_image.with_args(image),
            id=image
        )
        for image in images
    ]

    if not images and not dockerfiles:
        dockerfiles = (TEST_SRC_DIR / 'images').glob('*.dockerfile')

    dockerfiles = [short_path(dockerfile) for dockerfile in dockerfiles]

    built_images = [
        pytest.param(
            image_util.BuiltImage(dockerfile, pull=pull),
            marks=pytest.mark.uses_image.with_args(dockerfile),
            id=dockerfile
        )
        for dockerfile in dockerfiles
    ]

    config.stash[IMAGES_STASH_KEY] = existing_images + built_images


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
