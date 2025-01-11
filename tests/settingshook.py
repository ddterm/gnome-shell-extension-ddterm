# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import json
import logging
import pathlib

from . import dbusutil, glibutil


LOGGER = logging.getLogger(__name__)

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
JS_FILE = THIS_DIR / 'settingshook.js'

BUS_NAME = 'org.gnome.Shell'
OBJECT_PATH = '/org/gnome/Shell/Extensions/ddterm/TestHook'
INTERFACE_NAME = 'com.github.amezin.ddterm.Settings'
INTROSPECT_FILE = THIS_DIR / 'dbus-interfaces' / f'{INTERFACE_NAME}.xml'


class Proxy(dbusutil.Proxy):
    __dbus_interface_info__ = INTROSPECT_FILE.read_text()

    @classmethod
    def create(cls, shell_hook, timeout=None):
        if timeout is None:
            timeout = shell_hook.get_default_timeout()

        deadline = glibutil.Deadline(timeout)

        shell_hook.Eval(
            f'import({json.dumps(JS_FILE.as_uri())}).then(m => m.init())',
            timeout=timeout,
        )

        proxy = super().create(
            g_connection=shell_hook.get_connection(),
            timeout=deadline.remaining_ms,
            g_default_timeout=timeout,
        )

        return proxy

    def __init__(self, *args, **kwargs):
        super().__init__(*args, g_name=BUS_NAME, g_object_path=OBJECT_PATH, **kwargs)

    def Destroy(self, **kwargs):
        if self.is_connected():
            self.call_sync('Destroy', **kwargs)
