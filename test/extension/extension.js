/*
    Copyright © 2021 Aleksandr Mezin

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

/* exported init enable disable */

const { GLib, GObject, Gio, Meta } = imports.gi;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const ddterm = imports.ui.main.extensionManager.lookup('ddterm@amezin.github.com');
const { extension, wm } = ddterm.imports.ddterm.shell;

function get_monitor_manager() {
    if (Meta.MonitorManager.get)
        return Meta.MonitorManager.get();

    return global.backend.get_monitor_manager();
}

function report_dbus_error_async(e, invocation) {
    if (e instanceof GLib.Error) {
        invocation.return_gerror(e);
        return;
    }

    let name = e.name;
    if (!name.includes('.'))
        name = `org.gnome.gjs.JSError.${name}`;

    logError(e, `Exception in method call: ${invocation.get_method_name()}`);
    invocation.return_dbus_error(name, e.message);
}

function handle_dbus_method_call_async(func, params, invocation) {
    try {
        Promise.resolve(func(...params)).then(result => {
            invocation.return_value(result === undefined ? null : result);
        }).catch(e => report_dbus_error_async(e, invocation));
    } catch (e) {
        report_dbus_error_async(e, invocation);
    }
}

function disconnect_traced(obj, handler) {
    if (!GObject.signal_handler_is_connected(obj, handler))
        throw new Error(`Signal handler ${handler} is not connected to ${obj}`);

    obj.disconnect(handler);
}

class ExtensionTestDBusInterface {
    constructor() {
        let [_, xml] =
            Me.dir.get_child('com.github.amezin.ddterm.ExtensionTest.xml').load_contents(null);

        this.dbus = Gio.DBusExportedObject.wrapJSObject(ByteArray.toString(xml), this);
    }

    set_flag(name, value) {
        if (this[name] === value)
            return;

        this[name] = value;
        this.emit_property_changed(name, GLib.Variant.new_boolean(value));
    }

    LogMessage(msg) {
        log(msg);
    }

    GetSetting(key) {
        return GLib.Variant.new_tuple([
            GLib.Variant.new_variant(extension.settings.get_value(key)),
        ]);
    }

    SetSetting(key, value) {
        extension.settings.set_value(key, value);
    }

    SyncSettings() {
        Gio.Settings.sync();
    }

    GetPointer() {
        return global.get_pointer();
    }

    GetFrameRect() {
        const rect = extension.window_manager.current_window.get_frame_rect();
        return [rect.x, rect.y, rect.width, rect.height];
    }

    GetTargetRect() {
        const rect = extension.window_manager.current_target_rect;
        return [rect.x, rect.y, rect.width, rect.height];
    }

    IsMaximizedHorizontally() {
        return extension.window_manager.current_window.maximized_horizontally;
    }

    IsMaximizedVertically() {
        return extension.window_manager.current_window.maximized_vertically;
    }

    ToggleAsync(params, invocation) {
        handle_dbus_method_call_async(extension.toggle, params, invocation);
    }

    GetNMonitors() {
        return Main.layoutManager.monitors.length;
    }

    GetMonitorGeometry(index) {
        const { x, y, width, height } = Main.layoutManager.monitors[index];
        return [x, y, width, height];
    }

    GetMonitorScale(index) {
        return Main.layoutManager.monitors[index].geometry_scale;
    }

    GetMonitorWorkarea(index) {
        const { x, y, width, height } = Main.layoutManager.getWorkAreaForMonitor(index);
        return [x, y, width, height];
    }

    GetPrimaryMonitor() {
        return Main.layoutManager.primaryIndex;
    }

    GetCurrentMonitor() {
        return global.display.get_current_monitor();
    }

    UpdateCurrentMonitor() {
        return get_monitor_manager().emit('monitors-changed-internal');
    }

    WaitLeisureAsync(params, invocation) {
        global.run_at_leisure(() => invocation.return_value(null));
    }

    emit_signal(name, arg) {
        log(`${name} ${arg.print(true)}`);
        this.dbus.emit_signal(name, arg);
    }

