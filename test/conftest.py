import contextlib
import logging
import math
import os
import pathlib
import urllib.parse

import filelock
import pytest

from . import container_util, xdist_sched


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
    dockerfile = request.param
    context = os.path.dirname(dockerfile)
    iidfile = iidfile_dir / urllib.parse.quote_plus(dockerfile)

    with filelock.FileLock(iidfile.with_suffix('.lock')):
        if iidfile.exists():
            LOGGER.info('Using cached result for %s', dockerfile)
        else:
            LOGGER.info('Building %s', dockerfile)
            podman('build', '--iidfile', str(iidfile), '-f', str(dockerfile), context)
            LOGGER.info('Built %s', dockerfile)

        return iidfile.read_text()


@pytest.fixture(scope='session')
def extension_pack(request):
    if request.param:
        return request.param.resolve()


def pytest_addoption(parser):
    parser.addoption('--dockerfile', action='append', default=[], type=pathlib.Path)
    parser.addoption('--podman', default=['podman'], nargs='+')
    parser.addoption('--screenshot-failing-only', default=False, action='store_true')
    parser.addoption('--pack', default=None, type=pathlib.Path)


def pytest_configure(config):
    dockerfiles = config.getoption('--dockerfile')

    if not dockerfiles:
        dockerfiles = (TEST_SRC_DIR / 'images').glob('*.dockerfile')

    config.stash[IMAGES_STASH_KEY] = [
        pytest.param(
            min(os.path.abspath(dockerfile), os.path.relpath(dockerfile), key=len),
            marks=pytest.mark.uses_dockerfile.with_args(dockerfile)
        )
        for dockerfile in dockerfiles
    ]


def pytest_generate_tests(metafunc):
    if 'container_image' in metafunc.fixturenames:
        metafunc.parametrize(
            'container_image',
            metafunc.config.stash[IMAGES_STASH_KEY],
            indirect=True,
            scope='session'
        )

    if 'extension_pack' in metafunc.fixturenames:
        metafunc.parametrize(
            'extension_pack',
            [metafunc.config.getoption('--pack')],
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


def pytest_xdist_make_scheduler(config, log):
    if config.getvalue('dist') == 'load':
        return xdist_sched.LoadScheduling(config, log)


@pytest.hookimpl(hookwrapper=True)
def pytest_xdist_auto_num_workers(config):
    result = yield
    result.force_result(math.ceil(result.get_result() * 2 / 3))
