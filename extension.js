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

/* exported init enable disable settings current_window target_rect_for_workarea_size toggle */

const { GLib, GObject, Gio, Atk, Clutter, Meta, Shell, St } = imports.gi;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const WindowManager = imports.ui.windowManager;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { util } = Me.imports;

let tests = null;

var settings = null;

var current_window = null;
var current_workarea = null;
var current_monitor_scale = 1;
var current_target_rect = null;

let bus_watch_id = null;
let dbus_action_group = null;

let wayland_client = null;
let subprocess = null;

let show_animation = Clutter.AnimationMode.LINEAR;
let hide_animation = Clutter.AnimationMode.LINEAR;

let resize_x = false;
let right_or_bottom = false;
let animation_pivot_x = 0.5;
let animation_pivot_y = 0;
let animation_scale_x = 1.0;
let animation_scale_y = 0.0;

let panel_icon = null;

const APP_ID = 'com.github.amezin.ddterm';
const APP_DBUS_PATH = '/com/github/amezin/ddterm';
const WINDOW_PATH_PREFIX = `${APP_DBUS_PATH}/window/`;
const SUBPROCESS_ARGV = [Me.dir.get_child('com.github.amezin.ddterm').get_path(), '--undecorated'];
const IS_WAYLAND_COMPOSITOR = Meta.is_wayland_compositor();
const USE_WAYLAND_CLIENT = Meta.WaylandClient && IS_WAYLAND_COMPOSITOR;
const SIGINT = 2;

const PanelIconPopupMenu = GObject.registerClass(
    class PanelIconPopupMenu extends PanelMenu.Button {
        _init() {
            super._init(null, 'ddterm');

            this.add_actor(new St.Icon({
                icon_name: 'utilities-terminal',
                style_class: 'system-status-icon',
            }));
            this.add_style_class_name('panel-status-button');

            this.toggle_item = new PopupMenu.PopupSwitchMenuItem('Show', current_window !== null);
            this.menu.addMenuItem(this.toggle_item);
            this.toggle_item.connect('toggled', (_, value) => {
                if (value !== (current_window !== null))
                    toggle();
            });

            this.preferences_item = new PopupMenu.PopupMenuItem('Preferences...');
            this.menu.addMenuItem(this.preferences_item);
            this.preferences_item.connect('activate', () => {
                if (dbus_action_group)
                    dbus_action_group.activate_action('preferences', null);
                else
                    imports.misc.extensionUtils.openPrefs();
            });
        }

        update() {
            this.toggle_item.setToggleState(current_window !== null);
        }
    }
);

const PanelIconToggleButton = GObject.registerClass(
    class PanelIconToggleButton extends PanelMenu.Button {
        _init() {
            super._init(null, 'ddterm', true);
            this.accessible_role = Atk.Role.TOGGLE_BUTTON;

            this.add_actor(new St.Icon({
                icon_name: 'utilities-terminal',
                style_class: 'system-status-icon',
            }));
            this.add_style_class_name('panel-status-button');

            this.update();
        }

        update() {
            if (current_window !== null) {
                this.add_style_pseudo_class('active');
                this.add_accessible_state(Atk.StateType.CHECKED);
            } else {
                this.remove_style_pseudo_class('active');
                this.remove_accessible_state(Atk.StateType.CHECKED);
            }
        }

        vfunc_event(event) {
            if (event.type() === Clutter.EventType.BUTTON_PRESS ||
                event.type() === Clutter.EventType.TOUCH_BEGIN)
                toggle();

            return Clutter.EVENT_PROPAGATE;
        }
    }
);

class ExtensionDBusInterface {
    constructor() {
        let [_, xml] = Me.dir.get_child('com.github.amezin.ddterm.Extension.xml').load_contents(null);
        this.dbus = Gio.DBusExportedObject.wrapJSObject(ByteArray.toString(xml), this);
    }

