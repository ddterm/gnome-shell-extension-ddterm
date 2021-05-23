/*
    Copyright © 2020, 2021 Aleksandr Mezin

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

/* exported parse_rgba UtilMixin APP_DATA_DIR enum_from_settings */

const { GObject, Gio, Gdk } = imports.gi;

var APP_DATA_DIR = null;

function parse_rgba(s) {
    if (!s)
        return null;

    const v = new Gdk.RGBA();

    if (v.parse(s))
        return v;

    return null;
}

function enum_from_settings(nick, enum_class) {
    return enum_class[nick.replace(/-/g, '_').toUpperCase()];
}

// Signal connections and settings bindings, with lifetime bound to lifetime of 'this'
var UtilMixin = {
    run_on_destroy(func, obj = null) {
        let this_destroy_id = null, obj_destroy_id = null;

        const disconnect_func = () => {
            if (this_destroy_id)
                GObject.signal_handler_disconnect(this, this_destroy_id);

            if (obj_destroy_id)
                GObject.signal_handler_disconnect(obj, obj_destroy_id);

            func();
            obj = null;
        };

        this_destroy_id = GObject.signal_connect(this, 'destroy', disconnect_func);

        if (obj !== null && obj !== this && GObject.signal_lookup('destroy', obj.constructor.$gtype))
            obj_destroy_id = GObject.signal_connect(obj, 'destroy', disconnect_func);
    },

    disconnect_on_destroy(obj, handler_id) {
        this.run_on_destroy(
            GObject.signal_handler_disconnect.bind(null, obj, handler_id),
            obj
        );
        return handler_id;
    },

    signal_connect(source, signal, handler) {
        return this.disconnect_on_destroy(
            source, GObject.signal_connect(source, signal, handler)
        );
    },

    method_handler(source, signal, method) {
        return this.signal_connect(source, signal, method.bind(this));
    },

    settings_bind(key, target, property = null, flags = Gio.SettingsBindFlags.DEFAULT) {
        if (property === null)
            property = key;

        this.settings.bind(key, target, property, flags);
        this.run_on_destroy(
            Gio.Settings.unbind.bind(null, target, property),
            target
        );
    },

    bind_settings_ro(key, target, property = null, flags = Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY) {
        this.settings_bind(key, target, property, flags);
    },
};
