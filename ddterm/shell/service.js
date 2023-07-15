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

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { subprocess } = Me.imports.ddterm.shell;

var Service = GObject.registerClass(
    {
        'Properties': {
            'bus': GObject.ParamSpec.object(
                'bus',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.DBusConnection
            ),
            'bus-name': GObject.ParamSpec.string(
                'bus-name',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                null
            ),
            'subprocess': GObject.ParamSpec.object(
                'subprocess',
                '',
                '',
                GObject.ParamFlags.READABLE,
                subprocess.Subprocess
            ),
            'bus-name-owner': GObject.ParamSpec.string(
                'bus-name-owner',
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
        Signals: {
            'activate': {
                return_type: subprocess.Subprocess,
                accumulator: GObject.AccumulatorType.FIRST_WINS,
            },
        },
    },
    class DDTermService extends GObject.Object {
        _init(params) {
            // eslint-disable-next-line no-shadow
            const { subprocess, ...rest } = params;
            super._init(rest);

            this._subprocess = subprocess;
            this._bus_name_owner = null;

            this._bus_watch = Gio.bus_watch_name_on_connection(
                this.bus,
                this.bus_name,
                Gio.BusNameWatcherFlags.NONE,
                (connection, name, owner) => this._update_bus_name_owner(owner),
                () => this._update_bus_name_owner(null)
            );
        }

        get subprocess() {
            return this._subprocess;
        }

        get bus_name_owner() {
            return this._bus_name_owner;
        }

        get is_registered() {
            return Boolean(this._bus_name_owner);
        }

        unwatch() {
            if (this._bus_watch) {
                Gio.bus_unwatch_name(this._bus_watch);
                this._bus_watch = null;
            }
        }

        terminate() {
            this.subprocess?.terminate();
        }

        _activate() {
            if (this.subprocess)
                return this.subprocess;

            const new_subprocess = this.emit('activate');
            this._subprocess = new_subprocess;

            new_subprocess.wait().finally(() => {
                this._subprocess = null;
                this.notify('subprocess');
            });

            this.notify('subprocess');
            return new_subprocess;
        }

        _update_bus_name_owner(owner) {
            if (this._bus_name_owner === owner)
                return;

            log(`${this.bus_name}: name owner changed to ${JSON.stringify(owner)}`);
            this._bus_name_owner = owner;
            this.notify('bus-name-owner');
            this.notify('is-registered');
        }

        async start(cancellable = null) {
            if (this.is_registered)
                return;

            const inner_cancellable = Gio.Cancellable.new();
            const cancellable_chain = cancellable?.connect(() => inner_cancellable.cancel());

            try {
                const registered = new Promise(resolve => {
                    const handler = this.connect('notify::is-registered', () => {
                        if (this.is_registered)
                            resolve();
                    });

                    inner_cancellable.connect(() => {
                        this.disconnect(handler);
                    });
                });

                const terminated = this._activate().wait(inner_cancellable).then(() => {
                    throw new Error(
                        `${this.bus_name}: subprocess terminated without registering on D-Bus`
                    );
                });

                await Promise.race([registered, terminated]);
            } finally {
                cancellable?.disconnect(cancellable_chain);
                inner_cancellable.cancel();
            }
        }
    }
);

/* exported Service */