    BeginResizeVertical() {
        geometry_fixup_connections.disconnect();

        if (!current_window || !current_window.maximized_vertically)
            return;

        Main.wm.skipNextEffect(current_window.get_compositor_private());

        // There is a update_window_geometry() call after successful unmaximize.
        // It must set window size to 100%.
        settings.set_double('window-size', 1.0);

        // Changing window-size should unmaximize, but sometimes it doesn't, if
        // window-size is already 1.0. So another unmaximize() is necessary.
        // .unmaximize() emits notify::maximized-vertically even if the window
        // wasn't maximized, so check if it's still maximized first
        if (current_window.maximized_vertically)
            current_window.unmaximize(Meta.MaximizeFlags.VERTICAL);

        // Window still unmaximizes incorrectly without this.
        // Show terminal, maximize, hide, show, start resizing with mouse.
        move_resize_window(current_window, current_workarea);
    }

    BeginResizeHorizontal() {
        geometry_fixup_connections.disconnect();

        if (!current_window || !current_window.maximized_horizontally)
            return;

        Main.wm.skipNextEffect(current_window.get_compositor_private());

        settings.set_double('window-size', 1.0);

        if (current_window.maximized_horizontally)
            current_window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);

        move_resize_window(current_window, current_workarea);
    }

    Toggle() {
        toggle();
    }

    Activate() {
        activate();
    }
}

const DBUS_INTERFACE = new ExtensionDBusInterface();

class WaylandClientStub {
    constructor(subprocess_launcher) {
        this.subprocess_launcher = subprocess_launcher;
    }

    spawnv(_display, argv) {
        return this.subprocess_launcher.spawnv(argv);
    }

    hide_from_window_list(_win) {
    }

    show_in_window_list(_win) {
    }

    owns_window(_win) {
        return true;
    }
}

class ConnectionSet {
    constructor() {
        this.connections = [];
    }

    add(object, handler_id) {
        this.connections.push({ object, handler_id });
    }

    connect(object, signal, callback) {
        this.add(object, object.connect(signal, callback));
    }

    disconnect() {
        while (this.connections.length) {
            const c = this.connections.pop();
            try {
                c.object.disconnect(c.handler_id);
            } catch (ex) {
                logError(ex, `Can't disconnect handler ${c.handler_id} on object ${c.object}`);
            }
        }
    }
}

const extension_connections = new ConnectionSet();
const current_window_connections = new ConnectionSet();
const current_window_maximized_connections = new ConnectionSet();
const animation_overrides_connections = new ConnectionSet();
const hide_when_focus_lost_connections = new ConnectionSet();
const update_size_setting_on_grab_end_connections = new ConnectionSet();
const geometry_fixup_connections = new ConnectionSet();

function init() {
    try {
        tests = Me.imports.extension_tests;
    } catch {
        // Test aren't included in end user (extensions.gnome.org) packages
    }
}

function enable() {
    extension_connections.disconnect();
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

    stop_dbus_watch();
    bus_watch_id = Gio.bus_watch_name(
        Gio.BusType.SESSION,
        APP_ID,
        Gio.BusNameWatcherFlags.NONE,
        dbus_appeared,
        dbus_disappeared
    );

    extension_connections.connect(global.display, 'window-created', handle_window_created);
    extension_connections.connect(global.display, 'workareas-changed', update_workarea_for_window);
    extension_connections.connect(settings, 'changed::window-above', set_window_above);
    extension_connections.connect(settings, 'changed::window-stick', set_window_stick);
    extension_connections.connect(settings, 'changed::window-size', update_target_rect);
    extension_connections.connect(settings, 'changed::window-size', disable_window_maximize_setting);
    extension_connections.connect(settings, 'changed::window-position', update_window_position);
    extension_connections.connect(settings, 'changed::window-skip-taskbar', set_skip_taskbar);
    extension_connections.connect(settings, 'changed::window-maximize', set_window_maximized);
    extension_connections.connect(settings, 'changed::override-window-animation', setup_animation_overrides);
    extension_connections.connect(settings, 'changed::show-animation', update_show_animation);
    extension_connections.connect(settings, 'changed::hide-animation', update_hide_animation);
    extension_connections.connect(settings, 'changed::hide-when-focus-lost', setup_hide_when_focus_lost);
    extension_connections.connect(settings, 'changed::panel-icon-type', setup_panel_icon);

    update_workarea_for_window();
    update_window_position();
    update_show_animation();
    update_hide_animation();
    setup_animation_overrides();
    setup_hide_when_focus_lost();

    setup_update_size_setting_on_grab_end();

    DBUS_INTERFACE.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');

    if (tests)
        tests.enable();

    setup_panel_icon();
}

