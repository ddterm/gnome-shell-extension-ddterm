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

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const BUS_NAME = 'org.freedesktop.PackageKit';
const OBJECT_PATH = '/org/freedesktop/PackageKit';

class PackageKitModify {
    constructor(proxy) {
        this._proxy = proxy;
    }

    install_package_names(names) {
        this._proxy.call(
            'InstallPackageNames',
            GLib.Variant.new_tuple([
                GLib.Variant.new_uint32(0),
                GLib.Variant.new_strv(names),
                GLib.Variant.new_string('hide-confirm-search'),
            ]),
            Gio.DBusCallFlags.ALLOW_INTERACTIVE_AUTHORIZATION,
            1000,  /* Wait 1 sec for obvious errors */
            null,
            check_call_result_ignore_timed_out
        );
    }
}

class PackageKitModify2 {
    constructor(proxy) {
        this._proxy = proxy;
    }

    install_package_names(names, app_id) {
        this._proxy.call(
            'InstallPackageNames',
            GLib.Variant.new_tuple([
                GLib.Variant.new_strv(names),
                GLib.Variant.new_string('hide-confirm-search'),
                GLib.Variant.new_string(app_id ?? ''),
                GLib.VariantDict.new(null).end(),
            ]),
            Gio.DBusCallFlags.ALLOW_INTERACTIVE_AUTHORIZATION,
            1000,  /* Wait 1 sec for obvious errors */
            null,
            check_call_result_ignore_timed_out
        );
    }
}

function check_call_result_ignore_timed_out(source, result) {
    try {
        source.call_finish(result);
    } catch (ex) {
        if (ex instanceof GLib.Error) {
            if (ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.TIMED_OUT))
                return;
        }

        logError(ex, 'PackageKit D-Bus call failed');
    }
}

function create_proxy_async(connection, interface_info, cancellable) {
    return new Promise((resolve, reject) => {
        Gio.DBusProxy.new(
            connection,
            Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES | Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS,
            interface_info,
            BUS_NAME,
            OBJECT_PATH,
            interface_info.name,
            cancellable,
            (source, result) => {
                try {
                    resolve(Gio.DBusProxy.new_finish(result));
                } catch (ex) {
                    reject(ex);
                }
            }
        );
    });
}

function introspect(connection, cancellable) {
    return new Promise((resolve, reject) => {
        connection.call(
            BUS_NAME,
            OBJECT_PATH,
            'org.freedesktop.DBus.Introspectable',
            'Introspect',
            null,
            new GLib.VariantType('(s)'),
            Gio.DBusCallFlags.NONE,
            -1,
            cancellable,
            (source, result) => {
                try {
                    const result_variant = source.call_finish(result);
                    const [result_string] = result_variant.get_child_value(0).get_string();

                    resolve(Gio.DBusNodeInfo.new_for_xml(result_string));
                } catch (ex) {
                    reject(ex);
                }
            }
        );
    });
}

export async function create_packagekit_proxy(cancellable) {
    const connection = Gio.DBus.session;
    const introspection = await introspect(connection, cancellable);
    const modify2 = introspection.lookup_interface('org.freedesktop.PackageKit.Modify2');

    if (modify2)
        return new PackageKitModify2(await create_proxy_async(connection, modify2, cancellable));

    const modify = introspection.lookup_interface('org.freedesktop.PackageKit.Modify');

    if (modify)
        return new PackageKitModify(await create_proxy_async(connection, modify, cancellable));

    throw new Error('No known interface found');
}
