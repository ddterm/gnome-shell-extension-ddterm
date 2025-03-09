// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {
    connect,
    get_main,
    get_resource_dbus_interface_info,
    report_dbus_error_async,
    handle_dbus_call_promise,
    dbus_auto_pspecs,
} from './util.js';

const DBUS_INTERFACE_INFO =
    get_resource_dbus_interface_info('./dbus-interfaces/org.gnome.Shell.TestHook.xml');

const Interface = GObject.registerClass({
    Properties: {
        ...dbus_auto_pspecs(DBUS_INTERFACE_INFO),
        'inhibit-animations': GObject.ParamSpec.boolean(
            'inhibit-animations',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'uninhibit-animations': GObject.ParamSpec.boolean(
            'uninhibit-animations',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
    },
    Signals: {
        'WindowCreated': {},
        'WindowShown': {},
        'WindowUnmanaged': {},
    },
}, class DDTermShellHookInterface extends GObject.Object {
    _init() {
        super._init();

        this._destroy_callbacks = [];

        if (GObject.signal_lookup('shutdown', Shell.Global))
            this._connect_external(global, 'shutdown', () => this.Destroy());

        const { context, display } = global;

        this._connect_external(display, 'window-created', (_, win) => {
            this.emit('WindowCreated');

            const handlers = [];
            const disconnect = () => {
                while (handlers.length > 0)
                    win.disconnect(handlers.pop());

                const index = this._destroy_callbacks.indexOf(disconnect);
                if (index !== -1)
                    this._destroy_callbacks.splice(index, 1);
            };

            this._destroy_callbacks.push(disconnect);

            handlers.push(win.connect('shown', () => {
                this.emit('WindowShown');
            }));

            handlers.push(win.connect('unmanaged', () => {
                this.emit('WindowUnmanaged');
                disconnect();
            }));
        });

        this._connect_external(context, 'notify::unsafe-mode', () => {
            this.notify('UnsafeMode');
        });

        const st_settings = St.Settings.get();

        this._connect_external(st_settings, 'notify::enable-animations', () => {
            this.notify('EnableAnimations');
        });

        this.connect('notify::inhibit-animations', () => {
            if (this.inhibit_animations)
                st_settings.inhibit_animations();
            else
                st_settings.uninhibit_animations();
        });

        this.connect('notify::uninhibit-animations', () => {
            if (this.uninhibit_animations)
                st_settings.uninhibit_animations();
            else
                st_settings.inhibit_animations();
        });

        this._destroy_callbacks.push(() => {
            this.inhibit_animations = false;
            this.uninhibit_animations = false;
        });

        this.screenshot = Shell.Screenshot.new();
        this.seat = Clutter.get_default_backend().get_default_seat();
        this.pointer = this.seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        this.keyboard = this.seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);

        if (global.backend?.get_cursor_tracker)
            this.cursor_tracker = global.backend.get_cursor_tracker();
        else
            this.cursor_tracker = Meta.CursorTracker.get_for_display(global.display);

        this._connect_external(this.cursor_tracker, 'position-invalidated', () => {
            this.GetPointer();
        });

        this.GetPointer();

        this._connect_external(display, 'notify::focus-window', () => {
            this.FocusApp = display.focus_window?.gtk_application_id ?? '';
        });

        this.FocusApp = display.focus_window?.gtk_application_id ?? '';

        this._connect_external(display, 'workareas-changed', () => {
            this._update_workareas();
        });

        this._update_workareas();

        const desktop_settings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });

        desktop_settings.bind(
            'color-scheme',
            this,
            'ColorScheme',
            Gio.SettingsBindFlags.NO_SENSITIVITY
        );

        this._destroy_callbacks.push(() => Gio.Settings.unbind(this, 'ColorScheme'));

        this.wrapper = Gio.DBusExportedObject.wrapJSObject(DBUS_INTERFACE_INFO, this);

        this.connect('WindowCreated', () => {
            this.wrapper.emit_signal('WindowCreated', null);
        });

        this.connect('WindowShown', () => {
            this.wrapper.emit_signal('WindowShown', null);
        });

        this.connect('WindowUnmanaged', () => {
            this.wrapper.emit_signal('WindowUnmanaged', null);
        });

        for (const property_info of this.wrapper.get_info().properties) {
            const { name, signature } = property_info;

            this.connect(`notify::${name}`, () => {
                let value = this[name];

                if (!(value instanceof GLib.Variant) || value.get_type_string() !== signature)
                    value = new GLib.Variant(signature, value);

                this.wrapper.emit_property_changed(name, value);
            });

            this.notify(name);
        }

        this.wrapper.export(Gio.DBus.session, '/org/gnome/Shell/TestHook');
        this._destroy_callbacks.push(() => this.wrapper.unexport());

        this.connect('notify', () => this.wrapper.flush());
        this.wrapper.flush();

        this._init_async().catch(logError);
    }

    async _init_async() {
        const main = await get_main();

        if (!this._destroy_callbacks.length)
            return;

        this._connect_external(main.layoutManager, 'startup-complete', () => {
            this.StartingUp = false;
        });

        this.StartingUp = main.layoutManager._startingUp;
    }

    _connect_external(source, signal, handler) {
        this._destroy_callbacks.push(connect(source, signal, handler));
    }

    EvalAsync(params, invocation) {
        const [script] = params;

        handle_dbus_call_promise(invocation, (resolve, reject) => {
            Promise.resolve(eval(script)).then(result => {
                if (result === undefined)
                    resolve('');
                else
                    resolve(JSON.stringify(result));
            }).catch(reject);
        });
    }

    LogMessage(message) {
        log(message);
    }

    GetPointer() {
        const [x, y, mods] = global.get_pointer();

        if (this.Pointer?.[0] !== x || this.Pointer?.[1] !== y)
            this.Pointer = [x, y];

        return [x, y, mods];
    }

    SetPointer(x, y) {
        this.pointer.notify_absolute_motion(Clutter.CURRENT_TIME, x, y);
        this.GetPointer();
    }

    SetMousePressed(button, pressed) {
        this.pointer.notify_button(
            Clutter.CURRENT_TIME,
            button,
            pressed ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED
        );
    }

    SetKeyPressed(key, pressed) {
        this.keyboard.notify_keyval(
            Clutter.CURRENT_TIME,
            key,
            pressed ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED
        );
    }

    GetCurrentMonitor() {
        return global.display.get_current_monitor();
    }

    ScreenshotAsync(params, invocation) {
        handle_dbus_call_promise(invocation, (resolve, reject) => {
            const file = Gio.File.new_for_path(params[0]);
            const stream =
                file.replace(null, false, Gio.FileCreateFlags.NONE, null);

            this.screenshot.screenshot(true, stream, (source, result) => {
                try {
                    source.screenshot_finish(result);
                    resolve();
                } catch (e) {
                    reject(e);
                } finally {
                    stream.close(null);
                }
            });
        });
    }

    PickColorAsync(params, invocation) {
        const [x, y] = params;

        handle_dbus_call_promise(invocation, (resolve, reject) => {
            this.screenshot.pick_color(x, y, (source, result) => {
                try {
                    const [, color] = source.pick_color_finish(result);
                    resolve([color.red, color.green, color.blue, color.alpha]);
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    LaterAsync(params, invocation) {
        try {
            const [when] = params;
            const func = () => {
                invocation.return_value(null);
                return GLib.SOURCE_REMOVE;
            };

            if (global.compositor)
                global.compositor.get_laters().add(when, func);
            else
                Meta.later_add(when, func);
        } catch (e) {
            report_dbus_error_async(e, invocation);
        }
    }

    WaitLeisureAsync(params, invocation) {
        try {
            global.run_at_leisure(() => invocation.return_value(null));
        } catch (e) {
            report_dbus_error_async(e, invocation);
        }
    }

    _update_workareas() {
        const workareas = [];
        const workspace = global.workspace_manager.get_active_workspace();

        for (let i = 0; i < global.display.get_n_monitors(); i++) {
            const { x, y, width, height } = workspace.get_work_area_for_monitor(i);

            workareas.push([x, y, width, height]);
        }

        if (this.Workareas?.length !== workareas.length) {
            this.Workareas = workareas;
            return;
        }

        if (!this.Workareas?.every((area, i) => area.every((v, j) => v === workareas[i][j])))
            this.Workareas = workareas;
    }

    Destroy() {
        while (this._destroy_callbacks.length)
            this._destroy_callbacks.pop()();
    }

    get UnsafeMode() {
        return global.context.unsafe_mode;
    }

    set UnsafeMode(value) {
        global.context.unsafe_mode = value;
    }

    get EnableAnimations() {
        return St.Settings.get().enable_animations;
    }

    set EnableAnimations(value) {
        value = Boolean(value);

        if (global.force_animations !== value)
            global.force_animations = value;

        if (this.inhibit_animations !== !value)
            this.inhibit_animations = !value;

        if (this.uninhibit_animations !== value)
            this.uninhibit_animations = value;
    }
});

export function init() {
    try {
        new Interface();
    } catch (ex) {
        logError(ex);
        throw ex;
    }
}
