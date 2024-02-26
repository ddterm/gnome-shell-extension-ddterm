// SPDX-FileCopyrightText: © 2023 Aleksandr Mezin
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { Subprocess } from './subprocess.js';

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
    },
    Signals: {
        'activate': {
            return_type: Subprocess,
            accumulator: GObject.AccumulatorType.FIRST_WINS,
        },
    },
}, class DDTermService extends GObject.Object {
    _init(params) {
        // eslint-disable-next-line no-shadow
        const { subprocess, ...rest } = params;
        super._init(rest);

        this._set_subprocess(subprocess);
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
        this._subprocess_wait_cancel?.cancel();

        if (this._bus_watch) {
            Gio.bus_unwatch_name(this._bus_watch);
            this._bus_watch = null;
        }
    }

    terminate() {
        this.subprocess?.terminate();
    }

    _set_subprocess(new_subprocess) {
        if (new_subprocess === this._subprocess)
            return;

        this._subprocess_wait_cancel?.cancel();

        this._subprocess = new_subprocess;
        this._subprocess_wait_cancel = new Gio.Cancellable();

        new_subprocess?.wait(this._subprocess_wait_cancel).then(() => {
            if (this._subprocess !== new_subprocess) {
                throw new Error(
                    `this._subprocess: ${this._subprocess} isn't ${new_subprocess}`
                );
            }

            this._subprocess = null;
            this.notify('subprocess');
        }).catch(ex => {
            if (!(ex instanceof GLib.Error &&
                  ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)))
                printerr(ex);
        });

        this.notify('subprocess');
    }

    _activate() {
        if (this.subprocess)
            return this.subprocess;

        const new_subprocess = this.emit('activate');
        this._set_subprocess(new_subprocess);
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
            const new_subprocess = this._activate();

            if (!new_subprocess)
                throw new Error(`${this.bus_name}: subprocess failed to start`);

            const terminated = new_subprocess.wait(inner_cancellable).then(() => {
                throw new Error(
                    `${this.bus_name}: subprocess terminated without registering on D-Bus`
                );
            });

            const registered = new Promise(resolve => {
                const handler = this.connect('notify::is-registered', () => {
                    if (this.is_registered)
                        resolve();
                });

                inner_cancellable.connect(() => {
                    this.disconnect(handler);
                });
            });

            await Promise.race([registered, terminated]);
        } finally {
            cancellable?.disconnect(cancellable_chain);
            inner_cancellable.cancel();
        }
    }
});
