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
const { ConnectionSet } = Me.imports.ddterm.shell.connectionset;
const { Installer } = Me.imports.ddterm.shell.install;
const { PanelIconProxy } = Me.imports.ddterm.shell.panelicon;
const { WindowManager } = Me.imports.ddterm.shell.wm;

var settings = null;
var window_manager = null;

let app = null;

let panel_icon = null;
var app_dbus_watch = null;
let app_actions = null;

let connections = null;
let window_connections = null;
let dbus_interface = null;

let installer = null;

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

    connections = new ConnectionSet();
    window_connections = new ConnectionSet();

    connections.connect(global.display, 'window-created', (_, win) => watch_window(win));
    connections.connect(settings, 'changed::window-skip-taskbar', set_skip_taskbar);

    window_manager = new WindowManager({ settings });

    connections.connect(window_manager, 'hide-request', () => {
        if (app_dbus_watch.is_registered)
            app_actions.activate_action('hide', null);
    });

    dbus_interface = new ExtensionDBusInterface();
    dbus_interface.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');

    panel_icon = new PanelIconProxy();
    settings.bind(
        'panel-icon-type',
        panel_icon,
        'type-name',
        Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY
    );

    connections.connect(panel_icon, 'toggle', (_, value) => {
        if (value !== (window_manager.current_window !== null))
            toggle();
    });

    connections.connect(panel_icon, 'open-preferences', () => {
        app_actions.activate_action('preferences', null);
    });

    connections.connect(window_manager, 'notify::current-window', () => {
        panel_icon.active = window_manager.current_window !== null;
    });

    connections.connect(window_manager, 'notify::target-rect', () => {
        dbus_interface.dbus.emit_property_changed(
            'TargetRect',
            new GLib.Variant('(iiii)', dbus_interface.TargetRect)
        );

        dbus_interface.dbus.flush();
    });

    Meta.get_window_actors(global.display).forEach(actor => {
        watch_window(actor.meta_window);
    });

    installer = new Installer();
    installer.install();
}

function disable() {
    Main.wm.removeKeybinding('ddterm-toggle-hotkey');
    Main.wm.removeKeybinding('ddterm-activate-hotkey');

    if (dbus_interface) {
        dbus_interface.dbus.unexport();
        dbus_interface = null;
    }

    if (!Main.sessionMode.isLocked) {
        // Stop the app only if the extension isn't being disabled because of
        // lock screen. Because when the session switches back to normal mode
        // we want to keep all open terminals.
        if (app_dbus_watch && app_dbus_watch.is_registered)
            app_actions.activate_action('quit', null);
        else if (app)
            app.subprocess.send_signal(SIGINT);
    }

    if (app_dbus_watch) {
        app_dbus_watch.unwatch();
        app_dbus_watch = null;
    }

    app_actions = null;

    if (window_connections) {
        window_connections.disconnect();
        window_connections = null;
    }

    if (window_manager) {
        window_manager.disable();
        window_manager = null;
    }

    if (connections) {
        connections.disconnect();
        connections = null;
    }

    if (panel_icon) {
        Gio.Settings.unbind(panel_icon, 'type');
        panel_icon.remove();
        panel_icon = null;
    }

    if (installer) {
        // Don't uninstall desktop/service files because of screen locking
        // GNOME Shell picks up newly installed desktop files with a noticeable delay
        if (!Main.sessionMode.isLocked)
            installer.uninstall();

        installer = null;
    }

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
            });
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
    if (!window_manager.current_window)
        window_manager.update_monitor_index();

    if (window_manager.current_window) {
        Main.activateWindow(window_manager.current_window);
        return;
    }

    await ensure_app_on_bus();

    app_actions.activate_action('show', null);
    await wait_app_window_visible(true);
}

function set_skip_taskbar() {
    const win = window_manager.current_window;

    if (!win || win.get_client_type() !== Meta.WindowClientType.WAYLAND)
        return;

    if (settings.get_boolean('window-skip-taskbar'))
        app.wayland_client.hide_from_window_list(win);
    else
        app.wayland_client.show_in_window_list(win);
}

function watch_window(win) {
    const handler_ids = [];

    const disconnect = () => {
        while (handler_ids.length > 0)
            window_connections.disconnect(win, handler_ids.pop());
    };

    const check = () => {
        disconnect();

        /*
            With X11 window:
            - Shell can be restarted without logging out
            - Application doesn't have to be started using WaylandClient

            So if we did not launch the app, allow this check to be skipped
            on X11.
        */
        if (!app?.owns_window(win)) {
            if (app || win.get_client_type() === Meta.WindowClientType.WAYLAND)
                return;
        }

        const wm_class = win.wm_class;
        if (wm_class) {
            if (wm_class !== APP_WMCLASS && wm_class !== APP_ID)
                return;

            const gtk_application_id = win.gtk_application_id;
            if (gtk_application_id) {
                if (gtk_application_id !== APP_ID)
                    return;

                const gtk_window_object_path = win.gtk_window_object_path;
                if (gtk_window_object_path) {
                    if (gtk_window_object_path.startsWith(WINDOW_PATH_PREFIX)) {
                        window_manager.manage_window(win);
                        set_skip_taskbar();
                    }

                    return;
                }
            }
        }

        handler_ids.push(
            window_connections.connect(win, 'notify::gtk-application-id', check),
            window_connections.connect(win, 'notify::gtk-window-object-path', check),
            window_connections.connect(win, 'notify::wm-class', check),
            window_connections.connect(win, 'unmanaging', disconnect),
            window_connections.connect(win, 'unmanaged', disconnect)
        );
    };

    check();
}
