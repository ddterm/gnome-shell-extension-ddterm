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

const { GObject, Gio } = imports.gi;

var BusNameWatch = GObject.registerClass(
    {
        Properties: {
            'connection': GObject.ParamSpec.object(
                'connection',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.DBusConnection
            ),
            'name': GObject.ParamSpec.string(
                'name',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                null
            ),
            'owner': GObject.ParamSpec.string(
                'owner',
                '',
                '',
                GObject.ParamFlags.READABLE,
                null
            ),
            'is-registered': GObject.ParamSpec.boolean(
                'is-registered',
                '',
                '',
                GObject.ParamFlags.READABLE,
                false
            ),
        },
    },
    class DDTermBusNameWatch extends GObject.Object {
        _init(params) {
            super._init(params);

            this._owner = null;

            this._watch_id = Gio.bus_watch_name_on_connection(
                this.connection,
                this.name,
                Gio.BusNameWatcherFlags.NONE,
                (connection, name, owner) => this._update_owner(owner),
                () => this._update_owner(null)
            );
        }

        get owner() {
            return this._owner;
        }

        get is_registered() {
            return this._owner !== null;
        }

        _update_owner(owner) {
            if (this._owner === owner)
                return;

            printerr(`${JSON.stringify(this.name)} owner changed to ${JSON.stringify(owner)}`);

            const prev_registered = this.is_registered;

            this._owner = owner;

            this.freeze_notify();

            this.notify('owner');

            if (prev_registered !== this.is_registered)
                this.notify('is-registered');

            this.thaw_notify();
        }

        unwatch() {
            if (this._watch_id) {
                Gio.bus_unwatch_name(this._watch_id);
                this._watch_id = null;
            }
        }
    }
);

/* exported BusNameWatch */
