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

const { GObject, Meta } = imports.gi;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { Subprocess } = Me.imports.ddterm.shell.subprocess;

var WindowMatch = GObject.registerClass(
    {
        'Properties': {
            'subprocess': GObject.ParamSpec.object(
                'subprocess',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                Subprocess
            ),
            'display': GObject.ParamSpec.object(
                'display',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Meta.Display
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
            'wm-class': GObject.ParamSpec.string(
                'wm-class',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                null
            ),
        },
        Signals: {
            'disabled': {},
        },
    },
    class DDTermWindowMatch extends GObject.Object {
        _init(params) {
            this._window = null;

            super._init(params);

            this._window_created_handler = this.display.connect('window-created', (_, win) => {
                this.watch_window(win);
            });

            this.connect('disabled', () => {
                if (this._window_created_handler) {
                    this.display.disconnect(this._window_created_handler);
                    this._window_created_handler = null;
                }

                this.untrack_window();
            });

            Meta.get_window_actors(this.display).forEach(actor => {
                this.watch_window(actor.meta_window);
            });
        }

        get current_window() {
            return this._window;
        }

        disable() {
            this.emit('disabled');
        }

        check_window(win) {
            if (win === this._window)
                return true;

            if (!this.subprocess?.owns_window(win)) {
                /*
                    With X11 window:
                    - Shell can be restarted without logging out
                    - Application doesn't have to be started using WaylandClient

                    So if we did not launch the app, allow this check to be skipped
                    on X11.
                */
                if (this.subprocess || win.get_client_type() === Meta.WindowClientType.WAYLAND)
                    return true;
            }

            const wm_class = win.wm_class;
            if (!wm_class)
                return false;

            if (wm_class !== this.wm_class && wm_class !== this.gtk_application_id)
                return true;

            const gtk_application_id = win.gtk_application_id;
            if (!gtk_application_id)
                return false;

            if (gtk_application_id !== this.gtk_application_id)
                return true;

            const gtk_window_object_path = win.gtk_window_object_path;
            if (!gtk_window_object_path)
                return false;

            if (!gtk_window_object_path.startsWith(this.gtk_window_object_path_prefix))
                return true;

            this.freeze_notify();

            try {
                this.untrack_window();

                this._window = win;
                this._window_untrack_handler = this._window.connect('unmanaged', () => {
                    this.untrack_window();
                });

                this.notify('current-window');
            } finally {
                this.thaw_notify();
            }

            return true;
        }

        watch_window(win) {
            if (this.check_window(win))
                return;

            const disconnect = () => {
                window_handlers.forEach(handler => win.disconnect(handler));
                this.disconnect(disable_handler);
            };

            const check = () => {
                if (this.check_window(win))
                    disconnect();
            };

            const window_handlers = [
                win.connect('notify::gtk-application-id', check),
                win.connect('notify::gtk-window-object-path', check),
                win.connect('notify::wm-class', check),
                win.connect('unmanaging', disconnect),
                win.connect('unmanaged', disconnect),
            ];

            const disable_handler = this.connect('disabled', disconnect);

            check();
        }

        untrack_window() {
            if (!this._window)
                return;

            this._window.disconnect(this._window_untrack_handler);
            this._window_untrack_handler = null;
            this._window = null;
            this.notify('current-window');
        }
    }
);

/* exported WindowMatch */
