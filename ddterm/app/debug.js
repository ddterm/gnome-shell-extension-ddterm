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
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';

import System from 'system';

import { get_resource_text } from './resources.js';

function return_error(invocation, ex) {
    if (ex instanceof GLib.Error) {
        invocation.return_gerror(ex);
        return;
    }

    let name = ex.name;
    if (!name.includes('.'))
        name = `org.gnome.gjs.JSError.${name}`;

    invocation.return_dbus_error(name, ex.toString());
}

export class DebugInterface {
    constructor(app) {
        this.dbus = Gio.DBusExportedObject.wrapJSObject(
            get_resource_text('../com.github.amezin.ddterm.Debug.xml'),
            this
        );

        this.app = app;
        this.app.connect('notify::window', () => {
            this.connect_window(app.window);
        });

        this.connect_window(app.window);
    }

    connect_window(win) {
        if (this.window === win)
            return;

        while (this.window_handlers?.length)
            this.window.disconnect(this.window_handlers.pop());

        this.window = win;

        if (!win)
            return;

        this.window_handlers = [
            win.connect('destroy', () => {
                if (win === this.window)
                    this.connect_window(null);
            }),
            win.connect('event', (_, event) => {
                this.emit_event(event);

                return false;
            }),
            win.connect('configure-event', () => {
                this.emit_configure_event(win.get_size());

                return false;
            }),
            win.connect('window-state-event', () => {
                this.emit_window_state_event(win.window.get_state());

                return false;
            }),
            win.connect('size-allocate', (_, rect) => {
                this.emit_size_allocate(rect);
            }),
        ];
    }

    emit_event(event) {
        const type = GObject.enum_to_string(Gdk.EventType, event.get_event_type());

        this.dbus.emit_signal(
            'WindowEvent',
            GLib.Variant.new_tuple([GLib.Variant.new_string(type)])
        );
    }

    emit_configure_event([width, height]) {
        this.dbus.emit_signal(
            'ConfigureEvent',
            GLib.Variant.new_tuple([GLib.Variant.new_int32(width), GLib.Variant.new_int32(height)])
        );
    }

    emit_window_state_event(state) {
        state = GObject.flags_to_string(Gdk.WindowState, state).split(' | ');

        this.dbus.emit_signal(
            'WindowStateEvent',
            GLib.Variant.new_tuple([GLib.Variant.new_strv(state)])
        );
    }

    emit_size_allocate(rect) {
        const { width, height } = rect;

        this.dbus.emit_signal(
            'SizeAllocate',
            GLib.Variant.new_tuple([GLib.Variant.new_int32(width), GLib.Variant.new_int32(height)])
        );
    }

    EvalAsync(params, invocation) {
        const [code] = params;

        try {
            Promise.resolve(eval(code)).then(result => {
                const json = result === undefined ? '' : JSON.stringify(result);

                invocation.return_value(GLib.Variant.new_tuple([GLib.Variant.new_string(json)]));
            }).catch(e => {
                return_error(invocation, e);
            });
        } catch (ex) {
            return_error(invocation, ex);
        }
    }

    WaitFrameAsync(params, invocation) {
        try {
            const frame_clock = this.window.window.get_frame_clock();

            const handler = frame_clock.connect_after('after-paint', () => {
                frame_clock.disconnect(handler);
                invocation.return_value(null);
            });

            frame_clock.request_phase(Gdk.FrameClockPhase.AFTER_PAINT);
        } catch (ex) {
            return_error(invocation, ex);
        }
    }

    WaitIdleAsync(params, invocation) {
        try {
            GLib.idle_add(GLib.PRIORITY_LOW, () => {
                invocation.return_value(null);

                return GLib.SOURCE_REMOVE;
            });
        } catch (ex) {
            return_error(invocation, ex);
        }
    }

    GC() {
        System.gc();
    }

    DumpHeap(path) {
        System.dumpHeap(path);
    }

    ShowPreferencesAsync(params, invocation) {
        try {
            this.app.preferences().then(() => {
                invocation.return_value(null);
            }).catch(ex => {
                return_error(invocation, ex);
            });
        } catch (ex) {
            return_error(invocation, ex);
        }
    }

    HidePreferencesAsync(params, invocation) {
        try {
            const { prefs_dialog } = this.app;
            prefs_dialog.connect('destroy', () => {
                invocation.return_value(null);
            });
            prefs_dialog.close();
        } catch (ex) {
            return_error(invocation, ex);
        }
    }
}