function disable() {
    remove_panel_icon();

    DBUS_INTERFACE.dbus.unexport();

    if (Main.sessionMode.allowExtensions) {
        // Stop the app only if the extension isn't being disabled because of
        // lock screen/switch to other mode where extensions aren't allowed.
        // Because when the session switches back to normal mode we want to
        // keep all open terminals.
        if (dbus_action_group)
            dbus_action_group.activate_action('quit', null);
        else if (subprocess)
            subprocess.send_signal(SIGINT);
    }

    stop_dbus_watch();
    dbus_action_group = null;

    Main.wm.removeKeybinding('ddterm-toggle-hotkey');
    Main.wm.removeKeybinding('ddterm-activate-hotkey');

    extension_connections.disconnect();
    animation_overrides_connections.disconnect();
    hide_when_focus_lost_connections.disconnect();
    update_size_setting_on_grab_end_connections.disconnect();
    current_window_maximized_connections.disconnect();

    if (tests)
        tests.disable();
}

function setup_panel_icon() {
    const mode = settings.get_string('panel-icon-type');
    if (mode === 'menu-button') {
        if (!(panel_icon instanceof PanelIconPopupMenu)) {
            remove_panel_icon();
            panel_icon = new PanelIconPopupMenu();
            Main.panel.addToStatusArea('ddterm', panel_icon);
        }
    } else if (mode === 'toggle-button') {
        if (!(panel_icon instanceof PanelIconToggleButton)) {
            remove_panel_icon();
            panel_icon = new PanelIconToggleButton();
            Main.panel.addToStatusArea('ddterm', panel_icon);
        }
    } else {
        remove_panel_icon();
    }
}

function remove_panel_icon() {
    if (!panel_icon)
        return;

    panel_icon.destroy();
    panel_icon = null;
}

function spawn_app() {
    if (subprocess)
        return;

    const subprocess_launcher = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.NONE);

    const context = global.create_app_launch_context(0, -1);
    subprocess_launcher.set_environ(context.get_environment());

    let argv = SUBPROCESS_ARGV;

    if (settings.get_boolean('force-x11-gdk-backend')) {
        const prev_gdk_backend = subprocess_launcher.getenv('GDK_BACKEND');

        if (prev_gdk_backend === null)
            argv = argv.concat(['--unset-gdk-backend']);
        else
            argv = argv.concat(['--reset-gdk-backend', prev_gdk_backend]);

        subprocess_launcher.setenv('GDK_BACKEND', 'x11', true);
    }

    if (USE_WAYLAND_CLIENT && subprocess_launcher.getenv('GDK_BACKEND') !== 'x11')
        wayland_client = Meta.WaylandClient.new(subprocess_launcher);
    else
        wayland_client = new WaylandClientStub(subprocess_launcher);

    printerr(`Starting ddterm app: ${JSON.stringify(argv)}`);
    subprocess = wayland_client.spawnv(global.display, argv);
    subprocess.wait_async(null, subprocess_terminated);
}

function subprocess_terminated(source) {
    if (subprocess === source) {
        subprocess = null;
        wayland_client = null;

        if (source.get_if_signaled()) {
            const signum = source.get_term_sig();
            printerr(`ddterm app killed by signal ${signum} (${GLib.strsignal(signum)})`);
        } else {
            printerr(`ddterm app exited with status ${source.get_exit_status()}`);
        }
    }
}

function toggle() {
    if (dbus_action_group)
        dbus_action_group.activate_action('toggle', null);
    else
        spawn_app();
}

function activate() {
    if (current_window)
        Main.activateWindow(current_window);
    else
        toggle();
}

function dbus_appeared(connection, name) {
    dbus_action_group = Gio.DBusActionGroup.get(connection, name, APP_DBUS_PATH);
}

