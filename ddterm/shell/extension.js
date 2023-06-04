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

/* exported init enable disable settings toggle window_manager app_dbus_watch subprocess */

const { GLib, Gio, Meta, Shell } = imports.gi;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { BusNameWatch } = Me.imports.ddterm.shell.buswatch;
const { ConnectionSet } = Me.imports.ddterm.shell.connectionset;
const { PanelIconProxy } = Me.imports.ddterm.shell.panelicon;
const { WindowManager } = Me.imports.ddterm.shell.wm;

var settings = null;
var window_manager = null;

let wayland_client = null;
var subprocess = null;

let panel_icon = null;
var app_dbus_watch = null;
let app_actions = null;

let connections = null;
let window_connections = null;
let dbus_interface = null;

let desktop_entry = null;
let dbus_service = null;

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

    Toggle() {
        toggle();
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

class InstallableResource {
    constructor(source_file, target_file) {
        this.content = ByteArray.toString(source_file.load_contents(null)[1]);
        this.content = this.content.replace(/@LAUNCHER@/, Me.dir.get_child(APP_ID).get_path());
        this.target_file = target_file;
    }

    install() {
        GLib.mkdir_with_parents(this.target_file.get_parent().get_path(), 0o700);

        this.target_file.replace_contents(
            ByteArray.fromString(this.content),
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );
    }

    uninstall() {
        try {
            this.target_file.delete(null);
        } catch (e) {
            logError(e);
        }
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
        toggle
    );
    Main.wm.addKeybinding(
        'ddterm-activate-hotkey',
        settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        activate
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

    desktop_entry = new InstallableResource(
        Me.dir.get_child('ddterm').get_child('com.github.amezin.ddterm.desktop.in'),
        Gio.File.new_for_path(GLib.build_filenamev(
            [
                GLib.get_user_data_dir(),
                'applications',
                `${APP_ID}.desktop`,
            ]))
    );
    desktop_entry.install();

    dbus_service = new InstallableResource(
        Me.dir.get_child('ddterm').get_child('com.github.amezin.ddterm.service.in'),
        Gio.File.new_for_path(GLib.build_filenamev(
            [
                GLib.get_user_runtime_dir(),
                'dbus-1',
                'services',
                `${APP_ID}.service`,
            ]))
    );
    dbus_service.install();

    Gio.DBus.session.call(
        'org.freedesktop.DBus',
        '/org/freedesktop/DBus',
        'org.freedesktop.DBus',
        'ReloadConfig',
        null,
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        null
    );
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
        else if (subprocess)
            subprocess.send_signal(SIGINT);
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

    if (desktop_entry) {
        // Don't uninstall the desktop file because of screen locking
        // GNOME Shell picks up newly installed desktop files with a noticeable delay
        if (!Main.sessionMode.isLocked)
            desktop_entry.uninstall();

        desktop_entry = null;
    }

    if (dbus_service) {
        dbus_service.uninstall();
        dbus_service = null;
    }

    settings = null;
}

function spawn_app() {
    if (subprocess)
        return;

    const subprocess_launcher = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.NONE);

    const context = global.create_app_launch_context(0, -1);
    subprocess_launcher.set_environ(context.get_environment());

    let argv = [
        Me.dir.get_child(APP_ID).get_path(),
        '--undecorated',
        '--gapplication-service',
    ];

    if (Meta.is_wayland_compositor()) {
        try {
            wayland_client = Meta.WaylandClient.new(global.context, subprocess_launcher);
        } catch {
            wayland_client = Meta.WaylandClient.new(subprocess_launcher);
        }
    } else {
        wayland_client = null;
    }

    printerr(`Starting ddterm app: ${JSON.stringify(argv)}`);

    if (wayland_client)
        subprocess = wayland_client.spawnv(global.display, argv);
    else
        subprocess = subprocess_launcher.spawnv(argv);

    subprocess.wait_async(null, subprocess_terminated);
}

async function ensure_app_on_bus() {
    if (app_dbus_watch.is_registered)
        return;

    const cancellable = Gio.Cancellable.new();

    try {
        const wait_registered = new Promise(resolve => {
            const handler = app_dbus_watch.connect('notify::is-registered', source => {
                if (source.is_registered)
                    resolve(true);
            });

            cancellable.connect(() => app_dbus_watch.disconnect(handler));
        });

        spawn_app();

        const wait_terminated = new Promise(resolve => {
            subprocess.wait_async(cancellable, (source, res) => {
                if (cancellable.is_cancelled())
                    return;

                source.wait_finish(res);
                resolve(false);
            });
        });

        const registered = await Promise.race([wait_registered, wait_terminated]);
        if (!registered)
            throw new Error('ddterm app terminated without registering on D-Bus');
    } finally {
        cancellable.cancel();
    }
}

function subprocess_terminated(source) {
    if (subprocess === source) {
        subprocess = null;
        wayland_client = null;
    }

    if (source.get_if_signaled()) {
        const signum = source.get_term_sig();
        printerr(`ddterm app killed by signal ${signum} (${GLib.strsignal(signum)})`);
    } else {
        printerr(`ddterm app exited with status ${source.get_exit_status()}`);
    }
}

function toggle() {
    if (window_manager.current_window) {
        if (app_dbus_watch.is_registered)
            app_actions.activate_action('hide', null);
    } else {
        activate().catch(err => logError(err));
    }
}

async function activate() {
    if (!window_manager.current_window)
        window_manager.update_monitor_index();

    if (window_manager.current_window) {
        Main.activateWindow(window_manager.current_window);
    } else {
        await ensure_app_on_bus();
        app_actions.activate_action('show', null);
    }
}

function set_skip_taskbar() {
    const win = window_manager.current_window;

    if (!win || win.get_client_type() !== Meta.WindowClientType.WAYLAND)
        return;

    if (settings.get_boolean('window-skip-taskbar'))
        wayland_client.hide_from_window_list(win);
    else
        wayland_client.show_in_window_list(win);
}

function watch_window(win) {
    const handler_ids = [];

    const disconnect = () => {
        while (handler_ids.length > 0)
            window_connections.disconnect(win, handler_ids.pop());
    };

    const check = () => {
        disconnect();

        if (win.get_client_type() === Meta.WindowClientType.WAYLAND) {
            if (wayland_client === null || !wayland_client.owns_window(win))
                return;
        } else if (subprocess) {
            if (win.get_pid().toString() !== subprocess.get_identifier())
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
