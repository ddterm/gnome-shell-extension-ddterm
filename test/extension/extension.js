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

const { GLib, Gio, Meta } = imports.gi;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;
const ModalDialog = imports.ui.modalDialog;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const ddterm = imports.ui.main.extensionManager.lookup('ddterm@amezin.github.com');
const { extension, wm } = ddterm.imports.ddterm.shell;
const { logger } = ddterm.imports.ddterm.util;

const LOG_DOMAIN = 'ddterm-test';
const { message, info } = logger.context(LOG_DOMAIN, 'ddterm.ExtensionTest');

function get_monitor_manager() {
    if (Meta.MonitorManager.get)
        return Meta.MonitorManager.get();

    return global.backend.get_monitor_manager();
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
        message(msg);
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

    Toggle() {
        extension.toggle();
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

    DisableWelcomeDialog() {
        if (global.settings.settings_schema.has_key('welcome-dialog-last-shown-version'))
            global.settings.set_string('welcome-dialog-last-shown-version', '99.0');
    }

    CloseWelcomeDialog() {
        if (Main.welcomeDialog)
            Main.welcomeDialog.close();
    }

    HideOverview() {
        Main.overview.hide();
    }

    BlockBanner() {
        Main.messageTray.bannerBlocked = true;
    }

    emit_signal(name, arg) {
        info(`${name} ${arg.print(true)}`);
        this.dbus.emit_signal(name, arg);
    }

    emit_property_changed(name, value) {
        info(`${name} = ${value.print(true)}`);
        this.dbus.emit_property_changed(name, value);
    }
}

const teardown = [];

function init() {
    GLib.setenv('G_MESSAGES_DEBUG', [LOG_DOMAIN, wm.LOG_DOMAIN].join(' '), false);
}

function enable() {
    const dbus_interface = new ExtensionTestDBusInterface();

    const connect = (source, signal, handler) => {
        const handler_id = source.connect(signal, handler);
        teardown.push(() => source.disconnect(handler_id));
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
        const frame_handler = win.get_compositor_private().connect('first-frame', () => {
            rendered_windows.add(win);
            check_rendered();
        });

        const disconnect = () => {
            win.disconnect(frame_handler);
            win.disconnect(unmanaged_handler);

            const index = teardown.indexOf(disconnect);
            if (index >= 0)
                teardown.splice(index, 1);
        };

        const unmanaged_handler = win.connect('unmanaged', disconnect);
        teardown.push(disconnect);
    });

    check_rendered();

    const update_has_window = () => {
        dbus_interface.set_flag('HasWindow', extension.window_manager.current_window !== null);
    };
    connect(extension.window_manager, 'notify::current-window', update_has_window);
    update_has_window();

    const update_is_app_running = () => {
        dbus_interface.set_flag('IsAppRunning', extension.app_dbus_watch.is_registered);
    };
    connect(extension.app_dbus_watch, 'notify::is-registered', update_is_app_running);
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
            current_win_subscription.push(() => win.disconnect(handler_id));
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

    const update_starting_up = () => {
        dbus_interface.set_flag('StartingUp', Main.layoutManager._startingUp);
    };
    connect(Main.layoutManager, 'startup-complete', update_starting_up);
    update_starting_up();

    if (Main.welcomeDialog) {
        const update_welcome_dialog_visible = () => {
            dbus_interface.set_flag(
                'WelcomeDialogVisible',
                Main.welcomeDialog.state !== ModalDialog.State.CLOSED
            );
        };
        connect(Main.welcomeDialog, 'notify::state', update_welcome_dialog_visible);
        update_welcome_dialog_visible();
    }

    const update_overview_visible = () => {
        dbus_interface.set_flag('OverviewVisible', Main.overview.visible);
    };

    for (const signal of ['hiding', 'hidden', 'showing', 'shown'])
        connect(Main.overview, signal, update_overview_visible);

    update_overview_visible();

    dbus_interface.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');
    teardown.push(() => dbus_interface.dbus.unexport());
}

function disable() {
    while (teardown.length > 0)
        teardown.pop()();
}
