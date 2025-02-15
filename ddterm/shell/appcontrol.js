// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Service } from './service.js';
import { WindowGeometry } from './geometry.js';
import { WindowMatch } from './windowmatch.js';

async function wait_timeout(message, timeout_ms, cancellable = null) {
    await new Promise(resolve => {
        const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout_ms, () => {
            cancellable?.disconnect(cancel_handler);
            resolve();
            return GLib.SOURCE_REMOVE;
        });

        const cancel_handler = cancellable?.connect(() => {
            GLib.Source.remove(source);
            resolve();
        });
    });

    cancellable?.set_error_if_cancelled();
    throw GLib.Error.new_literal(Gio.io_error_quark(), Gio.IOErrorEnum.TIMED_OUT, message);
}

async function wait_property(object, property, predicate, cancellable = null) {
    const result = await new Promise(resolve => {
        let value = object[property];

        if (predicate(value)) {
            resolve(value);
            return;
        }

        const handler = object.connect(`notify::${property}`, () => {
            value = object[property];

            if (!predicate(value))
                return;

            cancellable?.disconnect(cancel_handler);
            object.disconnect(handler);
            resolve(value);
        });

        const cancel_handler = cancellable?.connect(() => {
            object.disconnect(handler);
            resolve();
        });
    });

    cancellable?.set_error_if_cancelled();
    return result;
}

export const AppControl = GObject.registerClass({
    Properties: {
        'service': GObject.ParamSpec.object(
            'service',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Service
        ),
        'window-matcher': GObject.ParamSpec.object(
            'window-matcher',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            WindowMatch
        ),
        'window-geometry': GObject.ParamSpec.object(
            'window-geometry',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            WindowGeometry
        ),
        'actions': GObject.ParamSpec.object(
            'actions',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Gio.DBusActionGroup
        ),
        'debug': GObject.ParamSpec.jsobject(
            'debug',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY
        ),
    },
}, class DDTermAppControl extends GObject.Object {
    _init(params) {
        super._init(params);

        this._actions = null;
        this._actions_owner = null;
        this._cancellable = new Gio.Cancellable();

        const bus_name_handler =
            this.service.connect('notify::bus-name-owner', () => this._update_actions());

        this._cancellable.connect(() => this.service.disconnect(bus_name_handler));

        this._update_actions();
    }

    get actions() {
        return this._actions;
    }

    _update_actions() {
        const new_owner = this.service.bus_name_owner;

        if (this._actions_owner === new_owner)
            return;

        if (new_owner) {
            this._actions = Gio.DBusActionGroup.get(
                this.service.bus,
                new_owner,
                `/${this.service.bus_name.replace(/\./g, '/')}`
            );
        } else {
            this._actions = null;
        }

        this._actions_owner = new_owner;
        this.notify('actions');
    }

    async ensure_running() {
        if (this.actions)
            return;

        const cancellable = Gio.Cancellable.new();
        const cancel_chain = this._cancellable.connect(() => cancellable.cancel());

        try {
            await Promise.race([
                this.service.start(cancellable),
                wait_timeout('ddterm app failed to start in 20 seconds', 20000, cancellable),
            ]);
        } finally {
            this._cancellable.disconnect(cancel_chain);
            cancellable.cancel();
        }
    }

    async _wait_window_visible(visible) {
        visible = Boolean(visible);
        const expected_actions = this.actions;

        if (Boolean(this.window_matcher.current_window) === visible)
            return;

        const cancellable = Gio.Cancellable.new();
        const cancel_chain = this._cancellable.connect(() => cancellable.cancel());

        try {
            const wait_window = wait_property(
                this.window_matcher,
                'current-window',
                current_window => Boolean(current_window) === visible,
                cancellable
            );

            const wait_app_start_stop = wait_property(
                this,
                'actions',
                new_actions => new_actions !== expected_actions,
                cancellable
            ).then(() => {
                throw new Error(visible ? 'ddterm failed to show' : 'ddterm failed to hide');
            });

            await Promise.race([
                wait_window,
                wait_app_start_stop,
                wait_timeout(
                    visible
                        ? 'ddterm failed to show in 20 seconds'
                        : 'ddterm failed to hide in 20 seconds',
                    20000,
                    cancellable
                ),
            ]);
        } finally {
            this._cancellable.disconnect(cancel_chain);
            cancellable.cancel();
        }
    }

    async toggle(wait = true) {
        if (this.window_matcher.current_window)
            await this.hide(wait);
        else
            await this.activate(wait);
    }

    async activate(wait = true) {
        if (this.window_matcher.current_window) {
            Main.activateWindow(this.window_matcher.current_window);
            return;
        }

        await this.ensure_running();

        this.window_geometry.update_monitor();

        this.debug?.('Activating show action');
        this.actions.activate_action('show', null);

        if (wait)
            await this._wait_window_visible(true);
    }

    async hide(wait = true) {
        if (!this.window_matcher.current_window)
            return;

        this.debug?.('Activating hide action');
        this.actions.activate_action('hide', null);

        if (wait)
            await this._wait_window_visible(false);
    }

    async preferences() {
        await this.ensure_running();

        this.debug?.('Activating preferences action');
        this.actions.activate_action('preferences', null);
    }

    disable() {
        this._cancellable.cancel();
    }

    quit() {
        if (!this.actions)
            return false;

        this.debug?.('Activating quit action');
        this.actions.activate_action('quit', null);
        return true;
    }
});
