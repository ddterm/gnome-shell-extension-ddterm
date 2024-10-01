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
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';

import { Subprocess } from './subprocess.js';

export const WindowMatchGeneric = GObject.registerClass({
    Properties: {
        'display': GObject.ParamSpec.object(
            'display',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Meta.Display
        ),
        'track-signals': GObject.ParamSpec.boxed(
            'track-signals',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            GObject.type_from_name('GStrv')
        ),
    },
    Signals: {
        'disabled': {},
    },
}, class DDTermWindowMatchGeneric extends GObject.Object {
    enable() {
        this.disable();

        const created_handler = this.display.connect('window-created', (_, win) => {
            this._watch_window(win);
        });

        const disable_handler = this.connect('disabled', () => {
            this.disconnect(disable_handler);
            this.display.disconnect(created_handler);
        });
    }

    disable() {
        this.emit('disabled');
    }

    _watch_window(win) {
        if (this.check_window(win) === GLib.SOURCE_REMOVE)
            return;

        let disable_handler = null;
        let window_handlers = null;

        const disconnect_window = () => {
            if (disable_handler) {
                this.disconnect(disable_handler);
                disable_handler = null;
            }

            while (window_handlers?.length)
                win.disconnect(window_handlers.pop());
        };

        disable_handler = this.connect('disabled', disconnect_window);

        const check = () => {
            if (this.check_window(win) === GLib.SOURCE_REMOVE)
                disconnect_window();
        };

        window_handlers = [
            ...this.track_signals.map(signal_name => win.connect(signal_name, check)),
            win.connect('unmanaging', disconnect_window),
            win.connect('unmanaged', disconnect_window),
        ];

        check();
    }
});

export const WindowMatch = GObject.registerClass({
    Properties: {
        'subprocess': GObject.ParamSpec.object(
            'subprocess',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Subprocess
        ),
        'current-window': GObject.ParamSpec.object(
            'current-window',
            '',
            '',
            GObject.ParamFlags.READABLE,
            Meta.Window
        ),
    },
}, class DDTermWindowMatch extends WindowMatchGeneric {
    get current_window() {
        return this._window ?? null;
    }

    get subprocess() {
        return this._subprocess;
    }

    set subprocess(value) {
        if (value === this._subprocess)
            return;

        this.disable();
        this.untrack_window();

        this._subprocess = value;
        this.notify('subprocess');
    }

    check_window(win) {
        if (win === this._window)
            return GLib.SOURCE_REMOVE;

        if (!this.subprocess?.owns_window(win))
            return GLib.SOURCE_REMOVE;

        this._track_actor(win, win.get_compositor_private());

        return GLib.SOURCE_REMOVE;
    }

    _track_actor(win, actor) {
        if (actor.reactive) {
            this._set_current_window(win);
            return;
        }

        const disconnect_actor = () => {
            actor.disconnect(reactive_handler);
            actor.disconnect(child_added_handler);
            actor.disconnect(destroy_handler);
            win.disconnect(window_handler);
            this.disconnect(disable_handler);
        };

        const reactive_handler = actor.connect('notify::reactive', () => {
            if (actor.reactive)
                this._set_current_window(win);
        });

        const child_added_handler = actor.connect('child-added', (_, child) => {
            this._track_actor(win, child);
        });

        const destroy_handler = actor.connect('destroy', disconnect_actor);
        const window_handler = win.connect('unmanaged', disconnect_actor);
        const disable_handler = this.connect('disabled', disconnect_actor);

        actor.get_children().forEach(child => this._track_actor(win, child));
    }

    _set_current_window(win) {
        if (win === this._window)
            return;

        this.freeze_notify();

        try {
            this.disable();
            this.untrack_window();

            this._window = win;
            this._window_untrack_handler = this._window.connect('unmanaged', () => {
                this.untrack_window();
            });

            this.notify('current-window');
        } finally {
            this.thaw_notify();
        }
    }

    untrack_window() {
        if (!this._window)
            return;

        this._window.disconnect(this._window_untrack_handler);
        this._window_untrack_handler = null;
        this._window = null;
        this.notify('current-window');
    }
});
