// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

const DEFAULT_FLAGS =
    Gio.DBusProxyFlags.DO_NOT_AUTO_START |
    Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES |
    Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS;

const BUS_NAME = 'org.gnome.Shell';
const OBJECT_PATH = '/org/gnome/Shell/Extensions/ddterm';

function load_introspection_xml() {
    const uri = GLib.Uri.resolve_relative(
        import.meta.url,
        '../../data/com.github.amezin.ddterm.Extension.xml',
        GLib.UriFlags.NONE
    );

    const [path] = GLib.filename_from_uri(uri);
    const [, bytes] = GLib.file_get_contents(path);

    return new TextDecoder().decode(bytes);
}

const proxy_factory = Gio.DBusProxy.makeProxyWrapper(load_introspection_xml());

export function create_extension_dbus_proxy(connection = null, flags = DEFAULT_FLAGS) {
    const flags_str = GObject.flags_to_string(Gio.DBusProxyFlags, flags);
    connection = connection ?? Gio.DBus.session;

    console.debug('Connecting to %O %O with flags %O', BUS_NAME, OBJECT_PATH, flags_str);

    const proxy = proxy_factory(connection, BUS_NAME, OBJECT_PATH, undefined, undefined, flags);

    console.debug('Connected to %O %O with flags %O', BUS_NAME, OBJECT_PATH, flags_str);

    return proxy;
}

export function create_extension_dbus_proxy_oneshot() {
    return create_extension_dbus_proxy(
        null,
        Gio.DBusProxyFlags.DO_NOT_AUTO_START |
        Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES |
        Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS
    );
}
