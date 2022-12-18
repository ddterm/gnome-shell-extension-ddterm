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

/* exported init enable disable settings toggle window_manager app_dbus subprocess */

const { GLib, GObject, Gio, Meta, Shell } = imports.gi;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { ConnectionSet } = Me.imports.connectionset;
const { PanelIconProxy } = Me.imports.panelicon;
const { WindowManager } = Me.imports.wm;

var settings = null;
var window_manager = null;

let wayland_client = null;
var subprocess = null;

let panel_icon = null;
var app_dbus = null;

let connections = null;
let window_connections = null;
let dbus_interface = null;

const APP_ID = 'com.github.amezin.ddterm';
const APP_WMCLASS = 'Com.github.amezin.ddterm';
const APP_DBUS_PATH = '/com/github/amezin/ddterm';
const WINDOW_PATH_PREFIX = `${APP_DBUS_PATH}/window/`;
const SIGINT = 2;

const AppDBusWatch = GObject.registerClass(
    {
        Properties: {
            'available': GObject.ParamSpec.boolean(
                'available',
                '',
                '',
                GObject.ParamFlags.READABLE,
                false
            ),
        },
    },
    class DDTermAppDBusWatch extends GObject.Object {
        _init(params) {
            super._init(params);

            this.action_group = null;

            this.watch_id = Gio.bus_watch_name(
                Gio.BusType.SESSION,
                APP_ID,
                Gio.BusNameWatcherFlags.NONE,
                this._appeared.bind(this),
                this._disappeared.bind(this)
            );
        }

        get available() {
            return this.action_group !== null;
        }

        _appeared(connection, name) {
            this.action_group = Gio.DBusActionGroup.get(connection, name, APP_DBUS_PATH);
            this.notify('available');
        }

        _disappeared() {
            this.action_group = null;
            this.notify('available');
        }

        unwatch() {
            if (this.watch_id) {
                Gio.bus_unwatch_name(this.watch_id);
                this.watch_id = null;
            }

            this.action_group = null;
        }
    }
);

class ExtensionDBusInterface {
    constructor() {
        let [_, xml] =
            Me.dir.get_child('com.github.amezin.ddterm.Extension.xml').load_contents(null);

        this.dbus = Gio.DBusExportedObject.wrapJSObject(ByteArray.toString(xml), this);
    }

    Toggle() {
        toggle();
    }

    Activate() {
        activate();
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
        toggle
    );
    Main.wm.addKeybinding(
        'ddterm-activate-hotkey',
        settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        activate
    );

    app_dbus = new AppDBusWatch();

    connections = new ConnectionSet();
    window_connections = new ConnectionSet();

    connections.connect(global.display, 'window-created', (_, win) => watch_window(win));
    connections.connect(settings, 'changed::window-skip-taskbar', set_skip_taskbar);

    window_manager = new WindowManager({ settings });

    connections.connect(window_manager, 'hide-request', () => {
        if (app_dbus.action_group)
            app_dbus.action_group.activate_action('hide', null);
    });

    dbus_interface = new ExtensionDBusInterface();
    dbus_interface.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');

    panel_icon = new PanelIconProxy();
    settings.bind(
        'panel-icon-type',
        panel_icon,
        'type',
        Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY
    );

    connections.connect(panel_icon, 'toggle', (_, value) => {
        if (value !== (window_manager.current_window !== null))
            toggle();
    });

    connections.connect(panel_icon, 'open-preferences', () => {
        if (app_dbus.action_group)
            app_dbus.action_group.activate_action('preferences', null);
        else
            imports.misc.extensionUtils.openPrefs();
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
        if (app_dbus && app_dbus.action_group)
            app_dbus.action_group.activate_action('quit', null);
        else if (subprocess)
            subprocess.send_signal(SIGINT);
    }

    if (app_dbus) {
        app_dbus.unwatch();
        app_dbus = null;
    }

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
    ];

    if (settings.get_boolean('force-x11-gdk-backend')) {
        const prev_gdk_backend = subprocess_launcher.getenv('GDK_BACKEND');

        if (prev_gdk_backend === null)
            argv.push('--unset-gdk-backend');
        else
            argv.push('--reset-gdk-backend', prev_gdk_backend);

        subprocess_launcher.setenv('GDK_BACKEND', 'x11', true);
    }

    if (Meta.WaylandClient &&
        Meta.is_wayland_compositor() &&
        subprocess_launcher.getenv('GDK_BACKEND') !== 'x11')
        wayland_client = Meta.WaylandClient.new(subprocess_launcher);
    else
        wayland_client = null;

    printerr(`Starting ddterm app: ${JSON.stringify(argv)}`);

    if (wayland_client)
        subprocess = wayland_client.spawnv(global.display, argv);
    else
        subprocess = subprocess_launcher.spawnv(argv);

    subprocess.wait_async(null, subprocess_terminated);
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
        if (app_dbus.action_group)
            app_dbus.action_group.activate_action('hide', null);
    } else {
        activate();
    }
}

function activate() {
    if (!window_manager.current_window)
        window_manager.update_monitor_index();

    if (window_manager.current_window) {
        Main.activateWindow(window_manager.current_window);
    } else if (app_dbus.action_group) {
        // Compatibility with old app version
        if (app_dbus.action_group.has_action('show'))
            app_dbus.action_group.activate_action('show', null);
        else
            app_dbus.action_group.activate_action('toggle', null);
    } else {
        spawn_app();
    }
}

function set_skip_taskbar() {
    if (!wayland_client || !window_manager.current_window)
        return;

    if (settings.get_boolean('window-skip-taskbar'))
        wayland_client.hide_from_window_list(window_manager.current_window);
    else
        wayland_client.show_in_window_list(window_manager.current_window);
}

function watch_window(win) {
    const handler_ids = [];

    const disconnect = () => {
        while (handler_ids.length > 0)
            window_connections.disconnect(win, handler_ids.pop());
    };

    const check = () => {
        disconnect();

        if (wayland_client) {
            if (!wayland_client.owns_window(win))
                return;
        } else if (subprocess) {
            const pid = win.get_pid();
            if (pid > 0 && pid.toString() !== subprocess.get_identifier())
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
