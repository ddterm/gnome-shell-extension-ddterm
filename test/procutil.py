import contextlib
import logging
import os
import shlex
import signal
import subprocess


LOGGER = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 25
DEFAULT_SHUTDOWN_TIMEOUT = 10


class Launcher:
    def tweak(self, args, kwargs):
        if env := kwargs.pop('env', None):
            new_env = dict(os.environ)
            new_env.update(env)
            kwargs['env'] = new_env

        return args, kwargs

    def run(self, *args, **kwargs):
        kwargs.setdefault('stdin', subprocess.DEVNULL)
        kwargs.setdefault('check', True)
        kwargs.setdefault('timeout', DEFAULT_TIMEOUT)

        args, kwargs = self.tweak(args, kwargs)

        LOGGER.info('Running command: %r', shlex.join(args))

        return subprocess.run(args, **kwargs)

    @contextlib.contextmanager
    def spawn(self, *args, shutdown_timeout=DEFAULT_SHUTDOWN_TIMEOUT, **kwargs):
        kwargs.setdefault('stdin', subprocess.DEVNULL)

        args, kwargs = self.tweak(args, kwargs)
        cmdline = shlex.join(args)

        LOGGER.info('Starting process: %r', cmdline)

        try:
            with subprocess.Popen(args, **kwargs) as popen:
                try:
                    yield popen

                finally:
                    try:
                        popen.wait(timeout=shutdown_timeout)

                    except subprocess.TimeoutExpired:
                        LOGGER.exception(
                            'Process %r %r did not terminate after %s seconds',
                            popen.pid,
                            cmdline,
                            shutdown_timeout,
                        )

                        popen.terminate()

                        try:
                            popen.wait(timeout=shutdown_timeout)

                        except subprocess.TimeoutExpired:
                            LOGGER.info(
                                'Trying to kill process %r %r',
                                popen.pid,
                                cmdline,
                            )

                            popen.kill()
                            raise

                        raise

        finally:
            if popen.returncode is None:
                LOGGER.info('Process %r %r is still running', popen.pid, cmdline)

            elif popen.returncode < 0:
                LOGGER.info(
                    'Process %r %r terminated by signal %s %s',
                    popen.pid,
                    cmdline,
                    -popen.returncode,
                    signal.strsignal(-popen.returncode),
                )

            else:
                LOGGER.info(
                    'Process %r %r exited with code %s',
                    popen.pid,
                    cmdline,
                    popen.returncode
                )


class ContainerExecLauncher(Launcher):
    def __init__(self, container_id, user):
        self.container_id = container_id
        self.user = user

    def tweak(self, args, kwargs):
        cwd = kwargs.get('cwd')

        new_args = [
            'podman',
            '--runtime=crun',
            'exec',
            '--user',
            str(self.user),
            '--workdir',
            str(cwd if cwd else os.getcwd()),
        ]

        if env := kwargs.pop('env', None):
            for k, v in env.items():
                new_args.append('--env')
                new_args.append(f'{k}={v}')

        if pass_fds := kwargs.get('pass_fds'):
            new_args.append('--preserve-fd')
            new_args.append(','.join(str(fd) for fd in pass_fds))

        new_args.append(self.container_id)
        new_args.extend(args)

        return new_args, kwargs
