/*
    Copyright © 2020, 2021 Aleksandr Mezin

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

/* exported init enable disable settings toggle window_manager app_dbus_watch */

const { GLib, GObject, Gio, Meta, Shell } = imports.gi;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { application } = Me.imports.ddterm.shell;
const { BusNameWatch } = Me.imports.ddterm.shell.buswatch;
const { Installer } = Me.imports.ddterm.shell.install;
const { PanelIconProxy } = Me.imports.ddterm.shell.panelicon;
const { WindowManager } = Me.imports.ddterm.shell.wm;
const { WindowMatch } = Me.imports.ddterm.shell.windowmatch;

let app = null;

var settings = null;
var window_manager = null;
let window_matcher = null;
var app_dbus_watch = null;
let app_actions = null;
let dbus_interface = null;
let installer = null;
let panel_icon = null;

const APP_ID = 'com.github.amezin.ddterm';
const APP_WMCLASS = 'Com.github.amezin.ddterm';
const APP_DBUS_PATH = '/com/github/amezin/ddterm';
const WINDOW_PATH_PREFIX = `${APP_DBUS_PATH}/window/`;
const SIGINT = 2;

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

class ExtensionDBusInterface {
    constructor() {
        const xml_file =
            Me.dir.get_child('ddterm').get_child('com.github.amezin.ddterm.Extension.xml');

        const [_, xml] = xml_file.load_contents(null);
        this.dbus = Gio.DBusExportedObject.wrapJSObject(ByteArray.toString(xml), this);
    }

    ToggleAsync(params, invocation) {
        handle_dbus_method_call_async(toggle, params, invocation);
    }

    ActivateAsync(params, invocation) {
        handle_dbus_method_call_async(activate, params, invocation);
    }

    ServiceAsync(params, invocation) {
        handle_dbus_method_call_async(ensure_app_on_bus, params, invocation);
    }

    GetTargetRect() {
        /*
         * Don't want to track mouse pointer continuously, so try to update the
         * index manually in multiple places. Also, Meta.CursorTracker doesn't
         * seem to work properly in X11 session.
         */
        if (!window_manager.current_window)
            window_manager.update_monitor_index();

        const r = window_manager.target_rect;
        return [r.x, r.y, r.width, r.height];
    }

    get TargetRect() {
        return this.GetTargetRect();
    }

    get Version() {
        return `${Me.metadata.version}`;
    }
}

function init() {
    imports.misc.extensionUtils.initTranslations();
}

function enable() {
    settings = imports.misc.extensionUtils.getSettings();

    Main.wm.addKeybinding(
        'ddterm-toggle-hotkey',
        settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => {
            toggle().catch(e => logError(e, 'Failed to toggle ddterm by keybinding'));
        }
    );
    Main.wm.addKeybinding(
        'ddterm-activate-hotkey',
        settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => {
            activate().catch(e => logError(e, 'Failed to activate ddterm by keybinding'));
        }
    );

    app_dbus_watch = new BusNameWatch({
        connection: Gio.DBus.session,
        name: APP_ID,
    });

    app_actions = Gio.DBusActionGroup.get(Gio.DBus.session, APP_ID, APP_DBUS_PATH);

    window_manager = new WindowManager({ settings });

    window_manager.connect('hide-request', () => {
        if (app_dbus_watch.is_registered)
            app_actions.activate_action('hide', null);
    });

    window_manager.connect('notify::current-window', set_skip_taskbar);
    settings.connect('changed::window-skip-taskbar', set_skip_taskbar);

    window_matcher = new WindowMatch({
        app,
        display: global.display,
        gtk_application_id: APP_ID,
        gtk_window_object_path_prefix: WINDOW_PATH_PREFIX,
        wm_class: APP_WMCLASS,
    });

    window_matcher.connect('notify::current-window', () => {
        if (window_matcher.current_window)
            window_manager.manage_window(window_matcher.current_window);
    });

    if (window_matcher.current_window)
        window_manager.manage_window(window_matcher.current_window);

    dbus_interface = new ExtensionDBusInterface();
    dbus_interface.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');

    panel_icon = new PanelIconProxy();
    settings.bind(
        'panel-icon-type',
        panel_icon,
        'type-name',
        Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY
    );

    panel_icon.connect('toggle', (_, value) => {
        if (value !== (window_manager.current_window !== null))
            toggle();
    });

    panel_icon.connect('open-preferences', () => {
        app_actions.activate_action('preferences', null);
    });

    window_manager.connect('notify::current-window', () => {
        panel_icon.active = window_manager.current_window !== null;
    });

    window_manager.connect('notify::target-rect', () => {
        dbus_interface.dbus.emit_property_changed(
            'TargetRect',
            new GLib.Variant('(iiii)', dbus_interface.TargetRect)
        );

        dbus_interface.dbus.flush();
    });

    installer = new Installer();
    installer.install();
}

