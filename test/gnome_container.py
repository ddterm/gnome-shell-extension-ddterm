import json
import pathlib
import time

import Xlib.display

from . import dbus_util, systemd_container


USER_NAME = 'gnomeshell'

EXTENSIONS_INSTALL_DIR_RELATIVE = pathlib.PurePosixPath('share/gnome-shell/extensions')
EXTENSIONS_INSTALL_DIR_SYSTEM = pathlib.PurePosixPath('/usr') / EXTENSIONS_INSTALL_DIR_RELATIVE

DISPLAY_NUMBER = 99
X11_DISPLAY_BASE_PORT = 6000
USER_BUS_PORT = 1234

_DEFAULT = object()


class GnomeContainer(systemd_container.SystemdContainer):
    def __init__(
        self,
        *args,
        publish=[],
        user_bus_port=USER_BUS_PORT,
        x11_display_number=DISPLAY_NUMBER,
        user=USER_NAME,
        unit='multi-user.target',
        **kwargs
    ):
        x11_display_port = x11_display_number + X11_DISPLAY_BASE_PORT

        publish = list(publish) + [
            ('127.0.0.1', '', user_bus_port),
            ('127.0.0.1', '', x11_display_port)
        ]

        super().__init__(*args, publish=publish, unit=unit, **kwargs)

        self.user = user
        self.x11_display_number = x11_display_number
        self.x11_display_port = x11_display_port
        self.user_bus_port = user_bus_port

    def connect_x11_display(self, timeout=_DEFAULT):
        if timeout is _DEFAULT:
            timeout = self.podman.timeout

        deadline = time.monotonic() + timeout

        self.exec(
            'systemctl', 'start', f'xvfb@:{self.x11_display_number}',
            timeout=timeout
        )

        host, port = self.get_port(self.x11_display_port, timeout=deadline - time.monotonic())
        display_number = int(port) - X11_DISPLAY_BASE_PORT

        return Xlib.display.Display(f'{host}:{display_number}')  # Doesn't support timeout?

    def connect_user_bus(self, timeout=_DEFAULT):
        if timeout is _DEFAULT:
            timeout = self.podman.timeout

        deadline = time.monotonic() + timeout

        self.exec(
            'systemctl', '--user', 'start', f'dbus-proxy@{self.user_bus_port}',
            timeout=timeout, user=self.user
        )

        host, port = self.get_port(self.user_bus_port, timeout=deadline - time.monotonic())

        return dbus_util.connect_tcp(host, port, timeout=int((deadline - time.monotonic()) * 1000))

    def install_extension(self, path, **kwargs):
        return self.exec('gnome-extensions', 'install', str(path), **kwargs, user=self.user)

    def gsettings_set(self, schema, key, value, **kwargs):
        return self.exec(
            'gsettings', 'set', schema, key, json.dumps(value),
            user=self.user, **kwargs
        )

    def disable_welcome_dialog(self, **kwargs):
        return self.gsettings_set(
            'org.gnome.shell', 'welcome-dialog-last-shown-version', '99.0',
            **kwargs
        )

    @staticmethod
    def extensions_system_install_path():
        return EXTENSIONS_INSTALL_DIR_SYSTEM

    def extensions_user_install_path(self, **kwargs):
        home = self.get_user_home(user=self.user, **kwargs)
        return home / '.local' / EXTENSIONS_INSTALL_DIR_RELATIVE

    def start_session(self, unit_name, **kwargs):
        return self.exec(
            'systemctl', 'start', f'{unit_name}@:{self.x11_display_number}.target',
            **kwargs
        )
