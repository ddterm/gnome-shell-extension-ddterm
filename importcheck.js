/*
    Copyright © 2022 Aleksandr Mezin

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

const System = imports.system;

const { GLib, Gio } = imports.gi;

function notify_error(title, body) {
    const proxy = Gio.DBusProxy.new_for_bus_sync(
        Gio.BusType.SESSION,
        Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES,
        null,
        'org.freedesktop.Notifications',
        '/org/freedesktop/Notifications',
        'org.freedesktop.Notifications',
        null
    );

    proxy.call_sync(
        'Notify',
        new GLib.Variant('(susssasa{sv}i)', [
            '',
            0,
            'dialog-error',
            title,
            body,
            [],
            [],
            -1,
        ]),
        Gio.DBusCallFlags.NONE,
        -1,
        null
    );
}

function import_error(ex, libname, version) {
    const title = `Can't start ddterm - library ${libname}, version ${version} not available`;
    const typelib_file = `${libname}-${version}.typelib`;
    const help = `You likely need to install the package that contains the file '${typelib_file}'`;

    logError(ex, title);
    log(help);

    notify_error(
        title,
        `<i>${GLib.markup_escape_text(help, -1)}</i>\n\n` +
        `${GLib.markup_escape_text(ex.toString(), -1)}`
    );
}

/* eslint-disable-next-line consistent-return */
function checked_import(libname, version) {
    try {
        imports.gi.versions[libname] = version;
        return imports.gi[libname];
    } catch (ex) {
        import_error(ex, libname, version);
        System.exit(1);
    }
}

/* exported checked_import */
