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
const Me = imports.misc.extensionUtils.getCurrentExtension();

const ddterm = imports.ui.main.extensionManager.lookup('ddterm@amezin.github.com');
const { extension, rxutil, timers, logger } = ddterm.imports;
const { rxjs } = ddterm.imports.rxjs;

const LOG_DOMAIN = 'ddterm-test';
const { message, info } = logger.context(LOG_DOMAIN, 'ddterm.ExtensionTest');

function return_dbus_error(invocation, e) {
    if (e instanceof GLib.Error) {
        logError(e, `Exception in method call: ${invocation.get_method_name()}`);
        invocation.return_gerror(e);
    } else {
        let name = e.name;
        if (!name.includes('.')) {
            // likely to be a normal JS error
            name = `org.gnome.gjs.JSError.${name}`;
        }
        logError(e, `Exception in method call: ${invocation.get_method_name()}`);
        invocation.return_dbus_error(name, `${e}\n\n${e.stack}`);
    }
}

async function setup() {
    message('Setting up GNOME Shell for tests');

    if (global.settings.settings_schema.has_key('welcome-dialog-last-shown-version'))
        global.settings.set_string('welcome-dialog-last-shown-version', '99.0');

    if (Main.layoutManager._startingUp) {
        message('Waiting for startup to complete');
        await async_wait_signal(Main.layoutManager, 'startup-complete');
        message('Startup complete');
    }

    Main.messageTray.bannerBlocked = true;

    if (Main.welcomeDialog) {
        const ModalDialog = imports.ui.modalDialog;
        if (Main.welcomeDialog.state !== ModalDialog.State.CLOSED) {
            message('Closing welcome dialog');
            const wait_close = async_wait_signal(Main.welcomeDialog, 'closed');
            Main.welcomeDialog.close();
            await wait_close;
            message('Welcome dialog closed');
        }
    }

    if (Main.overview.visible) {
        message('Hiding overview');
        const wait_hide = async_wait_signal(Main.overview, 'hidden');
        Main.overview.hide();
        await wait_hide;
        message('Overview hidden');
    }

    message('Setup complete');
}

function async_wait_signal(object, signal) {
    let handler = null;

    return new Promise(resolve => {
        handler = object.connect(signal, () => resolve());
    }).finally(() => {
        if (handler)
            object.disconnect(handler);
    });
}

