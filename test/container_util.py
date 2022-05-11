import json
import logging
import shlex
import subprocess
import sys
import threading
import time


LOGGER = logging.getLogger(__name__)


class Podman:
    def __init__(self, base_args=('podman',)):
        self.base_args = tuple(base_args)

    def cmd(self, *args):
        return self.base_args + args

    def __call__(self, *args, **kwargs):
        kwargs.setdefault('check', True)
        kwargs.setdefault('timeout', 30)

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


class StreamReaderThread(threading.Thread):
    def __init__(self, stream):
        super().__init__()
        self.stream = stream

        self.wait_line_event = threading.Event()
        self.wait_line_lock = threading.Lock()
        self.wait_line_substr = None
        self.shut_down = False

    def iter_lines(self):
        current_line = bytes()

        while chunk := self.stream.read(4096):
            current_line += chunk
            lines = current_line.splitlines(keepends=True)

            if lines[-1].endswith(b'\n'):
                current_line = bytes()
            else:
                current_line = lines[-1]
                lines = lines[:-1]

            for line in lines:
                yield line

        if current_line:
            yield current_line

    def process_line(self, line):
        sys.stderr.buffer.write(line)

        with self.wait_line_lock:
            if self.wait_line_substr is not None and self.wait_line_substr in line:
                self.wait_line_event.set()

                if not line:
                    self.shut_down = True

    def run(self):
        with self.stream:
            for line in self.iter_lines():
                self.process_line(line)

        self.process_line(b'')

    def set_wait_line(self, substr):
        with self.wait_line_lock:
            if self.shut_down:
                return

            self.wait_line_substr = substr
            self.wait_line_event.clear()

    def wait_line(self, timeout=None):
        if not self.wait_line_event.wait(timeout=timeout):
            raise TimeoutError()


class ConsoleReaderSubprocess(StreamReaderThread):
    def __init__(self, process):
        super().__init__(process.stdout)
        self.process = process

    def join(self, timeout=None):
        LOGGER.info('Waiting for console reader subprocess to stop')
        self.process.wait(timeout=timeout)
        LOGGER.info('Waiting for console reader thread to stop')
        super().join(timeout=timeout)
        LOGGER.info('Console reader shut down')

    @classmethod
    def spawn(cls, container):
        process = container.podman.bg(
            'attach', '--no-stdin', container.container_id,
            stderr=subprocess.STDOUT, stdout=subprocess.PIPE, bufsize=0
        )
        reader = cls(process)
        reader.start()
        return reader


class Container:
    def __init__(self, podman, container_id):
        self.container_id = container_id
        self.podman = podman
        self.console = None

    def kill(self):
        self.podman('kill', self.container_id, check=False)

        if self.console:
            self.console.join()

    def start_console(self):
        assert self.console is None
        self.console = ConsoleReaderSubprocess.spawn(self)

    @classmethod
    def run(cls, podman, *args):
        container_id = podman(
            'run', '-td', *args, stdout=subprocess.PIPE, text=True
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
