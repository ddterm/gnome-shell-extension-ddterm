# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import enum
import json
import logging
import pathlib

from gi.repository import GObject

from . import dbusutil, geometry, glibutil, logsync


LOGGER = logging.getLogger(__name__)

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
JS_FILE = THIS_DIR / 'shellhook.js'

BUS_NAME = 'org.gnome.Shell'
OBJECT_PATH = '/org/gnome/Shell/TestHook'
INTERFACE_NAME = 'org.gnome.Shell.TestHook'
INTROSPECT_FILE = THIS_DIR / 'dbus-interfaces' / f'{INTERFACE_NAME}.xml'


@enum.unique
class LaterType(enum.IntEnum):
    RESIZE = 0
    CALC_SHOWING = 1
    CHECK_FULLSCREEN = 2
    SYNC_STACK = 3
    BEFORE_REDRAW = 4
    IDLE = 5


@enum.unique
class MouseButton(enum.IntEnum):
    PRIMARY = 1
    MIDDLE = 2
    SECONDARY = 3


@enum.unique
class Key(enum.IntEnum):
    ESCAPE = 0xff1b


class _Base(dbusutil.Proxy):
    __dbus_interface_info__ = INTROSPECT_FILE.read_text()


class Proxy(_Base):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, g_name=BUS_NAME, g_object_path=OBJECT_PATH, **kwargs)

    @classmethod
    def create(cls, shell, timeout=None):
        if timeout is None:
            timeout = shell.get_default_timeout()

        deadline = glibutil.Deadline(timeout)

        shell.Eval(
            f'import({json.dumps(JS_FILE.as_uri())}).then(m => m.init())',
            timeout=timeout,
        )

        return super().create(
            g_connection=shell.get_connection(),
            timeout=deadline.remaining_ms,
            g_default_timeout=timeout,
        )

    @GObject.Property(flags=GObject.ParamFlags.READABLE)
    def Pointer(self):
        variant = super().Pointer

        if variant is None:
            return None

        return geometry.Point.parse_variant(variant)

    @GObject.Property(flags=GObject.ParamFlags.READABLE)
    def Workareas(self):
        variant = super().Workareas

        if variant is None:
            return None

        return [
            geometry.Rect.parse_variant(variant.get_child_value(i))
            for i in range(variant.n_children())
        ]

    def SetPointer(self, x, y, timeout=None):
        if timeout is None:
            timeout = self.get_default_timeout()

        target = geometry.Point(x=x, y=y)
        deadline = glibutil.Deadline(timeout)

        super().SetPointer(target.x, target.y, timeout=timeout)

        glibutil.dispatch_pending_sources()

        while self.Pointer != target:
            LOGGER.debug(
                'Pointer coordinates %r don\'t match expected %r',
                self.Pointer,
                target,
            )

            glibutil.wait_any_source(timeout_ms=deadline.check_remaining_ms())

    def mouse_down(self, button=MouseButton.PRIMARY):
        return super().SetMousePressed(button, True)

    def mouse_up(self, button=MouseButton.PRIMARY):
        return super().SetMousePressed(button, False)

    def key_down(self, key):
        return super().SetKeyPressed(key, True)

    def key_up(self, key):
        return super().SetKeyPressed(key, False)

    def Screenshot(self, path, **kwargs):
        return super().Screenshot(str(path), **kwargs)

    def Eval(self, code, **kwargs):
        result = super().Eval(code, **kwargs)

        return json.loads(result) if result else None

    def Later(self, when, **kwargs):
        super().Later(LaterType(when), **kwargs)
        glibutil.dispatch_pending_sources()

    def WaitLeisure(self, *, timeout=dbusutil.DEFAULT_LONG_TIMEOUT_MS, **kwargs):
        super().WaitLeisure(timeout=timeout, **kwargs)
        glibutil.dispatch_pending_sources()

    def Destroy(self, **kwargs):
        if self.is_connected():
            super().Destroy(**kwargs)


class LogSyncPlugin:
    def __init__(self, proxy):
        self.proxy = proxy

    @logsync.hookimpl
    def log_sync_message(self, msg):
        glibutil.dispatch_pending_sources()

        if not self.proxy.is_connected():
            return False

        self.proxy.LogMessage(msg)

        return True
