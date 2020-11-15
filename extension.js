'use strict';

/* exported init enable disable */

const { GLib, GObject, Gio, Meta, Shell } = imports.gi;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();

let settings = null;

let current_window = null;

let bus_watch_id = null;
let dbus_action_group = null;

const APP_ID = 'com.github.amezin.ddterm';
const APP_DBUS_PATH = '/com/github/amezin/ddterm';
const WINDOW_PATH_PREFIX = `${APP_DBUS_PATH}/window/`;

const APP_INFO = Gio.AppInfo.create_from_commandline(
    'com.github.amezin.ddterm --undecorated',
    'Drop Down Terminal',
    Gio.AppInfoCreateFlags.SUPPORTS_STARTUP_NOTIFICATION
);

function init() {
}

function enable() {
    disconnect_settings();
    settings = imports.misc.extensionUtils.getSettings();

    Main.wm.addKeybinding(
        'ddterm-toggle-hotkey',
        settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        toggle
    );

    stop_dbus_watch();
    bus_watch_id = Gio.bus_watch_name(
        Gio.BusType.SESSION,
        APP_ID,
        Gio.BusNameWatcherFlags.NONE,
        dbus_appeared,
        dbus_disappeared
    );

    disconnect_created_handler();
    global.display.connect('window-created', handle_created);

    disconnect_focus_tracking();
    global.display.connect('notify::focus-window', focus_window_changed);

    settings.connect('changed::window-above', set_window_above);
    settings.connect('changed::window-stick', set_window_stick);
}

function disable() {
    if (Main.sessionMode.allowExtensions) {
        // Stop the app only if the extension isn't being disabled because of
        // lock screen/switch to other mode where extensions aren't allowed.
        // Because when the session switches back to normal mode we want to
        // keep all open terminals.
        if (dbus_action_group)
            dbus_action_group.activate_action('quit', null);
    }

    stop_dbus_watch();
    dbus_action_group = null;

    disconnect_created_handler();
    disconnect_focus_tracking();

    Main.wm.removeKeybinding('ddterm-toggle-hotkey');

    disconnect_settings();
}

function spawn_app() {
    // Command line parser in G[Desktop]AppInfo doesn't handle quoted
    // arguments properly. In particular, quoted spaces.
    // The app will still launch, but the name will be wrong.
    // So prepend PATH instead.
    const context = global.create_app_launch_context(0, -1);
    const current_env = context.get_environment();
    const current_path = GLib.environ_getenv(current_env, 'PATH');
    context.setenv('PATH', `${Me.dir.get_path()}:${current_path}`);

    if (settings.get_boolean('force-x11-gdk-backend'))
        context.setenv('GDK_BACKEND', 'x11');

    APP_INFO.launch([], context);
}

function toggle() {
    if (dbus_action_group)
        dbus_action_group.activate_action('toggle', null);
    else
        spawn_app();
}

function dbus_appeared(connection, name) {
    dbus_action_group = Gio.DBusActionGroup.get(connection, name, APP_DBUS_PATH);
}

function dbus_disappeared() {
    dbus_action_group = null;
}

function handle_created(display, win) {
    const handler_ids = [
        win.connect('notify::gtk-application-id', track_window),
        win.connect('notify::gtk-window-object-path', track_window),
    ];

    const disconnect = () => {
        handler_ids.forEach(handler => win.disconnect(handler));
    };

    handler_ids.push(win.connect('unmanaging', disconnect));
    handler_ids.push(win.connect('unmanaged', disconnect));

    track_window(win);
}

function focus_window_changed() {
    if (!current_window || current_window.is_hidden())
        return;

    if (!settings || !settings.get_boolean('hide-when-focus-lost'))
        return;

    const win = global.display.focus_window;
    if (win !== null) {
        if (current_window === win || current_window.is_ancestor_of_transient(win))
            return;
    }

    if (dbus_action_group)
        dbus_action_group.activate_action('hide', null);
}

function is_dropdown_terminal_window(win) {
    return (
        win.gtk_application_id === APP_ID &&
        win.gtk_window_object_path &&
        win.gtk_window_object_path.startsWith(WINDOW_PATH_PREFIX)
    );
}

function set_window_above() {
    if (current_window === null)
        return;

    if (settings.get_boolean('window-above'))
        current_window.make_above();
    else
        current_window.unmake_above();
}

function set_window_stick() {
    if (current_window === null)
        return;

    if (settings.get_boolean('window-stick'))
        current_window.stick();
    else
        current_window.unstick();
}

function track_window(win) {
    if (!is_dropdown_terminal_window(win)) {
        untrack_window(win);
        return;
    }

    if (win === current_window)
        return;

    current_window = win;

    win.connect('unmanaging', untrack_window);
    win.connect('unmanaged', untrack_window);

    let height_ratio = settings.get_double('window-height');

    if (win.get_client_type() === Meta.WindowClientType.WAYLAND) {
        if (Meta.prefs_get_auto_maximize())
            height_ratio = Math.min(height_ratio, 0.8);
    }

    const workarea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.currentMonitor.index);
    win.move_resize_frame(true, workarea.x, workarea.y, workarea.width, workarea.height * height_ratio);

    // Sometimes size-changed is emitted from .move_resize_frame() with .get_frame_rect() returning old/incorrect size.
    // Thus connect to size-changed only after initial size is set.
    win.connect('size-changed', update_height_setting);

    Main.activateWindow(win);

    set_window_above();
    set_window_stick();
}

function update_height_setting(win) {
    if (win !== current_window)
        return;

    const window_rect = win.get_frame_rect();

    // Can't use window.monitor here - it's out of sync
    const monitor = global.display.get_monitor_index_for_rect(window_rect);
    if (monitor < 0)
        return;

    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitor);
    const current_height = window_rect.height / workarea.height;
    settings.set_double('window-height', current_height);
}

function untrack_window(win) {
    if (win === current_window)
        current_window = null;

    if (win) {
        GObject.signal_handlers_disconnect_by_func(win, untrack_window);
        GObject.signal_handlers_disconnect_by_func(win, update_height_setting);
    }
}

function stop_dbus_watch() {
    if (bus_watch_id) {
        Gio.bus_unwatch_name(bus_watch_id);
        bus_watch_id = null;
    }
}

function disconnect_created_handler() {
    GObject.signal_handlers_disconnect_by_func(global.display, handle_created);
}

function disconnect_focus_tracking() {
    GObject.signal_handlers_disconnect_by_func(global.display, focus_window_changed);
}

function disconnect_settings() {
    if (settings) {
        GObject.signal_handlers_disconnect_by_func(settings, set_window_above);
        GObject.signal_handlers_disconnect_by_func(settings, set_window_stick);
    }
}
