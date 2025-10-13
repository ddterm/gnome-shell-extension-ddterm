// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { Subprocess, WaylandSubprocess } from './subprocess.js';
import { wait_property } from '../util/promise.js';

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
        'app-info': GObject.ParamSpec.object(
            'app-info',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.AppInfo
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
            (connection, name, owner) => this.#update_bus_name_owner(name, owner),
            (connection, name) => this.#update_bus_name_owner(name, null)
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
        const [, argv] = GLib.shell_parse_argv(this.app_info.get_commandline());

        argv.push(
            '--gapplication-service',
            this.wayland ? '--allowed-gdk-backends=wayland' : '--allowed-gdk-backends=x11',
            ...this.extra_argv
        );

        const launch_context = global.create_app_launch_context(0, -1);

        for (const extra_env of this.extra_env) {
            const split_pos = extra_env.indexOf('=');
            const name = extra_env.slice(0, split_pos);
            const value = extra_env.slice(split_pos + 1);

            launch_context.setenv(name, value);
        }

        const params = {
            journal_identifier: this.bus_name,
            argv,
            environ: launch_context.get_environment(),
        };

        launch_context.emit('launch-started', this.app_info, null);

        const proc = this.wayland ? new WaylandSubprocess(params) : new Subprocess(params);

        const platform_data = GLib.VariantDict.new(null);
        platform_data.insert_value('pid', GLib.Variant.new_int32(proc.get_pid()));
        launch_context.emit('launched', this.app_info, platform_data.end());

        return proc;
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

    #update_bus_name_owner(name, owner) {
        if (this.#bus_name_owner === owner)
            return;

        const prev_registered = this.is_registered;

        log(`${name}: name owner changed to ${JSON.stringify(owner)}`);

        this.#bus_name_owner = owner;
        this.notify('bus-name-owner');

        if (prev_registered !== this.is_registered)
            this.notify('is-registered');
    }

    async start(cancellable = null) {
        const inner_cancellable = Gio.Cancellable.new();
        const cancellable_chain = cancellable?.connect(() => inner_cancellable.cancel());

        try {
            inner_cancellable.set_error_if_cancelled();

            while (this.starting) {
                // eslint-disable-next-line no-await-in-loop
                await wait_property(this, 'starting', starting => !starting, inner_cancellable);
            }

            if (this.is_registered)
                return;

            this.#starting = true;
            this.notify('starting');

            try {
                if (!this.is_running) {
                    this.#subprocess = this.#create_subprocess();
                    this.#subprocess_running = true;
                    this.notify('subprocess');
                    this.notify('is-running');
                    this.#subprocess_wait = this.#wait_subprocess();
                }

                await Promise.race([
                    wait_property(this, 'is-registered', Boolean, inner_cancellable),
                    this.#subprocess_wait,
                ]);

                inner_cancellable.set_error_if_cancelled();

                if (!this.is_running) {
                    throw new Error(
                        `${this.bus_name}: subprocess terminated without registering on D-Bus`
                    );
                }

                if (!this.is_registered)
                    throw new Error(`${this.bus_name}: subprocess failed to register on D-Bus`);
            } catch (ex) {
                this.emit('error', ex);
                throw ex;
            } finally {
                this.#starting = false;
                this.notify('starting');
            }
        } finally {
            cancellable?.disconnect(cancellable_chain);
            inner_cancellable.cancel();
        }
    }
});
