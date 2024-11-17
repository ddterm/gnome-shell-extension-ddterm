# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
import pathlib

from gi.repository import GObject

from . import dbusutil, geometry


LOGGER = logging.getLogger(__name__)

BUS_NAME = 'org.gnome.Shell'
OBJECT_PATH = '/org/gnome/Shell/Extensions/ddterm'
INTERFACE_NAME = 'com.github.amezin.ddterm.Extension'

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
INTROSPECT_FILE = THIS_DIR / 'dbus-interfaces' / f'{INTERFACE_NAME}.xml'


class _Base(dbusutil.Proxy):
    __dbus_interface_info__ = INTROSPECT_FILE.read_text()


class Proxy(_Base):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, g_name=BUS_NAME, g_object_path=OBJECT_PATH, **kwargs)

    @GObject.Property(flags=GObject.ParamFlags.READABLE)
    def TargetRect(self):
        return geometry.Rect.parse_variant(super().TargetRect)

    def GetTargetRect(self, **kwargs):
        return geometry.Rect(*super().GetTargetRect(**kwargs))
