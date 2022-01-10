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
    def __init__(self, stream, line_callback):
        super().__init__()
        self.stream = stream
        self.line_callback = line_callback

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
        self.line_callback(line)

    def run(self):
        with self.stream:
            for line in self.iter_lines():
                self.process_line(line)

        self.process_line(b'')


class ConsoleReaderSubprocess(StreamReaderThread):
    def __init__(self, process, line_callback):
        super().__init__(process.stdout, line_callback)
        self.process = process

    def join(self, timeout=None):
        LOGGER.info('Waiting for console reader subprocess to stop')
        self.process.wait(timeout=timeout)
        LOGGER.info('Waiting for console reader thread to stop')
        super().join(timeout=timeout)
        LOGGER.info('Console reader shut down')

    @classmethod
    def spawn(cls, podman, container_id, line_callback):
        process = podman.bg(
            'attach', '--no-stdin', container_id,
            stderr=subprocess.STDOUT, stdout=subprocess.PIPE, bufsize=0
        )
        reader = cls(process, line_callback)
        reader.start()
        return reader


class Container:
    def __init__(self, podman, container_id):
        self.container_id = container_id
        self.podman = podman

        self.journal = None
        self.systemd_cat = None

        self.journal_sync_event = threading.Event()
        self.journal_sync_lock = threading.Lock()
        self.journal_sync_token = None
        self.shut_down = False

    def start_reading_journal(self):
        assert self.journal is None
        self.journal = ConsoleReaderSubprocess.spawn(
            self.podman,
            self.container_id,
            line_callback=self.journal_line
        )

    def kill(self):
        self.podman('kill', self.container_id, check=False)

        if self.journal:
            self.journal.join()

        if self.systemd_cat:
            self.systemd_cat.wait()

    def ensure_systemd_cat_running(self):
        if self.systemd_cat:
            res = self.systemd_cat.poll()
            if res is None:
                return

            LOGGER.error('systemd-cat exited with code %r, restarting...', res)

        self.systemd_cat = self.podman.bg(
            'exec', '-i', self.container_id, 'systemd-cat', '-p', 'notice', '--level-prefix=0',
            stdin=subprocess.PIPE, bufsize=0
        )

    def journal_write(self, message):
        self.ensure_systemd_cat_running()
        self.systemd_cat.stdin.write(message + b'\n')

    def journal_sync(self, token):
        with self.journal_sync_lock:
            if self.shut_down:
                return

            self.journal_sync_token = token
            self.journal_sync_event.clear()

        try:
            self.journal_write(token)
            self.journal_sync_event.wait(timeout=1)

        except Exception:
            LOGGER.exception("Can't sync journal")

    def journal_line(self, line):
        sys.stderr.buffer.write(line)

        with self.journal_sync_lock:
            if self.journal_sync_token is not None and self.journal_sync_token in line:
                self.journal_sync_event.set()

                if not line:
                    self.shut_down = True

    @classmethod
    def run(cls, podman, *args):
        container_id = podman(
            'run', '-td', *args, stdout=subprocess.PIPE, text=True
        ).stdout

        if container_id.endswith('\n'):
            container_id = container_id[:-1]

        return cls(podman, container_id)
