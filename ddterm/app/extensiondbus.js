// SPDX-FileCopyrightText: © 2024 Aleksandr Mezin
//
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';

import { get_resource_text } from './resources.js';

const proxy_factory = Gio.DBusProxy.makeProxyWrapper(
    get_resource_text('../com.github.amezin.ddterm.Extension.xml')
);

export function create_extension_dbus_proxy() {
    return proxy_factory(
        Gio.DBus.session,
        'org.gnome.Shell',
        '/org/gnome/Shell/Extensions/ddterm',
        undefined,
        undefined,
        Gio.DBusProxyFlags.DO_NOT_AUTO_START
    );
}
