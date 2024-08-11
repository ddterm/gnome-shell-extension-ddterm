/*
    Copyright © 2024 Aleksandr Mezin

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

const { GLib, GObject, Gio, Meta, Shell } = imports.gi;

const Main = imports.ui.main;

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
    constructor(xml_file_path, enabled_state) {
        this.enabled_state = enabled_state;
        this.teardown = [];

        this.dbus = Gio.DBusExportedObject.wrapJSObject(
            Shell.get_file_contents_utf8_sync(xml_file_path),
            this
        );

        const connect = (source, signal, handler) => {
            const handler_id = source.connect(signal, handler);
            this.teardown.push(() => disconnect_traced(source, handler_id));
        };

        connect(enabled_state.settings, 'changed', (settings, key) => {
            this.emit_signal(
                'SettingChanged',
                new GLib.Variant('(sv)', [key, settings.get_value(key)])
            );
        });

        const rendered_windows = new Set();

        const check_rendered = () => {
            const current = enabled_state.window_matcher.current_window;
            this.set_flag('RenderedFirstFrame', current && rendered_windows.has(current));
        };

        connect(enabled_state.window_matcher, 'notify::current-window', check_rendered);

        connect(global.display, 'window-created', (_, win) => {
            const actor = win.get_compositor_private();
            const frame_handler = actor.connect('first-frame', () => {
                rendered_windows.add(win);
                check_rendered();
            });

            const disconnect = () => {
                disconnect_traced(actor, frame_handler);
                disconnect_traced(actor, destroy_handler);

                const index = this.teardown.indexOf(disconnect);
                if (index >= 0)
                    this.teardown.splice(index, 1);
            };

            const destroy_handler = actor.connect('destroy', disconnect);
            this.teardown.push(disconnect);
        });

        check_rendered();

        const update_has_window = () => {
            this.set_flag(
                'HasWindow',
                enabled_state.window_matcher.current_window !== null
            );
        };
        connect(enabled_state.window_matcher, 'notify::current-window', update_has_window);
        update_has_window();

        const update_is_app_running = () => {
            this.set_flag('IsAppRunning', enabled_state.service.is_registered);
        };
        connect(enabled_state.service, 'notify::is-registered', update_is_app_running);
        update_is_app_running();

        const current_win_subscription = [];
        const unsubscribe_current_win = () => {
            while (current_win_subscription.length > 0)
                current_win_subscription.pop()();
        };
        this.teardown.push(unsubscribe_current_win);

        connect(enabled_state.window_matcher, 'notify::current-window', () => {
            unsubscribe_current_win();

            const win = enabled_state.window_matcher.current_window;
            if (!win)
                return;

            const connect_win = (signal, handler) => {
                const handler_id = win.connect(signal, handler);
                current_win_subscription.push(() => disconnect_traced(win, handler_id));
            };

            connect_win('position-changed', () => {
                const rect = win.get_frame_rect();

                this.emit_signal(
                    'PositionChanged',
                    new GLib.Variant('(iiii)', [rect.x, rect.y, rect.width, rect.height])
                );
            });

            connect_win('size-changed', () => {
                const rect = win.get_frame_rect();

                this.emit_signal(
                    'SizeChanged',
                    new GLib.Variant('(iiii)', [rect.x, rect.y, rect.width, rect.height])
                );
            });

            connect_win('notify::maximized-vertically', () => {
                this.emit_signal(
                    'MaximizedVertically',
                    new GLib.Variant('(b)', [win.maximized_vertically])
                );
            });

            connect_win('notify::maximized-horizontally', () => {
                this.emit_signal(
                    'MaximizedHorizontally',
                    new GLib.Variant('(b)', [win.maximized_horizontally])
                );
            });

            const wm = enabled_state.window_manager;

            const move_resize_handler_id = wm.connect('move-resize-requested', (_, rect) => {
                this.emit_signal(
                    'MoveResizeRequested',
                    new GLib.Variant('(iiii)', [rect.x, rect.y, rect.width, rect.height])
                );
            });

            current_win_subscription.push(() => disconnect_traced(wm, move_resize_handler_id));
        });

        let disconnect_active_app_watch = null;

        connect(global.display, 'notify::focus-window', () => {
            disconnect_active_app_watch?.();

            const focus_window = global.display.focus_window;

            if (focus_window) {
                const handler = focus_window.connect('notify::gtk-application-id', () => {
                    this.emit_property_changed(
                        'ActiveApp',
                        GLib.Variant.new_string(focus_window?.gtk_application_id ?? '')
                    );
                });

                disconnect_active_app_watch = () => {
                    disconnect_traced(focus_window, handler);
                    disconnect_active_app_watch = null;
                };
            }

            this.emit_property_changed(
                'ActiveApp',
                GLib.Variant.new_string(focus_window?.gtk_application_id ?? '')
            );
        });

        this.teardown.push(() => disconnect_active_app_watch?.());

        this.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');
        this.teardown.push(() => this.dbus.unexport());
    }

    disable() {
        while (this.teardown.length > 0)
            this.teardown.pop()();
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
            GLib.Variant.new_variant(this.enabled_state.settings.get_value(key)),
        ]);
    }

    SetSetting(key, value) {
        this.enabled_state.settings.set_value(key, value);
    }

    SyncSettings() {
        Gio.Settings.sync();
    }

    GetPointer() {
        return global.get_pointer();
    }

    GetFrameRect() {
        const rect = this.enabled_state.window_matcher.current_window.get_frame_rect();
        return [rect.x, rect.y, rect.width, rect.height];
    }

    GetTargetRect() {
        const rect = this.enabled_state.window_geometry.target_rect;
        return [rect.x, rect.y, rect.width, rect.height];
    }

    IsMaximizedHorizontally() {
        return this.enabled_state.window_matcher.current_window.maximized_horizontally;
    }

    IsMaximizedVertically() {
        return this.enabled_state.window_matcher.current_window.maximized_vertically;
    }

    ToggleAsync(params, invocation) {
        handle_dbus_method_call_async(
            () => this.enabled_state.app_control.toggle(),
            params,
            invocation
        );
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

    get ActiveApp() {
        return global.display.focus_window?.gtk_application_id ?? '';
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

class TestExtension {
    constructor(meta) {
        this.uuid = meta.uuid;
        this.dir = meta.dir;
        this.path = meta.path;
        this.metadata = meta.metadata;

        this.dbus_interface = null;
    }

    enable() {
        const ddterm = imports.ui.main.extensionManager.lookup('ddterm@amezin.github.com');
        const extension = ddterm.stateObj;

        extension.debug = log;
        extension.app_enable_debug = true;

        this.dbus_interface = new ExtensionTestDBusInterface(
            GLib.build_filenamev([this.path, 'com.github.amezin.ddterm.ExtensionTest.xml']),
            extension.enabled_state
        );
    }

    disable() {
        this.dbus_interface?.disable();
        this.dbus_interface = null;
    }
}

function init(meta) {
    return new TestExtension(meta);
}

/* exported init */
