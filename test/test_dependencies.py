import pathlib

import pytest


THIS_DIR = pathlib.Path(__file__).parent.resolve()
SRC_DIR = THIS_DIR.parent

USER_NAME = 'gnomeshell'


@pytest.fixture(scope='session')
def container_volumes():
    return ((SRC_DIR, SRC_DIR, 'ro'),)


def test_manifest(container):
    container.exec(
        str(SRC_DIR / 'ddterm' / 'app' / 'tools' / 'dependencies-update.js'),
        '--dry-run',
        timeout=60,
        user=USER_NAME,
    )