function dbus_disappeared() {
    dbus_action_group = null;
}

function handle_window_created(display, win) {
    const handler_ids = [
        win.connect('notify::gtk-application-id', set_current_window),
        win.connect('notify::gtk-window-object-path', set_current_window),
    ];

    const disconnect = () => {
        handler_ids.forEach(handler => win.disconnect(handler));
    };

    handler_ids.push(win.connect('unmanaging', disconnect));
    handler_ids.push(win.connect('unmanaged', disconnect));

    set_current_window(win);
}

function check_current_window(match = null) {
    if (current_window === null) {
        logError(new Error('current_window should be non-null'));
        return false;
    }

    if (match !== null && current_window !== match) {
        logError(new Error(`current_window should be ${match}, but it is ${current_window}`));
        return false;
    }

    return true;
}

function setup_animation_overrides() {
    animation_overrides_connections.disconnect();

    if (!current_window)
        return;

    // Dialogs have different animation time. Other windows have no default animation.
    // Our custom animation time must match shell's default animation, otherwise
    // completed_map()/completed_destroy() will be called at wrong time.
    if (current_window.window_type !== Meta.WindowType.NORMAL)
        return;

    if (!settings.get_boolean('override-window-animation'))
        return;

    animation_overrides_connections.connect(global.window_manager, 'map', override_map_animation);
    animation_overrides_connections.connect(global.window_manager, 'destroy', override_unmap_animation);
}

function update_show_animation() {
    show_animation = util.enum_from_settings(settings.get_string('show-animation'), Clutter.AnimationMode);
}

function update_hide_animation() {
    hide_animation = util.enum_from_settings(settings.get_string('hide-animation'), Clutter.AnimationMode);
}

function override_map_animation(wm, actor) {
    if (!check_current_window() || actor !== current_window.get_compositor_private())
        return;

    actor.set_pivot_point(animation_pivot_x, animation_pivot_y);
    actor.scale_x = animation_scale_x;
    actor.scale_y = animation_scale_y;

    actor.ease({
        scale_x: 1.0,
        scale_y: 1.0,
        duration: WindowManager.SHOW_WINDOW_ANIMATION_TIME,
        mode: show_animation,
    });
}

function override_unmap_animation(wm, actor) {
    if (!check_current_window() || actor !== current_window.get_compositor_private())
        return;

    actor.set_pivot_point(animation_pivot_x, animation_pivot_y);

    actor.ease({
        scale_x: animation_scale_x,
        scale_y: animation_scale_y,
        duration: WindowManager.DESTROY_WINDOW_ANIMATION_TIME,
        mode: hide_animation,
    });
}

function hide_when_focus_lost() {
    if (!check_current_window() || current_window.is_hidden())
        return;

    const win = global.display.focus_window;
    if (win !== null) {
        if (current_window === win || current_window.is_ancestor_of_transient(win))
            return;
    }

    if (dbus_action_group)
        dbus_action_group.activate_action('hide', null);
}

function setup_hide_when_focus_lost() {
    hide_when_focus_lost_connections.disconnect();

    if (current_window && settings.get_boolean('hide-when-focus-lost'))
        hide_when_focus_lost_connections.connect(global.display, 'notify::focus-window', hide_when_focus_lost);
}

function is_ddterm_window(win) {
    if (!wayland_client) {
        // On X11, shell can be restarted, and the app will keep running.
        // Accept windows from previously launched app instances.
        if (IS_WAYLAND_COMPOSITOR)
            return false;
    } else if (!wayland_client.owns_window(win)) {
        return false;
    }

    return (
        win.gtk_application_id === APP_ID &&
        win.gtk_window_object_path &&
        win.gtk_window_object_path.startsWith(WINDOW_PATH_PREFIX)
    );
}

