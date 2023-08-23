import json
import logging
import shlex
import subprocess


LOGGER = logging.getLogger(__name__)


class Podman:
    DEFAULT_TIMEOUT = 2

    def __init__(self, *args, timeout=DEFAULT_TIMEOUT, **kwargs):
        self.args = args if args else ('podman',)
        self.timeout = timeout
        self.kwargs = kwargs

    def cmd(self, *args):
        return self.args + args

    def __call__(self, *args, **kwargs):
        kwargs = dict(self.kwargs, **kwargs)
        kwargs.setdefault('timeout', self.timeout)
        check = kwargs.pop('check', True)

        cmd = self.cmd(*args)
        cmd_str = shlex.join(cmd)

        LOGGER.info('%r: starting', cmd_str)
        proc = subprocess.run(cmd, **kwargs)

        ex = None if proc.returncode == 0 else subprocess.CalledProcessError(
            proc.returncode, cmd_str, proc.stdout, proc.stderr
        )

        log_format = '%(ex)s' if ex else '%(cmd)r: completed'

        if proc.stdout is not None:
            log_format += ' stdout: %(stdout)r'

        if proc.stderr is not None:
            log_format += ' stderr: %(stderr)r'

        LOGGER.info(
            log_format,
            dict(cmd=cmd_str, ex=ex, stdout=proc.stdout, stderr=proc.stderr)
        )

        if check and ex:
            raise ex

        return proc

    def bg(self, *args, **kwargs):
        kwargs = dict(self.kwargs, **kwargs)
        cmd = self.cmd(*args)

        LOGGER.info('%r: starting in background', shlex.join(cmd))
        return subprocess.Popen(cmd, **kwargs)


class Container:
    def __init__(
        self,
        podman,
        image,
        *cmd,
        volumes=[],
        publish=[],
        cap_add=[],
        tty=False,
        user=None,
        **kwargs
    ):
        self.podman = podman
        self.console = None

        args = ['container', 'create', '--pull=never', '--log-driver=none']

        if tty:
            args.append('--tty')

        for volume_spec in volumes:
            args.extend(('--volume', ':'.join(str(part) for part in volume_spec)))

        for port_spec in publish:
            args.extend(('--publish', ':'.join(str(part) for part in port_spec)))

        if cap_add:
            args.extend(('--cap-add', ','.join(cap_add)))

        if user:
            args.extend(('--user', str(user)))

        args.append(image)
        args.extend(cmd)

        self.container_id = podman(
            *args, **kwargs, stdout=subprocess.PIPE, text=True
        ).stdout.strip()

    def rm(self, *, timeout=None, **kwargs):
        timeout = self.podman.timeout if timeout is None else timeout

        self.podman(
            'container', 'rm', '-t', str(timeout), '--force', '--volumes', self.container_id,
            timeout=timeout * 2, **kwargs
        )

        if self.console:
            self.console.wait(timeout=timeout)
            self.console = None

    def start(self, **kwargs):
        if self.console is not None:
            raise RuntimeError(f'There is already a console process: {self.console}')

        self.console = self.podman.bg(
            'container', 'start', '--attach', '--sig-proxy=false', self.container_id,
            stdin=subprocess.DEVNULL, stdout=None, stderr=None
        )

        self.podman(
            'container', 'wait', '--condition', 'running', self.container_id, **kwargs
        )

    def exec(self, *args, user=None, bg=False, interactive=False, env=None, **kwargs):
        exec_args = []

        if user is not None:
            exec_args.append(f'--user={user}')

        if env:
            exec_args.extend(f'--env={k}={v}' for k, v in env.items())

        if interactive:
            exec_args.append('--interactive')

        return (self.podman.bg if bg else self.podman)(
            'container', 'exec', *exec_args, self.container_id, *args, **kwargs
        )

    def inspect(self, format='.', **kwargs):
        return json.loads(self.podman(
            'container', 'inspect', f'--format={{json {format}}}', self.container_id,
            **kwargs, stdout=subprocess.PIPE  # text=True not required!
        ).stdout)

    def get_port(self, port, **kwargs):
        host, port = self.podman(
            'container', 'port', self.container_id, str(port),
            **kwargs, stdout=subprocess.PIPE, text=True
        ).stdout.strip().split(':', 1)

        return host, int(port)
