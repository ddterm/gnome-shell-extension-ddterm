#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: CC0-1.0

import os
import shutil
import subprocess
import time

from gi.repository import Gio, GLib


ddterm_launcher = shutil.which('com.github.amezin.ddterm')

if not ddterm_launcher:
    ddterm_launcher = shutil.which('com.github.amezin.ddterm', path=os.pathsep.join((
        os.path.expanduser('~/.local/share/gnome-shell/extensions/ddterm@amezin.github.com/bin'),
        '/usr/share/gnome-shell/extensions/ddterm@amezin.github.com/bin',
    )))

proxy = Gio.DBusProxy.new_for_bus_sync(
    Gio.BusType.SESSION,
    Gio.DBusProxyFlags.DO_NOT_AUTO_START,
    None,
    'org.gnome.Shell',
    '/org/gnome/Shell/Extensions/ddterm',
    'com.github.amezin.ddterm.Extension',
    None,
)

loop = GLib.MainLoop()


def on_properties_changed(proxy, changed, invalidated):
    if proxy.get_cached_property('HasWindow').get_boolean():
        loop.quit()


proxy.connect('g-properties-changed', on_properties_changed)

start = time.perf_counter()

subprocess.run([ddterm_launcher], check=True)

if not proxy.get_cached_property('HasWindow').get_boolean():
    loop.run()

print(time.perf_counter() - start)
