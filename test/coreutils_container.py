import contextlib
import pathlib
import subprocess

from . import container_util


class CoreutilsContainer(container_util.Container):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self._uid_cache = {}
        self._homedir_cache = {}

    def get_uid(self, user=None, **kwargs):
        with contextlib.suppress(KeyError):
            return self._uid_cache[user]

        if user is not None:
            with contextlib.suppress(ValueError):
                return int(user.split(':', maxsplit=1)[0])

        uid = int(
            self.exec(
                'id', '-u', **kwargs, user=user, stdout=subprocess.PIPE, text=True
            ).stdout.strip()
        )

        self._uid_cache[user] = uid
        return uid

    def get_env(self, varname, **kwargs):
        value = self.exec(
            'printenv', varname,
            text=True, **kwargs, stdout=subprocess.PIPE
        ).stdout

        return value[:-1]

    def get_user_home(self, user=None, **kwargs):
        with contextlib.suppress(KeyError):
            return self._homedir_cache[user]

        home = pathlib.PurePosixPath(self.get_env('HOME', **kwargs, user=user))

        self._homedir_cache[user] = home
        return home

    def expanduser(self, path, **kwargs):
        if path.drive or path.root:
            return path

        if not path.parts:
            return path

        head = path.parts[0]

        if not head.startswith('~'):
            return path

        user = head[1:]

        if not user:
            user = kwargs.pop('user', None)

        home = self.get_user_home(**kwargs, user=user)

        return home / path.relative_to(head)

    def rm_path(self, path, **kwargs):
        return self.exec('rm', '-f', str(path), **kwargs)

    def mkdir(self, path, **kwargs):
        return self.exec('mkdir', '-p', str(path), **kwargs)

    def touch(self, path, **kwargs):
        return self.exec('touch', str(path), **kwargs)
