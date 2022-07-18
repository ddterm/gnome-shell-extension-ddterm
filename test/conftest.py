import collections
import contextlib
import logging
import pathlib
import shlex
import subprocess
import urllib.parse

import filelock
import pytest

from . import container_util


LOGGER = logging.getLogger(__name__)

IMAGES_BASEURL = 'ghcr.io/amezin/gnome-shell-pod'
IMAGES_BRANCH = 'master'
IMAGES = [
    f'{IMAGES_BASEURL}/fedora-35:{IMAGES_BRANCH}',
    f'{IMAGES_BASEURL}/fedora-36:{IMAGES_BRANCH}',
    f'{IMAGES_BASEURL}/debian-11:{IMAGES_BRANCH}',
    f'{IMAGES_BASEURL}/ubuntu-20.04:{IMAGES_BRANCH}',
    f'{IMAGES_BASEURL}/ubuntu-22.04:{IMAGES_BRANCH}',
]


@pytest.fixture(scope='session')
def global_tmp_path(tmp_path_factory):
    return tmp_path_factory.getbasetemp().parent


@pytest.fixture(scope='session')
def podman(pytestconfig):
    return container_util.Podman(pytestconfig.option.podman)


@pytest.fixture(scope='session')
def container_image(request, pytestconfig, podman, global_tmp_path):
    if not pytestconfig.option.pull:
        return request.param

    basename = urllib.parse.quote_plus(request.param)

    with filelock.FileLock(global_tmp_path / f'{basename}.lock'):
        done_path = global_tmp_path / f'{basename}.done'

        if not done_path.exists():
            podman('pull', request.param, timeout=None)
            done_path.touch()

    return request.param


def pytest_addoption(parser):
    parser.addoption('--container-image', action='append')
    parser.addoption('--podman', default=['podman'], nargs='+')
    parser.addoption('--pull', default=False, action='store_true')
    parser.addoption('--screenshot-failing-only', default=False, action='store_true')


def pytest_configure(config):
    config.addinivalue_line(
        'markers', 'runtest_cm(func): wrap runtest hooks with context manager'
    )


def pytest_generate_tests(metafunc):
    if 'container_image' in metafunc.fixturenames:
        images = metafunc.config.getoption('--container-image')
        if not images:
            images = IMAGES

        metafunc.parametrize('container_image', images, indirect=True, scope='session')


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
