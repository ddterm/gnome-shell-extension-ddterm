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
const { extension, logger, wm } = ddterm.imports.ddterm.shell;
const { rxjs } = ddterm.imports.ddterm.thirdparty.rxjs;
const { rxutil, timers } = ddterm.imports.ddterm.rx;

const LOG_DOMAIN = 'ddterm-test';
const { message, info } = logger.context(LOG_DOMAIN, 'ddterm.ExtensionTest');

function js_signal(obj, name) {
    return new rxjs.Observable(observer => {
        const handler = obj.connect(name, (...args) => observer.next(args));
        return () => obj.disconnect(handler);
    });
}

function signal_with_init(obj, name) {
    return rxutil.signal(obj, name).pipe(rxjs.startWith([obj]));
}

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

const dbus_interface = new ExtensionTestDBusInterface();
const trace_subscription = new rxutil.Subscription();

function init() {
    GLib.setenv('G_MESSAGES_DEBUG', [LOG_DOMAIN, wm.LOG_DOMAIN].join(' '), false);
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
            dbus_interface.set_flag('RenderedFirstFrame', windows.has(current));
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

    trace_subscription.subscribe(
        current_win,
        win => dbus_interface.set_flag('HasWindow', win !== null)
    );

    trace_subscription.subscribe(
        rxutil.property(extension.app_dbus, 'available'),
        value => dbus_interface.set_flag('IsAppRunning', value)
    );

    const switch_signal = signal_name => rxjs.switchMap(source => {
        if (source === null)
            return rxjs.EMPTY;

        return signal_with_init(source, signal_name);
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

    trace_subscription.subscribe(
        signal_with_init(Main.layoutManager, 'startup-complete'),
        ([sender]) => dbus_interface.set_flag('StartingUp', sender._startingUp)
    );

    if (Main.welcomeDialog) {
        trace_subscription.subscribe(
            rxutil.property(Main.welcomeDialog, 'state'),
            state => dbus_interface.set_flag(
                'WelcomeDialogVisible',
                state !== ModalDialog.State.CLOSED
            )
        );
    }

    trace_subscription.subscribe(
        rxjs.merge(
            js_signal(Main.overview, 'hiding'),
            js_signal(Main.overview, 'hidden'),
            js_signal(Main.overview, 'showing'),
            js_signal(Main.overview, 'shown')
        ).pipe(rxjs.startWith([Main.overview])),
        ([sender]) => dbus_interface.set_flag('OverviewVisible', sender.visible)
    );

    dbus_interface.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');
}

function disable() {
    dbus_interface.dbus.unexport();
    trace_subscription.unsubscribe();
}
