import contextlib
import functools
import socket
import socketserver
import subprocess
import time

from . import container_util


@functools.singledispatch
def get_socket_address(arg):
    return arg


@get_socket_address.register
def _(arg: socketserver.BaseServer):
    return arg.server_address


@get_socket_address.register
def _(arg: socket.socket):
    return arg.getsockname()


class SystemdContainer(container_util.Container):
    REQUIRED_CAPS = [
        'SYS_NICE',
        'SYS_PTRACE',
        'SETPCAP',
        'NET_RAW',
        'NET_BIND_SERVICE',
        'DAC_READ_SEARCH',
        'IPC_LOCK',
    ]

    @classmethod
    def create(cls, podman, image, *args, syslog_server=None, **kwargs):
        kwargs.setdefault('tty', True)
        kwargs.setdefault('cap_add', cls.REQUIRED_CAPS)
        kwargs.setdefault('user', '0')

        if syslog_server:
            kwargs.setdefault('volumes', [])

            kwargs['volumes'].append((
                get_socket_address(syslog_server),
                '/run/systemd/journal/syslog'
            ))

            args += (
                'systemd.journald.forward_to_syslog=1',
                'systemd.journald.forward_to_console=0',
            )

        return super().create(podman, image, '/sbin/init', *args, **kwargs)

    def wait_system_running(self, **kwargs):
        timeout = kwargs.pop('timeout', self.podman.timeout)
        deadline = time.monotonic() + timeout

        self.exec(
            'busctl', '--system', '--watch-bind=true', 'status',
            **kwargs, timeout=timeout
        )

        self.exec(
            'systemctl', 'is-system-running', '--wait',
            **kwargs, timeout=deadline - time.monotonic()
        )

    def journal_message(self, msg, **kwargs):
        self.exec('systemd-cat', **kwargs, input=msg.encode(), interactive=True)

    def get_uid(self, user=None, **kwargs):
        if user in (None, 0, '0', 'root'):
            return 0  # Container starts under 'root' explicitly, see '.create()'

        with contextlib.suppress(ValueError):
            return int(user.split(':', maxsplit=1)[0])

        return int(
            super().exec(
                'id', '-u', **kwargs, user=user, stdout=subprocess.PIPE, text=True
            ).stdout.strip()
        )

    def get_user_dbus_address(self, user, **kwargs):
        with contextlib.suppress(KeyError):
            return kwargs['env']['DBUS_SESSION_BUS_ADDRESS']

        uid = self.get_uid(user, **kwargs)

        return None if uid == 0 else f'unix:path=/run/user/{uid}/bus'

    def get_user_env(self, user=None, env=dict(), **kwargs):
        if 'DBUS_SESSION_BUS_ADDRESS' in env:
            return env

        dbus_address = self.get_user_dbus_address(user, **kwargs, env=env)

        if dbus_address is None:
            return env

        return dict(env, DBUS_SESSION_BUS_ADDRESS=dbus_address)

    def exec(self, *args, user=None, env=dict(), **kwargs):
        timeout = kwargs.pop('timeout', self.podman.timeout)
        deadline = time.monotonic() + timeout

        env = self.get_user_env(user, env=env, timeout=timeout)

        return super().exec(
            *args,
            **kwargs,
            user=user,
            env=env,
            timeout=deadline - time.monotonic()
        )

    def wait_user_bus(self, user=None, **kwargs):
        timeout = kwargs.pop('timeout', self.podman.timeout)
        iter_time = timeout / 10
        deadline = time.monotonic() + timeout

        kwargs['env'] = self.get_user_env(**kwargs, user=user, timeout=timeout)

        while super().exec(
            'busctl',
            '--user',
            '--watch-bind=true',
            f'--timeout={min(iter_time, (deadline - time.monotonic()) / 2)}',
            'status',
            **kwargs,
            user=user,
            check=False,
            timeout=deadline - time.monotonic()
        ).returncode != 0:
            time.sleep(min(iter_time, (deadline - time.monotonic()) / 2))
