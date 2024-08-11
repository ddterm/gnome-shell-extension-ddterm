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

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import System from 'system';

import { get_resource_text } from './resources.js';

export class DebugInterface {
    constructor() {
        this.dbus = Gio.DBusExportedObject.wrapJSObject(
            get_resource_text('../com.github.amezin.ddterm.Debug.xml'),
            this
        );
    }

    EvalAsync(params, invocation) {
        const [code] = params;

        function return_error(e) {
            if (e instanceof GLib.Error) {
                invocation.return_gerror(e);
                return;
            }

            let name = e.name;
            if (!name.includes('.'))
                name = `org.gnome.gjs.JSError.${name}`;

            invocation.return_dbus_error(name, e.toString());
        }

        try {
            Promise.resolve(eval(code)).then(result => {
                const json = result === undefined ? '' : JSON.stringify(result);

                invocation.return_value(GLib.Variant.new_tuple([GLib.Variant.new_string(json)]));
            }).catch(return_error);
        } catch (ex) {
            return_error(ex);
        }
    }

    GC() {
        System.gc();
    }

    DumpHeap(path) {
        System.dumpHeap(path);
    }
}