    emit_property_changed(name, value) {
        log(`${name} = ${value.print(true)}`);
        this.dbus.emit_property_changed(name, value);
    }
}

const teardown = [];

function init() {
    wm.debug = log;
    extension.app_enable_heap_dump = true;
}

function enable() {
    const dbus_interface = new ExtensionTestDBusInterface();

    const connect = (source, signal, handler) => {
        const handler_id = source.connect(signal, handler);
        teardown.push(() => disconnect_traced(source, handler_id));
    };

    connect(extension.settings, 'changed', (settings, key) => {
        dbus_interface.emit_signal(
            'SettingChanged',
            new GLib.Variant('(sv)', [key, settings.get_value(key)])
        );
    });

    connect(extension.window_manager, 'move-resize-requested', (_, rect) => {
        dbus_interface.emit_signal(
            'MoveResizeRequested',
            new GLib.Variant('(iiii)', [rect.x, rect.y, rect.width, rect.height])
        );
    });

    const rendered_windows = new Set();

    const check_rendered = () => {
        const current = extension.window_manager.current_window;
        dbus_interface.set_flag('RenderedFirstFrame', current && rendered_windows.has(current));
    };

    connect(extension.window_manager, 'notify::current-window', check_rendered);

    connect(global.display, 'window-created', (_, win) => {
        const actor = win.get_compositor_private();
        const frame_handler = actor.connect('first-frame', () => {
            rendered_windows.add(win);
            check_rendered();
        });

        const disconnect = () => {
            disconnect_traced(actor, frame_handler);
            disconnect_traced(actor, destroy_handler);

            const index = teardown.indexOf(disconnect);
            if (index >= 0)
                teardown.splice(index, 1);
        };

        const destroy_handler = actor.connect('destroy', disconnect);
        teardown.push(disconnect);
    });

    check_rendered();

    const update_has_window = () => {
        dbus_interface.set_flag('HasWindow', extension.window_manager.current_window !== null);
    };
    connect(extension.window_manager, 'notify::current-window', update_has_window);
    update_has_window();

    const update_is_app_running = () => {
        dbus_interface.set_flag('IsAppRunning', extension.service.is_registered);
    };
    connect(extension.service, 'notify::is-registered', update_is_app_running);
    update_is_app_running();

    const current_win_subscription = [];
    const unsubscribe_current_win = () => {
        while (current_win_subscription.length > 0)
            current_win_subscription.pop()();
    };
    teardown.push(unsubscribe_current_win);

    connect(extension.window_manager, 'notify::current-window', () => {
        unsubscribe_current_win();

        const win = extension.window_manager.current_window;
        if (!win)
            return;

        const connect_win = (signal, handler) => {
            const handler_id = win.connect(signal, handler);
            current_win_subscription.push(() => disconnect_traced(win, handler_id));
        };

        connect_win('position-changed', () => {
            const rect = win.get_frame_rect();

            dbus_interface.emit_signal(
                'PositionChanged',
                new GLib.Variant('(iiii)', [rect.x, rect.y, rect.width, rect.height])
            );
        });

        connect_win('size-changed', () => {
            const rect = win.get_frame_rect();

            dbus_interface.emit_signal(
                'SizeChanged',
                new GLib.Variant('(iiii)', [rect.x, rect.y, rect.width, rect.height])
            );
        });

        connect_win('notify::maximized-vertically', () => {
            dbus_interface.emit_signal(
                'MaximizedVertically',
                new GLib.Variant('(b)', [win.maximized_vertically])
            );
        });

        connect_win('notify::maximized-horizontally', () => {
            dbus_interface.emit_signal(
                'MaximizedHorizontally',
                new GLib.Variant('(b)', [win.maximized_horizontally])
            );
        });
    });

    dbus_interface.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');
    teardown.push(() => dbus_interface.dbus.unexport());
}

function disable() {
    while (teardown.length > 0)
        teardown.pop()();
}
