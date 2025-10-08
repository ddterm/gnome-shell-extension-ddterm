// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { Subprocess, WaylandSubprocess } from './subprocess.js';

export const Service = GObject.registerClass({
    Properties: {
        'bus': GObject.ParamSpec.object(
            'bus',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.DBusConnection
        ),
        'bus-name': GObject.ParamSpec.string(
            'bus-name',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'executable': GObject.ParamSpec.string(
            'executable',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'wayland': GObject.ParamSpec.boolean(
            'wayland',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'extra-argv': GObject.ParamSpec.boxed(
            'extra-argv',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            GObject.type_from_name('GStrv')
        ),
        'extra-env': GObject.ParamSpec.boxed(
            'extra-env',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            GObject.type_from_name('GStrv')
        ),
        'subprocess': GObject.ParamSpec.object(
            'subprocess',
            null,
            null,
            GObject.ParamFlags.READABLE,
            Subprocess
        ),
        'bus-name-owner': GObject.ParamSpec.string(
            'bus-name-owner',
            null,
            null,
            GObject.ParamFlags.READABLE,
            null
        ),
        'is-registered': GObject.ParamSpec.boolean(
            'is-registered',
            null,
            null,
            GObject.ParamFlags.READABLE,
            false
        ),
        'is-running': GObject.ParamSpec.boolean(
            'is-running',
            null,
            null,
            GObject.ParamFlags.READABLE,
            false
        ),
        'starting': GObject.ParamSpec.boolean(
            'starting',
            null,
            null,
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
    #starting = false;
    #subprocess = null;
    #subprocess_running = false;
    #subprocess_wait = null;
    #subprocess_wait_cancel = null;
    #bus_name_owner = null;
    #bus_watch = null;

    constructor(params) {
        const { subprocess, ...rest } = params;

        super(rest);

        this.#subprocess = subprocess;

        if (subprocess) {
            this.#subprocess_running = true;
            this.#subprocess_wait = this.#wait_subprocess();
        }

        this.#bus_watch = Gio.bus_watch_name_on_connection(
            this.bus,
            this.bus_name,
            Gio.BusNameWatcherFlags.NONE,
            (connection, name, owner) => this.#update_bus_name_owner(owner),
            () => this.#update_bus_name_owner(null)
        );
    }

    get subprocess() {
        return this.#subprocess;
    }

    owns_window(win) {
        return this.#subprocess_running && this.#subprocess.owns_window(win);
    }

    hide_from_window_list(win) {
        this.#subprocess.hide_from_window_list(win);
    }

    show_in_window_list(win) {
        this.#subprocess.show_in_window_list(win);
    }

    get bus_name_owner() {
        return this.#bus_name_owner;
    }

    get is_registered() {
        return Boolean(this.#bus_name_owner);
    }

    get is_running() {
        return this.#subprocess_running;
    }

    get starting() {
        return this.#starting;
    }

    unwatch() {
        this.#subprocess_wait_cancel?.cancel();

        if (this.#bus_watch) {
            Gio.bus_unwatch_name(this.#bus_watch);
            this.#bus_watch = null;
        }
    }

    terminate() {
        this.subprocess?.terminate();
    }

    #create_subprocess() {
        const argv = [
            this.executable,
            '--gapplication-service',
            this.wayland ? '--allowed-gdk-backends=wayland' : '--allowed-gdk-backends=x11',
            ...this.extra_argv,
        ];

        const params = {
            journal_identifier: this.bus_name,
            argv,
            environ: this.extra_env,
        };

        if (this.wayland)
            return new WaylandSubprocess(params);
        else
            return new Subprocess(params);
    }

    async #wait_subprocess(cancellable) {
        this.#subprocess_wait_cancel = new Gio.Cancellable();

        try {
            await this.subprocess.wait_check(cancellable);
        } catch (ex) {
            if (!this.starting && !ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED))
                this.emit('error', ex);
        } finally {
            this.#subprocess_running = false;
            this.notify('is-running');
        }
    }

    #update_bus_name_owner(owner) {
        if (this.#bus_name_owner === owner)
            return;

        const prev_registered = this.is_registered;

        log(`${this.bus_name}: name owner changed to ${JSON.stringify(owner)}`);

        this.#bus_name_owner = owner;
        this.notify('bus-name-owner');

        if (prev_registered !== this.is_registered)
            this.notify('is-registered');
    }

    async start(cancellable = null) {
        if (this.is_registered)
            return;

        this.#starting = true;
        this.notify('starting');

        try {
            const inner_cancellable = Gio.Cancellable.new();
            const cancellable_chain = cancellable?.connect(() => inner_cancellable.cancel());

            try {
                if (!this.is_running) {
                    this.#subprocess = this.#create_subprocess();
                    this.#subprocess_running = true;
                    this.notify('subprocess');
                    this.notify('is-running');
                    this.#subprocess_wait = this.#wait_subprocess();
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

                await Promise.race([registered, this.#subprocess_wait]);
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
            this.#starting = false;
            this.notify('starting');
        }
    }
});
