/*
    Copyright © 2024 Aleksandr Mezin

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
        Gio.DBusProxyFlags.DO_NOT_AUTO_START | Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES
    );
}
