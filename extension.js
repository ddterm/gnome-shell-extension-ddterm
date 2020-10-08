'use strict';

/* exported init enable disable */

const { Gio, Meta, Shell } = imports.gi;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { util } = imports.misc;

let settings = null;

let current_window = null;
let created_handler_id = null;

let bus_watch_id = null;
let dbus_action_group = null;

let focus_tracking_id = null;

const APP_ID = 'com.github.amezin.ddterm';
const APP_DBUS_PATH = '/com/github/amezin/ddterm';
const WINDOW_PATH_PREFIX = `${APP_DBUS_PATH}/window/`;

function init() {
}

function enable() {
    dispose_settings();
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
    created_handler_id = global.display.connect('window-created', handle_created);

    disconnect_focus_tracking();
    focus_tracking_id = global.display.connect('notify::focus-window', focus_window_changed);

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
    dispose_action_group();
    disconnect_created_handler();
    disconnect_focus_tracking();

    Main.wm.removeKeybinding('ddterm-toggle-hotkey');

    dispose_settings();
}

function toggle() {
    if (dbus_action_group)
        dbus_action_group.activate_action('toggle', null);
    else
        util.spawn(['gjs', Me.dir.get_child('application.js').get_path(), '--undecorated']);
}

function dbus_appeared(connection, name) {
    dispose_action_group();
    dbus_action_group = Gio.DBusActionGroup.get(connection, name, APP_DBUS_PATH);
}

function dbus_disappeared() {
    dispose_action_group();
}

function handle_created(display, win) {
    win.connect('notify::gtk-application-id', track_window);
    win.connect('notify::gtk-window-object-path', track_window);

    track_window(win);
}

function focus_window_changed() {
    if (!current_window || current_window.is_hidden())
        return;

    if (!settings || !settings.get_boolean('hide-when-focus-lost'))
        return;

    const win = global.display.focus_window;

    if (win) {
        if (win.get_pid() === current_window.get_pid())
            return;

        for (let parent = win; parent !== null; parent = parent.get_transient_for()) {
            if (parent === current_window)
                return;
        }
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
    if (!is_dropdown_terminal_window(win))
        return;

    if (win === current_window)
        return;

    current_window = win;

    win.connect('unmanaging', untrack_window);
    win.connect('unmanaged', untrack_window);

    const height_ratio = settings.get_double('window-height');
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

    const monitor = current_window.get_monitor();
    if (monitor < 0)
        return;

    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitor);
    const current_height = win.get_frame_rect().height / workarea.height;
    settings.set_double('window-height', current_height);
}

function untrack_window(win) {
    if (win === current_window)
        current_window = null;
}

function stop_dbus_watch() {
    if (bus_watch_id) {
        Gio.bus_unwatch_name(bus_watch_id);
        bus_watch_id = null;
    }
}

function disconnect_created_handler() {
    if (created_handler_id) {
        global.display.disconnect(created_handler_id);
        created_handler_id = null;
    }
}

function dispose_action_group() {
    if (dbus_action_group) {
        dbus_action_group.run_dispose();
        dbus_action_group = null;
    }
}

function dispose_settings() {
    if (settings) {
        settings.run_dispose();
        settings = null;
    }
}

function disconnect_focus_tracking() {
    if (focus_tracking_id) {
        global.display.disconnect(focus_tracking_id);
        focus_tracking_id = null;
    }
}
