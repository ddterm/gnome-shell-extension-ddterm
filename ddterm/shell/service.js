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

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { Subprocess, WaylandSubprocess } from './subprocess.js';

export const Service = GObject.registerClass({
    Properties: {
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
        'executable': GObject.ParamSpec.string(
            'executable',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'wayland': GObject.ParamSpec.boolean(
            'wayland',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'extra-argv': GObject.ParamSpec.boxed(
            'extra-argv',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            GObject.type_from_name('GStrv')
        ),
        'subprocess': GObject.ParamSpec.object(
            'subprocess',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Subprocess
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
        'is-running': GObject.ParamSpec.boolean(
            'is-running',
            '',
            '',
            GObject.ParamFlags.READABLE,
            false
        ),
        'starting': GObject.ParamSpec.boolean(
            'starting',
            '',
            '',
            GObject.ParamFlags.READABLE,
            false
        ),
    },
    Signals: {
        'error': {
            param_types: [Object],
        },
    },
}, class DDTermService extends GObject.Object {
    _init(params) {
        const { subprocess, ...rest } = params;
        super._init(rest);

        this._starting = false;
        this._subprocess = subprocess;
        this._subprocess_running = subprocess?.is_running ?? false;

        if (subprocess)
            this._subprocess_wait = this._wait_subprocess();

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

    get is_running() {
        return this._subprocess_running;
    }

    get starting() {
        return this._starting;
    }

    unwatch() {
        this._subprocess_wait_cancel?.cancel();

        if (this._bus_watch) {
            Gio.bus_unwatch_name(this._bus_watch);
            this._bus_watch = null;
        }
    }

    terminate() {
        this.subprocess?.terminate();
    }

    _create_subprocess() {
        const argv = [
            this.executable,
            '--gapplication-service',
            this.wayland ? '--allowed-gdk-backends=wayland' : '--allowed-gdk-backends=x11',
            ...this.extra_argv,
        ];

        if (this.wayland)
            return new WaylandSubprocess({ journal_identifier: this.bus_name, argv });
        else
            return new Subprocess({ journal_identifier: this.bus_name, argv });
    }

    _wait_subprocess() {
        this._subprocess_wait_cancel = new Gio.Cancellable();

        return this.subprocess.wait_check(this._subprocess_wait_cancel).catch(ex => {
            if (this.starting)
                return;

            if (ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED))
                return;

            this.emit('error', ex);
        }).finally(() => {
            this._subprocess_running = false;
            this.notify('is-running');
        });
    }

    _update_bus_name_owner(owner) {
        if (this._bus_name_owner === owner)
            return;

        const prev_registered = this.is_registered;

        log(`${this.bus_name}: name owner changed to ${JSON.stringify(owner)}`);

        this._bus_name_owner = owner;
        this.notify('bus-name-owner');

        if (prev_registered !== this.is_registered)
            this.notify('is-registered');
    }

    async start(cancellable = null) {
        if (this.is_registered)
            return;

        this._starting = true;
        this.notify('starting');

        try {
            const inner_cancellable = Gio.Cancellable.new();
            const cancellable_chain = cancellable?.connect(() => inner_cancellable.cancel());

            try {
                if (!this.is_running) {
                    this._subprocess = this._create_subprocess();
                    this._subprocess_running = true;
                    this.notify('subprocess');
                    this.notify('is-running');
                    this._subprocess_wait = this._wait_subprocess();
                }

                const registered = new Promise(resolve => {
                    const handler = this.connect('notify::is-registered', () => {
                        if (this.is_registered)
                            resolve();
                    });

                    inner_cancellable.connect(() => {
                        this.disconnect(handler);
                    });
                });

                await Promise.race([registered, this._subprocess_wait]);
            } finally {
                cancellable?.disconnect(cancellable_chain);
                inner_cancellable.cancel();
            }

            if (!this.is_registered) {
                throw new Error(
                    `${this.bus_name}: subprocess terminated without registering on D-Bus`
                );
            }
        } catch (ex) {
            this.emit('error', ex);
            throw ex;
        } finally {
            this._starting = false;
            this.notify('starting');
        }
    }
});
