// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { get_resource_text } from './meta.js';

const proxy_factory = Gio.DBusProxy.makeProxyWrapper(
    get_resource_text('../../data/com.github.amezin.ddterm.Extension.xml')
);

const DEFAULT_FLAGS =
    Gio.DBusProxyFlags.DO_NOT_AUTO_START |
    Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES |
    Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS;

const BUS_NAME = 'org.gnome.Shell';
const OBJECT_PATH = '/org/gnome/Shell/Extensions/ddterm';

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
