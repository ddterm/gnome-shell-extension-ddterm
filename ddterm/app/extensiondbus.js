// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';

import { get_resource_text } from './resources.js';

const proxy_factory = Gio.DBusProxy.makeProxyWrapper(
    get_resource_text('../com.github.amezin.ddterm.Extension.xml')
);

const DEFAULT_FLAGS =
    Gio.DBusProxyFlags.DO_NOT_AUTO_START |
    Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES |
    Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS;

export function create_extension_dbus_proxy(connection = null, flags = DEFAULT_FLAGS) {
    return proxy_factory(
        connection ?? Gio.DBus.session,
        'org.gnome.Shell',
        '/org/gnome/Shell/Extensions/ddterm',
        undefined,
        undefined,
        flags
    );
}

export function create_extension_dbus_proxy_oneshot() {
    return create_extension_dbus_proxy(
        null,
        Gio.DBusProxyFlags.DO_NOT_AUTO_START |
        Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES |
        Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS
    );
}