class ExtensionTestDBusInterface {
    constructor() {
        let [_, xml] =
            Me.dir.get_child('com.github.amezin.ddterm.ExtensionTest.xml').load_contents(null);

        this.dbus = Gio.DBusExportedObject.wrapJSObject(ByteArray.toString(xml), this);

        this._has_window = false;
        this._is_app_running = false;
        this._first_frame_rendered = false;
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

    get HasWindow() {
        return this._has_window;
    }

    get RenderedFirstFrame() {
        return this._first_frame_rendered;
    }

    get IsAppRunning() {
        return this._is_app_running;
    }

    set HasWindow(value) {
        if (this._has_window === value)
            return;

        this._has_window = value;
        this.emit_property_changed('HasWindow', GLib.Variant.new_boolean(value));
    }

    set RenderedFirstFrame(value) {
        if (this._first_frame_rendered === value)
            return;

        this._first_frame_rendered = value;
        this.emit_property_changed('RenderedFirstFrame', GLib.Variant.new_boolean(value));
    }

    set IsAppRunning(value) {
        if (this._is_app_running === value)
            return;

        this._is_app_running = value;
        this.emit_property_changed('IsAppRunning', GLib.Variant.new_boolean(value));
    }

    Toggle() {
        extension.toggle();
    }

    SetupAsync(params, invocation) {
        setup().then(() => {
            invocation.return_value(null);
        }).catch(e => {
            return_dbus_error(invocation, e);
        });
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
        return Meta.MonitorManager.get().emit('monitors-changed-internal');
    }

    IsWaylandCompositor() {
        return Meta.is_wayland_compositor();
    }

    GrabOpEnd() {
        extension.window_manager.update_size_setting_on_grab_end(
            global.display,
            extension.window_manager.current_window
        );
    }

    WaitLeisureAsync(params, invocation) {
        global.run_at_leisure(() => invocation.return_value(null));
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

const dbus_interface = new ExtensionTestDBusInterface();
const trace_subscription = new rxutil.Subscription();

function init() {
    GLib.setenv('G_MESSAGES_DEBUG', [LOG_DOMAIN, ddterm.imports.wm.LOG_DOMAIN].join(' '), false);
    timers.install();
}

function enable() {
    trace_subscription.connect(extension.settings, 'changed', (settings, key) => {
        dbus_interface.emit_signal(
            'SettingChanged',
            new GLib.Variant('(sv)', [key, settings.get_value(key)])
        );
    });

    trace_subscription.connect(extension.window_manager, 'move-resize-requested', (_, rect) => {
        dbus_interface.emit_signal(
            'MoveResizeRequested',
            new GLib.Variant('(iiii)', [rect.x, rect.y, rect.width, rect.height])
        );
    });

    const current_win = rxutil.property(extension.window_manager, 'current-window').pipe(
        rxjs.shareReplay({ bufferSize: 1, refCount: true })
    );

    const rendered_windows = new rxjs.BehaviorSubject(new Set());
    trace_subscription.add(() => rendered_windows.complete());

    trace_subscription.subscribe(
        rxjs.combineLatest(rendered_windows, current_win),
        ([windows, current]) => {
            dbus_interface.RenderedFirstFrame = windows.has(current);
        }
    );

    trace_subscription.connect(global.display, 'window-created', (_, win) => {
        const win_scope = new rxutil.Scope(win, rxutil.signal(win, 'unmanaged'));
        win_scope.connect(win.get_compositor_private(), 'first-frame', () => {
            const windows = rendered_windows.value;
            windows.add(win);
            rendered_windows.next(windows);
        });
    });

    trace_subscription.subscribe(current_win, win => {
        dbus_interface.HasWindow = win !== null;
    });

    trace_subscription.subscribe(
        rxutil.property(extension.app_dbus, 'available'),
        value => {
            dbus_interface.IsAppRunning = value;
        }
    );

    const switch_signal = signal_name => rxjs.switchMap(source => {
        if (source === null)
            return rxjs.EMPTY;

        return rxutil.signal(source, signal_name).pipe(rxjs.startWith([source]));
    });

    trace_subscription.subscribe(
        current_win.pipe(switch_signal('position-changed')),
        ([win]) => {
            const rect = win.get_frame_rect();

            dbus_interface.emit_signal(
                'PositionChanged',
                new GLib.Variant('(iiii)', [rect.x, rect.y, rect.width, rect.height])
            );
        }
    );

    trace_subscription.subscribe(
        current_win.pipe(switch_signal('size-changed')),
        ([win]) => {
            const rect = win.get_frame_rect();

            dbus_interface.emit_signal(
                'SizeChanged',
                new GLib.Variant('(iiii)', [rect.x, rect.y, rect.width, rect.height])
            );
        }
    );

    trace_subscription.subscribe(
        current_win.pipe(switch_signal('notify::maximized-vertically')),
        ([win]) => {
            dbus_interface.emit_signal(
                'MaximizedVertically',
                new GLib.Variant('(b)', [win.maximized_vertically])
            );
        }
    );

    trace_subscription.subscribe(
        current_win.pipe(switch_signal('notify::maximized-horizontally')),
        ([win]) => {
            dbus_interface.emit_signal(
                'MaximizedHorizontally',
                new GLib.Variant('(b)', [win.maximized_horizontally])
            );
        }
    );

    dbus_interface.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');
}

function disable() {
    dbus_interface.dbus.unexport();
    trace_subscription.unsubscribe();
}
