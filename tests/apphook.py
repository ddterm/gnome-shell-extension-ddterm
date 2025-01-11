# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import json
import logging
import pathlib

from . import dbusutil, glibutil


LOGGER = logging.getLogger(__name__)

BUS_NAME = 'com.github.amezin.ddterm'
OBJECT_PATH = '/com/github/amezin/ddterm'
INTERFACE_NAME = 'com.github.amezin.ddterm.Debug'

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
INTROSPECT_FILE = THIS_DIR / 'dbus-interfaces' / f'{INTERFACE_NAME}.xml'
JS_FILE = THIS_DIR / 'apphook.js'

APP_EXTRA_ARGS = (f'--debug-module={JS_FILE.as_uri()}',)


class _Base(dbusutil.Proxy):
    __dbus_interface_info__ = INTROSPECT_FILE.read_text()


class Proxy(_Base):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, g_name=BUS_NAME, g_object_path=OBJECT_PATH, **kwargs)

        self.reset_size_allocations()

        self.connect('SizeAllocate', Proxy._record_size_allocate)

    def Eval(self, code, **kwargs):
        result = super().Eval(code, **kwargs)

        return json.loads(result) if result else None

    def WaitFrame(self, **kwargs):
        super().WaitFrame(**kwargs)
        glibutil.dispatch_pending_sources()

    def DumpHeap(self, path, **kwargs):
        return super().DumpHeap(str(path), **kwargs)

    def _record_size_allocate(self, width, height):
        size = width, height

        if not self.size_allocations or self.size_allocations[-1] != size:
            self.size_allocations.append(size)

    def reset_size_allocations(self):
        self.size_allocations = []

    def wait_connected(self, timeout=None):
        if timeout is None:
            timeout = self.get_default_timeout()

        deadline = glibutil.Deadline(timeout)

        self.wait_name_owner(timeout)
        self.wait_property('Connected', True, timeout=deadline.remaining_ms)
