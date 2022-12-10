import contextlib
import json
import logging
import os
import shlex
import subprocess
import sys
import threading


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


class QueueOutput:
    def __init__(self, queue, filter=lambda _: True, close_token=b''):
        self.buffer = queue
        self.filter = filter
        self.close_token = close_token

    def write(self, line):
        if self.filter(line):
            self.buffer.put(line)

    def close(self):
        self.buffer.put(self.close_token)


class TeeLines(threading.Thread):
    def __init__(self, input):
        super().__init__()
        self.input = input
        self.outputs = []
        self.outputs_lock = threading.Lock()
        self.closed = False

    def add_output(self, output):
        with self.outputs_lock:
            if self.closed:
                output.close()

            self.outputs.append(output)

    def remove_output(self, output):
        with self.outputs_lock:
            self.outputs.remove(output)

    def run(self):
        try:
            try:
                while line := self.input.readline():
                    for output in self.outputs.copy():
                        output.write(line)

            finally:
                with self.outputs_lock:
                    self.closed = True

                    for output in self.outputs:
                        output.close()

        except Exception:
            LOGGER.exception('Exception in Tee thread')
            raise

    @contextlib.contextmanager
    def with_output(self, output):
        self.add_output(output)

        try:
            yield

        finally:
            self.remove_output(output)


class Console(TeeLines):
    def __init__(self, process):
        super().__init__(process.stdout)
        self.process = process

    def join(self, timeout=None):
        try:
            LOGGER.info('Waiting for console reader subprocess to stop')
            self.process.wait(timeout=timeout)

        finally:
            LOGGER.info('Waiting for console reader thread to stop')
            super().join(timeout=timeout)
            LOGGER.info('Console reader shut down')


class Container:
    def __init__(self, podman, container_id):
        self.container_id = container_id
        self.podman = podman
        self.console = None

    def kill(self):
        self.podman('kill', self.container_id, check=False)

        if self.console:
            self.console.join(timeout=5)

    def attach(self):
        assert self.console is None

        process = self.podman.bg(
            'attach', '--no-stdin', '--sig-proxy=false', self.container_id,
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, bufsize=0
        )

        console = Console(process)
        console.add_output(os.fdopen(os.dup(sys.stdout.fileno()), 'wb', buffering=0))
        console.start()
        self.console = console

    @classmethod
    def run(cls, podman, *args, timeout=None):
        container_id = podman(
            'run', '-td', *args, stdout=subprocess.PIPE, text=True, timeout=timeout
        ).stdout

        if container_id.endswith('\n'):
            container_id = container_id[:-1]

        return cls(podman, container_id)

    def exec(self, *args, user=None, bg=False, env=None, **kwargs):
        user_args = [] if user is None else ['--user', user]

        if env:
            user_args.extend(f'--env={k}={v}' for k, v in env.items())

        return (self.podman.bg if bg else self.podman)(
            'exec', *user_args, self.container_id, *args, **kwargs
        )

    def inspect(self, format=None):
        format_args = () if format is None else ('--format', format)

        return json.loads(self.podman(
            'container', 'inspect', *format_args, self.container_id,
            stdout=subprocess.PIPE
        ).stdout)
