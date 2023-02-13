import json
import logging
import shlex
import subprocess


LOGGER = logging.getLogger(__name__)


class Podman:
    DEFAULT_TIMEOUT = 2

    def __init__(self, base_args=('podman',)):
        self.base_args = tuple(base_args)

    def cmd(self, *args):
        return self.base_args + args

    def __call__(self, *args, **kwargs):
        kwargs.setdefault('check', True)
        kwargs.setdefault('timeout', self.DEFAULT_TIMEOUT)

        cmd = self.cmd(*args)
        cmd_str = shlex.join(cmd)

        LOGGER.info('Running: %s', cmd_str)
        try:
            proc = subprocess.run(cmd, **kwargs)
        finally:
            LOGGER.info('Done: %s', cmd_str)

        return proc

    def bg(self, *args, **kwargs):
        cmd = self.cmd(*args)
        LOGGER.info('Starting in background: %s', shlex.join(cmd))
        return subprocess.Popen(cmd, **kwargs)


class Container:
    def __init__(self, podman, container_id):
        self.container_id = container_id
        self.podman = podman
        self.console = None

    def kill(self):
        self.podman('kill', self.container_id, check=False)

        if self.console:
            self.console.wait(timeout=5)

    def attach(self):
        assert self.console is None

        self.console = self.podman.bg(
            'attach', '--no-stdin', '--sig-proxy=false', self.container_id,
            stdin=subprocess.DEVNULL, bufsize=0
        )

    @classmethod
    def run(cls, podman, *args, **kwargs):
        container_id = podman(
            'run', '-td', *args, stdout=subprocess.PIPE, text=True, **kwargs
        ).stdout

        if container_id.endswith('\n'):
            container_id = container_id[:-1]

        return cls(podman, container_id)

    def exec(self, *args, user=None, bg=False, interactive=False, env=None, **kwargs):
        exec_args = []

        if user is not None:
            exec_args.extend(('--user', user))

        if env:
            exec_args.extend(f'--env={k}={v}' for k, v in env.items())

        if interactive:
            exec_args.append('--interactive')

        return (self.podman.bg if bg else self.podman)(
            'exec', *exec_args, self.container_id, *args, **kwargs
        )

    def inspect(self, format=None):
        format_args = () if format is None else ('--format', format)

        return json.loads(self.podman(
            'container', 'inspect', *format_args, self.container_id,
            stdout=subprocess.PIPE
        ).stdout)

    def get_port(self, port):
        host, port = self.podman(
            'port', self.container_id, str(port),
            stdout=subprocess.PIPE, text=True
        ).stdout.strip().split(':', 1)

        return host, int(port)
