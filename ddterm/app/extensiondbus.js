/*
    Copyright © 2023 Aleksandr Mezin

    This file is part of ddterm GNOME Shell extension.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use strict';

const { Gio } = imports.gi;
const ByteArray = imports.byteArray;

const Me = imports.misc.extensionUtils.getCurrentExtension();

const DDTERM_DIR = Me.dir.get_child('ddterm');
const EXTENSION_DBUS_XML = ByteArray.toString(
    DDTERM_DIR.get_child('com.github.amezin.ddterm.Extension.xml').load_contents(null)[1]
);

var ExtensionDBusProxy = Gio.DBusProxy.makeProxyWrapper(EXTENSION_DBUS_XML);

function get() {
    return new ExtensionDBusProxy(
        Gio.DBus.session,
        'org.gnome.Shell',
        '/org/gnome/Shell/Extensions/ddterm',
        undefined,
        undefined,
        Gio.DBusProxyFlags.DO_NOT_AUTO_START
    );
}

/* exported ExtensionDBusProxy get */