function set_window_above() {
    if (current_window === null)
        return;

    const should_be_above = settings.get_boolean('window-above');
    // Both make_above() and unmake_above() raise the window, so check is necessary
    if (current_window.above === should_be_above)
        return;

    if (should_be_above)
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

function set_skip_taskbar() {
    if (!current_window || !wayland_client)
        return;

    if (settings.get_boolean('window-skip-taskbar'))
        wayland_client.hide_from_window_list(current_window);
    else
        wayland_client.show_in_window_list(current_window);
}

function update_workarea(monitor_index) {
    if (monitor_index < 0)
        return;

    current_workarea = Main.layoutManager.getWorkAreaForMonitor(monitor_index);
    current_monitor_scale = global.display.get_monitor_scale(monitor_index);

    update_target_rect();
}

function update_workarea_for_window() {
    if (!current_window)
        return;

    update_workarea(current_window.get_monitor());
}

function setup_maximized_handlers() {
    current_window_maximized_connections.disconnect();

    if (!current_window)
        return;

    if (resize_x)
        current_window_maximized_connections.connect(current_window, 'notify::maximized-horizontally', handle_maximized_horizontally);
    else
        current_window_maximized_connections.connect(current_window, 'notify::maximized-vertically', handle_maximized_vertically);
}

function set_current_window(win) {
    if (!is_ddterm_window(win)) {
        release_window(win);
        return;
    }

    if (win === current_window)
        return;

    release_window(current_window);
    current_window = win;

    update_workarea(Main.layoutManager.currentMonitor.index);

    current_window_connections.connect(win, 'unmanaged', release_window);
    current_window_connections.connect(win, 'notify::window-type', setup_animation_overrides);

    setup_maximized_handlers();
    setup_update_size_setting_on_grab_end();
    setup_hide_when_focus_lost();
    setup_animation_overrides();

    move_resize_window(win, current_target_rect);

    // https://github.com/amezin/gnome-shell-extension-ddterm/issues/28
    current_window_connections.connect(win, 'shown', update_window_geometry);
    // Necessary on GNOME <40 (Wayland) + bottom window position
    current_window_connections.connect(win, 'shown', schedule_geometry_fixup);

    Main.activateWindow(win);

    set_window_above();
    set_window_stick();
    set_skip_taskbar();
    set_window_maximized();

    if (panel_icon)
        panel_icon.update();
}

function update_window_position() {
    const position = settings.get_string('window-position');

    resize_x = position === 'left' || position === 'right';
    right_or_bottom = position === 'right' || position === 'bottom';

    const resizing_direction_pivot = right_or_bottom ? 1.0 : 0.0;
    animation_pivot_x = resize_x ? resizing_direction_pivot : 0.5;
    animation_pivot_y = !resize_x ? resizing_direction_pivot : 0.5;

    animation_scale_x = resize_x ? 0.0 : 1.0;
    animation_scale_y = resize_x ? 1.0 : 0.0;

    setup_maximized_handlers();
    update_target_rect();
}

function target_rect_for_workarea_size(workarea, monitor_scale, size) {
    const target_rect = workarea.copy();

    if (resize_x) {
        target_rect.width *= size;
        target_rect.width -= target_rect.width % monitor_scale;

        if (right_or_bottom)
            target_rect.x += workarea.width - target_rect.width;
    } else {
        target_rect.height *= size;
        target_rect.height -= target_rect.height % monitor_scale;

        if (right_or_bottom)
            target_rect.y += workarea.height - target_rect.height;
    }

    return target_rect;
}

function update_target_rect() {
    if (!current_workarea)
        return;

    current_target_rect = target_rect_for_workarea_size(
        current_workarea,
        current_monitor_scale,
        settings.get_double('window-size')
    );

    update_window_geometry();
}

function schedule_geometry_fixup(win) {
    if (!check_current_window(win) || win.get_client_type() !== Meta.WindowClientType.WAYLAND)
        return;

    geometry_fixup_connections.disconnect();
    geometry_fixup_connections.connect(win, 'position-changed', update_window_geometry);
    geometry_fixup_connections.connect(win, 'size-changed', update_window_geometry);
}

function unmaximize_done() {
    settings.set_boolean('window-maximize', false);
    update_window_geometry();
    schedule_geometry_fixup(current_window);

    // https://github.com/amezin/gnome-shell-extension-ddterm/issues/48
    if (settings.get_boolean('window-above')) {
        // Without unmake_above(), make_above() won't actually take effect (?!)
        current_window.unmake_above();
        set_window_above();
    }
}

function handle_maximized_vertically(win) {
    geometry_fixup_connections.disconnect();

    if (!check_current_window(win))
        return;

    if (!win.maximized_vertically) {
        unmaximize_done();
        return;
    }

    if (!settings.get_boolean('window-maximize')) {
        if (current_target_rect.height < current_workarea.height)
            win.unmaximize(Meta.MaximizeFlags.VERTICAL);
    }
}

function handle_maximized_horizontally(win) {
    geometry_fixup_connections.disconnect();

    if (!check_current_window(win))
        return;

    if (!win.maximized_horizontally) {
        unmaximize_done();
        return;
    }

    if (!settings.get_boolean('window-maximize')) {
        if (current_target_rect.width < current_workarea.width)
            win.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
    }
}

function move_resize_window(win, target_rect) {
    win.move_resize_frame(false, target_rect.x, target_rect.y, target_rect.width, target_rect.height);
}

function set_window_maximized() {
    if (!current_window)
        return;

    const is_maximized = resize_x ? current_window.maximized_horizontally : current_window.maximized_vertically;
    const should_maximize = settings.get_boolean('window-maximize');
    if (is_maximized === should_maximize)
        return;

    if (should_maximize) {
        current_window.maximize(Meta.MaximizeFlags.BOTH);
        return;
    }

    if (resize_x) {
        if (current_target_rect.width < current_workarea.width)
            current_window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
    } else {
        // eslint-disable-next-line no-lonely-if
        if (current_target_rect.height < current_workarea.height)
            current_window.unmaximize(Meta.MaximizeFlags.VERTICAL);
    }
}

function disable_window_maximize_setting() {
    // maximize state is always off after a height change
    settings.set_boolean('window-maximize', false);
}

function update_window_geometry() {
    geometry_fixup_connections.disconnect();

    if (!current_window)
        return;

    if (settings.get_boolean('window-maximize'))
        return;

    if (current_target_rect.equal(current_window.get_frame_rect()))
        return;

    if (current_window.maximized_horizontally && resize_x) {
        if (current_target_rect.width < current_workarea.width) {
            Main.wm.skipNextEffect(current_window.get_compositor_private());
            current_window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
        }
    } else if (current_window.maximized_vertically && !resize_x) {
        if (current_target_rect.height < current_workarea.height) {
            Main.wm.skipNextEffect(current_window.get_compositor_private());
            current_window.unmaximize(Meta.MaximizeFlags.VERTICAL);
        }
    } else {
        move_resize_window(current_window, current_target_rect);
    }
}

function update_size_setting_on_grab_end(display, p0, p1) {
    // On Mutter <=3.38 p0 is display too. On 40 p0 is the window.
    const win = p0 instanceof Meta.Window ? p0 : p1;

    if (win !== current_window)
        return;

    if (!resize_x && current_window.maximized_vertically)
        return;

    if (resize_x && current_window.maximized_horizontally)
        return;

    const frame_rect = win.get_frame_rect();
    const size = resize_x ? frame_rect.width / current_workarea.width : frame_rect.height / current_workarea.height;
    settings.set_double('window-size', Math.min(1.0, size));
}

function setup_update_size_setting_on_grab_end() {
    update_size_setting_on_grab_end_connections.disconnect();

    if (current_window)
        update_size_setting_on_grab_end_connections.connect(global.display, 'grab-op-end', update_size_setting_on_grab_end);
}

function release_window(win) {
    if (!win || win !== current_window)
        return;

    current_window_connections.disconnect();
    current_window_maximized_connections.disconnect();
    geometry_fixup_connections.disconnect();
    current_window = null;

    update_size_setting_on_grab_end_connections.disconnect();
    hide_when_focus_lost_connections.disconnect();
    animation_overrides_connections.disconnect();

    if (panel_icon)
        panel_icon.update();
}

function stop_dbus_watch() {
    if (bus_watch_id) {
        Gio.bus_unwatch_name(bus_watch_id);
        bus_watch_id = null;
    }
}
