// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: k-c13
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';

import { Service } from './service.js';

export class WindowMatchGeneric extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermWindowMatchGeneric';

    static [GObject.properties] = {
        'display': GObject.ParamSpec.object(
            'display',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Meta.Display
        ),
        'track-signals': GObject.ParamSpec.boxed(
            'track-signals',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            GObject.type_from_name('GStrv')
        ),
    };

    static [GObject.signals] = {
        'disabled': {},
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        let created_handler = this.display.connect('window-created', (_, win) => {
            this.#watch_window(win);
        });

        this.connect('disabled', () => {
            if (created_handler) {
                this.display.disconnect(created_handler);
                created_handler = null;
            }
        });
    }

    disable() {
        this.emit('disabled');
    }

    check_all_windows() {
        for (const win of this.display.list_all_windows())
            this.#watch_window(win);
    }

    #watch_window(win) {
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
}

export class WindowMatch extends WindowMatchGeneric {
    static [GObject.GTypeName] = 'DDTermWindowMatch';

    static [GObject.properties] = {
        'service': GObject.ParamSpec.object(
            'service',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Service
        ),
        'has-window': GObject.ParamSpec.boolean(
            'has-window',
            null,
            null,
            GObject.ParamFlags.READABLE,
            false
        ),
        'current-window': GObject.ParamSpec.object(
            'current-window',
            null,
            null,
            GObject.ParamFlags.READABLE,
            Meta.Window
        ),
        'gtk-application-id': GObject.ParamSpec.string(
            'gtk-application-id',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'gtk-window-object-path-prefix': GObject.ParamSpec.string(
            'gtk-window-object-path-prefix',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #window = null;
    #window_untrack_handler;

    constructor(params) {
        super({
            track_signals: [
                'notify::gtk-application-id',
                'notify::gtk-window-object-path',
            ],
            ...params,
        });

        this.connect('disabled', () => {
            this.#untrack_window();
        });
    }

    get current_window() {
        return this.#window;
    }

    get has_window() {
        return Boolean(this.#window);
    }

    check_window(win) {
        if (win === this.#window)
            return GLib.SOURCE_REMOVE;

        if (!this.service.owns_window(win)) {
            /*
                With X11 window:
                - Shell can be restarted without logging out
                - Application doesn't have to be started using WaylandClient

                So if we did not launch the app, allow this check to be skipped
                on X11.
            */
            if (this.service.is_running)
                return GLib.SOURCE_REMOVE;

            if (win.get_client_type() === Meta.WindowClientType.WAYLAND)
                return GLib.SOURCE_REMOVE;
        }

        const { gtk_application_id } = win;
        if (!gtk_application_id)
            return GLib.SOURCE_CONTINUE;

        if (gtk_application_id !== this.gtk_application_id)
            return GLib.SOURCE_REMOVE;

        const { gtk_window_object_path } = win;
        if (!gtk_window_object_path)
            return GLib.SOURCE_CONTINUE;

        if (!gtk_window_object_path.startsWith(this.gtk_window_object_path_prefix))
            return GLib.SOURCE_REMOVE;

        this.freeze_notify();

        try {
            this.#untrack_window();

            this.#window = win;
            this.#window_untrack_handler = this.#window.connect('unmanaged', () => {
                this.#untrack_window();
            });

            this.notify('has-window');
            this.notify('current-window');
        } finally {
            this.thaw_notify();
        }

        return GLib.SOURCE_REMOVE;
    }

    #untrack_window() {
        if (!this.#window)
            return;

        this.#window.disconnect(this.#window_untrack_handler);
        this.#window_untrack_handler = null;
        this.#window = null;
        this.notify('has-window');
        this.notify('current-window');
    }
}
