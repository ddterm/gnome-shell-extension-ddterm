import logging
import os
import subprocess
import tempfile
import urllib.parse

import filelock


LOGGER = logging.getLogger(__name__)


class Image:
    def make(self, podman, iidfile_dir):
        iidfile = iidfile_dir / urllib.parse.quote_plus(self.cache_key)

        with filelock.FileLock(iidfile.with_suffix('.lock')):
            if not iidfile.exists():
                self.build(podman, iidfile)

            return iidfile.read_text()


class ExistingImage(Image):
    def __init__(self, image):
        self.image = image

    @property
    def cache_key(self):
        return self.image

    def build(self, podman, iidfile):
        iidfile.write_bytes(self.get_id(podman))


class LocalImage(ExistingImage):
    def get_id(self, podman):
        LOGGER.info('Using local image for %r', self.image)
        return podman(
            'image', 'inspect', '-f', '{{.Id}}', self.image, stdout=subprocess.PIPE
        ).stdout.strip()


class RemoteImage(ExistingImage):
    def get_id(self, podman):
        LOGGER.info('Pulling remote image for %r', self.image)
        return podman('pull', image, stdout=subprocess.PIPE).stdout.strip()


class BuiltImage(Image):
    def __init__(self, dockerfile, pull=False):
        self.dockerfile = dockerfile
        self.pull = pull

    @property
    def cache_key(self):
        return self.dockerfile

    def build(self, podman, iidfile):
        LOGGER.info('Building image for %r', self.dockerfile)
        pull_arg = ('--pull',) if self.pull else tuple()
        podman(
            'build',
            *pull_arg,
            '--iidfile',
            str(iidfile),
            '-f',
            str(self.dockerfile),
            os.path.dirname(self.dockerfile)
        )
