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

'use strict';

const { GLib, GObject, Gio } = imports.gi;

/* exported DisplayConfig LayoutMode */

var LayoutMode = {
    LOGICAL: 1,
    PHYSICAL: 2,
};

const BUS_NAME = 'org.gnome.Mutter.DisplayConfig';
const OBJECT_PATH = '/org/gnome/Mutter/DisplayConfig';
const INTERFACE_NAME = 'org.gnome.Mutter.DisplayConfig';

const CURRENT_STATE_TYPE = GLib.VariantType.new_tuple([
    new GLib.VariantType('u'), // serial
    new GLib.VariantType('a((ssss)a(siiddada{sv})a{sv})'), // monitors
    new GLib.VariantType('a(iiduba(ssss)a{sv})'), // logical_monitors
    new GLib.VariantType('a{sv}'), // properties
]);

var DisplayConfig = GObject.registerClass(
    {
        Properties: {
            'current-state': GObject.param_spec_variant(
                'current-state',
                '',
                '',
                CURRENT_STATE_TYPE,
                null,
                GObject.ParamFlags.READABLE
            ),
            'layout-mode': GObject.ParamSpec.int(
                'layout-mode',
                '',
                '',
                GObject.ParamFlags.READABLE,
                0
            ),
        },
    },
    class DDTermDisplayConfig extends GObject.Object {
        _init(params) {
            super._init(params);

            this._cancellable = null;
            this._layout_mode = 0;

            this._change_handler = Gio.DBus.session.signal_subscribe(
                BUS_NAME,
                INTERFACE_NAME,
                'MonitorsChanged',
                OBJECT_PATH,
                null,
                Gio.DBusSignalFlags.NONE,
                () => this.update_async()
            );

            this.update();
        }

        get current_state() {
            return this._current_state;
        }

        get layout_mode() {
            return this._layout_mode;
        }

        update() {
            this._cancellable?.cancel();
            this._cancellable = new Gio.Cancellable();

            this._parse_current_state(
                Gio.DBus.session.call_sync(
                    BUS_NAME,
                    OBJECT_PATH,
                    INTERFACE_NAME,
                    'GetCurrentState',
                    null,
                    CURRENT_STATE_TYPE,
                    Gio.DBusCallFlags.NO_AUTO_START,
                    -1,
                    this._cancellable
                )
            );
        }

        update_async() {
            this._cancellable?.cancel();
            this._cancellable = new Gio.Cancellable();

            Gio.DBus.session.call(
                BUS_NAME,
                OBJECT_PATH,
                INTERFACE_NAME,
                'GetCurrentState',
                null,
                CURRENT_STATE_TYPE,
                Gio.DBusCallFlags.NO_AUTO_START,
                -1,
                this._cancellable,
                (source, result) => {
                    try {
                        this._parse_current_state(source.call_finish(result));
                    } catch (error) {
                        if (!(error instanceof GLib.Error &&
                              error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)))
                            throw error;
                    }
                }
            );
        }

        _parse_current_state(state) {
            if (this._current_state?.equal(state))
                return;

            this._current_state = state;
            this.freeze_notify();

            try {
                const properties = this.current_state.get_child_value(3);
                const layout_mode = properties.lookup_value('layout-mode', null)?.unpack();

                if (layout_mode !== this._layout_mode) {
                    this._layout_mode = layout_mode;
                    this.notify('layout-mode');
                }
            } finally {
                this.thaw_notify();
            }
        }

        unwatch() {
            if (this._change_handler) {
                Gio.DBus.session.signal_unsubscribe(this._change_handler);
                this._change_handler = null;
            }

            this._cancellable?.cancel();
        }
    }
);