function disable() {
    Main.wm.removeKeybinding('ddterm-toggle-hotkey');
    Main.wm.removeKeybinding('ddterm-activate-hotkey');

    dbus_interface?.dbus.unexport();
    dbus_interface = null;

    if (!Main.sessionMode.isLocked) {
        // Stop the app only if the extension isn't being disabled because of
        // lock screen. Because when the session switches back to normal mode
        // we want to keep all open terminals.
        if (app_dbus_watch?.is_registered)
            app_actions.activate_action('quit', null);
        else if (app)
            app.subprocess.send_signal(SIGINT);
    }

    app_dbus_watch?.unwatch();
    app_dbus_watch = null;

    app_actions = null;

    window_matcher?.disable();
    window_matcher = null;

    window_manager?.disable();
    window_manager = null;

    panel_icon?.remove();
    panel_icon = null;

    // Don't uninstall desktop/service files because of screen locking
    // GNOME Shell picks up newly installed desktop files with a noticeable delay
    if (!Main.sessionMode.isLocked)
        installer?.uninstall();

    installer = null;

    settings?.run_dispose();
    settings = null;
}

function handle_cancel(cancellable, callback) {
    if (!cancellable)
        return () => {};

    const handler_id = cancellable.connect(() => {
        try {
            cancellable.set_error_if_cancelled();
        } catch (ex) {
            callback(ex);
        }
    });

    return () => cancellable.disconnect(handler_id);
}

function wait_signal(obj, signal, cancellable = null, check = null) {
    return new Promise((resolve, reject) => {
        const cancel_disconnect = handle_cancel(cancellable, ex => {
            obj.disconnect(handler_id);
            reject(ex);
        });

        const handler_id = obj.connect(signal, (...args) => {
            if (check && !check(...args))
                return;

            cancel_disconnect();
            obj.disconnect(handler_id);
            resolve(args);
        });
    });
}

function wait_property(obj, prop, check, cancellable = null) {
    if (check(obj[prop]))
        return Promise.resolve([obj, GObject.Object.find_property.call(obj.$gtype, prop)]);

    return wait_signal(obj, `notify::${prop}`, cancellable, () => check(obj[prop]));
}

function wait_timeout(timeout_ms, cancellable = null) {
    return new Promise((resolve, reject) => {
        const cancel_disconnect = handle_cancel(cancellable, ex => {
            GLib.Source.remove(source);
            reject(ex);
        });

        const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout_ms, () => {
            cancel_disconnect();
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

async function ensure_app_on_bus() {
    if (app_dbus_watch.is_registered)
        return;

    const cancellable = Gio.Cancellable.new();

    try {
        const registered = wait_property(app_dbus_watch, 'is-registered', v => v, cancellable);

        if (!app) {
            const xwayland_flag =
                settings.get_boolean('force-x11-gdk-backend') ? ['--allowed-gdk-backends=x11'] : [];

            app = application.spawn([
                Me.dir.get_child(APP_ID).get_path(),
                '--gapplication-service',
                ...xwayland_flag,
            ]);

            app.connect('terminated', () => {
                app = null;

                if (window_matcher)
                    window_matcher.app = null;
            });

            window_matcher.app = app;
        }

        const terminated = wait_signal(app, 'terminated', cancellable).then(() => {
            throw new Error('ddterm app terminated without registering on D-Bus');
        });

        const timeout = wait_timeout(10000, cancellable).then(() => {
            throw GLib.Error.new_literal(
                Gio.io_error_quark(),
                Gio.IOErrorEnum.TIMED_OUT,
                'ddterm app failed to start in 10 seconds'
            );
        });

        await Promise.race([registered, terminated, timeout]);
    } finally {
        cancellable.cancel();
    }
}

async function wait_app_window_visible(visible) {
    visible = Boolean(visible);

    if (Boolean(window_manager.current_window) === visible)
        return;

    const cancellable = Gio.Cancellable.new();

    try {
        const wait_window = wait_property(
            window_manager,
            'current-window',
            v => Boolean(v) === visible,
            cancellable
        );

        const wait_dbus = wait_signal(
            app_dbus_watch,
            'notify::owner',
            cancellable,
            /* Don't interrupt when target state is 'hidden' and the app has stopped */
            () => visible || app_dbus_watch.owner
        ).then(() => {
            throw new Error(visible ? 'ddterm failed to show' : 'ddterm failed to hide');
        });

        const timeout = wait_timeout(10000, cancellable).then(() => {
            throw GLib.Error.new_literal(
                Gio.io_error_quark(),
                Gio.IOErrorEnum.TIMED_OUT,
                visible
                    ? 'ddterm failed to show in 10 seconds'
                    : 'ddterm failed to hide in 10 seconds'
            );
        });

        await Promise.race([wait_window, wait_dbus, timeout]);
    } finally {
        cancellable.cancel();
    }
}

async function toggle() {
    if (window_manager.current_window) {
        if (app_dbus_watch.is_registered)
            app_actions.activate_action('hide', null);

        await wait_app_window_visible(false);
    } else {
        await activate();
    }
}

async function activate() {
    if (window_manager.current_window) {
        Main.activateWindow(window_manager.current_window);
        return;
    }

    window_manager.update_monitor_index();

    await ensure_app_on_bus();

    app_actions.activate_action('show', null);
    await wait_app_window_visible(true);
}

function set_skip_taskbar() {
    const win = window_manager.current_window;

    if (win?.get_client_type() !== Meta.WindowClientType.WAYLAND)
        return;

    if (settings.get_boolean('window-skip-taskbar'))
        app.wayland_client.hide_from_window_list(win);
    else
        app.wayland_client.show_in_window_list(win);
}
