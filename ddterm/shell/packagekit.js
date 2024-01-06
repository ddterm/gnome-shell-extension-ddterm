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

const modify2_interface_spec = `
<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
"http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node name="/org/freedesktop/PackageKit" xmlns:doc="http://www.freedesktop.org/dbus/1.0/doc.dtd">
    <interface name="org.freedesktop.PackageKit.Modify2">
        <method name="InstallPackageNames">
            <arg type="as" name="packages" direction="in"/>
            <arg type="s" name="interaction" direction="in"/>
            <arg type="s" name="desktop_id" direction="in"/>
            <arg type="a{sv}" name="platform_data" direction="in"/>
        </method>
    </interface>
</node>
`;

class PackageKit {
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
            -1,
            null,
            null
        );
    }
}

export function create_packagekit_proxy(cancellable) {
    return new Promise((resolve, reject) => {
        const node_info = Gio.DBusNodeInfo.new_for_xml(modify2_interface_spec);

        Gio.DBusProxy.new(
            Gio.DBus.session,
            Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES | Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS,
            node_info.interfaces[0],
            'org.freedesktop.PackageKit',
            node_info.path,
            node_info.interfaces[0].name,
            cancellable,
            (source, result) => {
                try {
                    resolve(new PackageKit(Gio.DBusProxy.new_finish(result)));
                } catch (ex) {
                    reject(ex);
                }
            }
        );
    });
}
