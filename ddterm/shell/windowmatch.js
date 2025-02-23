// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

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
    _init(params) {
        super._init(params);

        let created_handler = this.display.connect('window-created', (_, win) => {
            this._watch_window(win);
        });

        this.connect('disabled', () => {
            if (created_handler) {
                this.display.disconnect(created_handler);
                created_handler = null;
            }
        });

        let actors;
        if (global.compositor.get_window_actors)
            actors = global.compositor.get_window_actors(this.display);
        else
            actors = Meta.get_window_actors(this.display);
        actors.forEach(actor => {
            this._watch_window(actor.meta_window);
        });
    }

    disable() {
        this.emit('disabled');
    }

    _watch_window(win) {
        if (this.check_window(win) === GLib.SOURCE_REMOVE)
            return;

        const disconnect = () => {
            window_handlers.forEach(handler => win.disconnect(handler));
            this.disconnect(disable_handler);
        };

        const check = () => {
            if (this.check_window(win) === GLib.SOURCE_REMOVE)
                disconnect();
        };

        const window_handlers = [
            ...this.track_signals.map(signal_name => win.connect(signal_name, check)),
            win.connect('unmanaging', disconnect),
            win.connect('unmanaged', disconnect),
        ];

        const disable_handler = this.connect('disabled', disconnect);

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
        'gtk-application-id': GObject.ParamSpec.string(
            'gtk-application-id',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'gtk-window-object-path-prefix': GObject.ParamSpec.string(
            'gtk-window-object-path-prefix',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
    },
}, class DDTermWindowMatch extends WindowMatchGeneric {
    _init(params) {
        this._window = null;

        super._init({
            track_signals: [
                'notify::gtk-application-id',
                'notify::gtk-window-object-path',
            ],
            ...params,
        });

        this.connect('disabled', () => {
            this._untrack_window();
        });
    }

    get current_window() {
        return this._window;
    }

    check_window(win) {
        if (win === this._window)
            return GLib.SOURCE_REMOVE;

        if (!this.subprocess?.owns_window(win)) {
            /*
                With X11 window:
                - Shell can be restarted without logging out
                - Application doesn't have to be started using WaylandClient

                So if we did not launch the app, allow this check to be skipped
                on X11.
            */
            if (this.subprocess?.is_running())
                return GLib.SOURCE_REMOVE;

            if (win.get_client_type() === Meta.WindowClientType.WAYLAND)
                return GLib.SOURCE_REMOVE;
        }

        const gtk_application_id = win.gtk_application_id;
        if (!gtk_application_id)
            return GLib.SOURCE_CONTINUE;

        if (gtk_application_id !== this.gtk_application_id)
            return GLib.SOURCE_REMOVE;

        const gtk_window_object_path = win.gtk_window_object_path;
        if (!gtk_window_object_path)
            return GLib.SOURCE_CONTINUE;

        if (!gtk_window_object_path.startsWith(this.gtk_window_object_path_prefix))
            return GLib.SOURCE_REMOVE;

        this.freeze_notify();

        try {
            this._untrack_window();

            this._window = win;
            this._window_untrack_handler = this._window.connect('unmanaged', () => {
                this._untrack_window();
            });

            this.notify('current-window');
        } finally {
            this.thaw_notify();
        }

        return GLib.SOURCE_REMOVE;
    }

    _untrack_window() {
        if (!this._window)
            return;

        this._window.disconnect(this._window_untrack_handler);
        this._window_untrack_handler = null;
        this._window = null;
        this.notify('current-window');
    }
});
