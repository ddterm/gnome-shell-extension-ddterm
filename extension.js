'use strict';

/* exported init enable disable settings current_window DBUS_INTERFACE target_rect_for_workarea_size toggle */

const { GLib, Gio, Clutter, Meta, Shell } = imports.gi;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const WindowManager = imports.ui.windowManager;
const { util } = Me.imports;

var settings = null;

var current_window = null;
var current_workarea = null;
var current_monitor_scale = 1;

let bus_watch_id = null;
let dbus_action_group = null;

let wayland_client = null;
let subprocess = null;

let show_animation = Clutter.AnimationMode.LINEAR;
let hide_animation = Clutter.AnimationMode.LINEAR;

const APP_ID = 'com.github.amezin.ddterm';
const APP_DBUS_PATH = '/com/github/amezin/ddterm';
const WINDOW_PATH_PREFIX = `${APP_DBUS_PATH}/window/`;
const SUBPROCESS_ARGV = [Me.dir.get_child('com.github.amezin.ddterm').get_path(), '--undecorated'];
const IS_WAYLAND_COMPOSITOR = Meta.is_wayland_compositor();
const USE_WAYLAND_CLIENT = Meta.WaylandClient && IS_WAYLAND_COMPOSITOR;
const SIGINT = 2;

class ExtensionDBusInterface {
    constructor() {
        let [_, xml] = Me.dir.get_child('com.github.amezin.ddterm.Extension.xml').load_contents(null);
        this.dbus = Gio.DBusExportedObject.wrapJSObject(ByteArray.toString(xml), this);
    }

    BeginResize() {
        unmaximize_fixup_connections.disconnect();

        if (!current_window || !current_window.maximized_vertically)
            return;

        Main.wm.skipNextEffect(current_window.get_compositor_private());

        // There is a update_window_geometry() call after successful unmaximize.
        // It must set window size to 100%.
        settings.set_double('window-height', 1.0);

        // Changing window-height should unmaximize, but sometimes it doesn't
        // if window-height is already 1.0. So another unmaximize() is
        // necessary. .unmaximize() emits notify::maximized-vertically even
        // if the window wasn't maximized, so check if it's still maximized
        // first
        if (current_window.maximized_vertically)
            current_window.unmaximize(Meta.MaximizeFlags.VERTICAL);

        // Window still unmaximizes incorrectly without this.
        // Show terminal, maximize, hide, show, start resizing with mouse.
        // TODO: add a test that simulates mouse resizing using xdotool
        move_resize_window(current_window, current_workarea);
    }

    Toggle() {
        toggle();
    }

    Activate() {
        activate();
    }

    RunTestAsync(params, invocation) {
        Me.imports.extension_tests.run_tests(...params).then(_ => {
            invocation.return_value(null);
        }).catch(e => {
            if (e instanceof GLib.Error) {
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
        });
    }
}

var DBUS_INTERFACE = new ExtensionDBusInterface();

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
const animation_overrides_connections = new ConnectionSet();
const hide_when_focus_lost_connections = new ConnectionSet();
const update_height_setting_on_grab_end_connections = new ConnectionSet();
const unmaximize_fixup_connections = new ConnectionSet();

function init() {
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
    extension_connections.connect(global.display, 'workareas-changed', update_window_geometry);
    extension_connections.connect(settings, 'changed::window-above', set_window_above);
    extension_connections.connect(settings, 'changed::window-stick', set_window_stick);
    extension_connections.connect(settings, 'changed::window-height', disable_window_maximize_setting);
    extension_connections.connect(settings, 'changed::window-height', update_window_geometry);
    extension_connections.connect(settings, 'changed::window-skip-taskbar', set_skip_taskbar);
    extension_connections.connect(settings, 'changed::window-maximize', set_window_maximized);
    extension_connections.connect(settings, 'changed::override-window-animation', setup_animation_overrides);
    extension_connections.connect(settings, 'changed::show-animation', update_show_animation);
    extension_connections.connect(settings, 'changed::hide-animation', update_hide_animation);
    extension_connections.connect(settings, 'changed::hide-when-focus-lost', setup_hide_when_focus_lost);

    update_workarea_for_window();
    update_show_animation();
    update_hide_animation();
    setup_animation_overrides();
    setup_hide_when_focus_lost();

    setup_update_height_setting_on_grab_end();

    DBUS_INTERFACE.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');
}

function disable() {
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
    update_height_setting_on_grab_end_connections.disconnect();
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

    subprocess = wayland_client.spawnv(global.display, argv);
    subprocess.wait_async(null, subprocess_terminated);
}

function subprocess_terminated(source) {
    if (subprocess === source) {
        subprocess = null;
        wayland_client = null;
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

    actor.set_pivot_point(0.5, 0.0);
    actor.scale_x = 1.0;  // override default scale-x animation
    actor.scale_y = 0.0;

    actor.ease({
        scale_y: 1.0,
        duration: WindowManager.SHOW_WINDOW_ANIMATION_TIME,
        mode: show_animation,
    });
}

function override_unmap_animation(wm, actor) {
    if (!check_current_window() || actor !== current_window.get_compositor_private())
        return;

    actor.set_pivot_point(0.5, 0.0);

    actor.ease({
        scale_x: 1.0,  // override default scale-x animation
        scale_y: 0.0,
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
}

function update_workarea_for_window() {
    if (!current_window)
        return;

    update_workarea(current_window.get_monitor());
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
    current_window_connections.connect(win, 'notify::maximized-vertically', handle_maximized_vertically);
    current_window_connections.connect(win, 'notify::window-type', setup_animation_overrides);

    setup_update_height_setting_on_grab_end();
    setup_hide_when_focus_lost();
    setup_animation_overrides();

    const target_rect = target_rect_for_workarea();
    move_resize_window(win, target_rect);

    // https://github.com/amezin/gnome-shell-extension-ddterm/issues/28
    current_window_connections.connect(win, 'shown', update_window_geometry);

    Main.activateWindow(win);

    set_window_above();
    set_window_stick();
    set_skip_taskbar();
    set_window_maximized();
}

function target_rect_for_workarea_size(workarea, monitor_scale, size) {
    const target_rect = workarea.copy();
    target_rect.height *= size;
    target_rect.height -= target_rect.height % monitor_scale;

    return target_rect;
}

function target_rect_for_workarea() {
    return target_rect_for_workarea_size(current_workarea, current_monitor_scale, settings.get_double('window-height'));
}

function handle_maximized_vertically(win) {
    unmaximize_fixup_connections.disconnect();

    if (!check_current_window(win))
        return;

    if (!win.maximized_vertically) {
        settings.set_boolean('window-maximize', false);
        update_window_geometry();

        unmaximize_fixup_connections.connect(win, 'position-changed', update_window_geometry);
        unmaximize_fixup_connections.connect(win, 'size-changed', update_window_geometry);

        return;
    }

    if (!settings.get_boolean('window-maximize'))
        unmaximize_window_if_not_full_height(win);
}

function unmaximize_window_if_not_full_height(win) {
    const target_rect = target_rect_for_workarea();

    if (target_rect.height < current_workarea.height)
        win.unmaximize(Meta.MaximizeFlags.VERTICAL);
}

function move_resize_window(win, target_rect) {
    win.move_resize_frame(false, target_rect.x, target_rect.y, target_rect.width, target_rect.height);
}

function set_window_maximized() {
    if (!current_window)
        return;

    const should_maximize = settings.get_boolean('window-maximize');
    if (current_window.maximized_vertically === should_maximize)
        return;

    if (should_maximize)
        current_window.maximize(Meta.MaximizeFlags.BOTH);
    else
        unmaximize_window_if_not_full_height(current_window);
}

function disable_window_maximize_setting() {
    // maximize state is always off after a height change
    settings.set_boolean('window-maximize', false);
}

function update_window_geometry() {
    unmaximize_fixup_connections.disconnect();

    if (!current_window)
        return;

    if (settings.get_boolean('window-maximize'))
        return;

    const target_rect = target_rect_for_workarea();
    if (target_rect.equal(current_window.get_frame_rect()))
        return;

    if (current_window.maximized_vertically) {
        if (target_rect.height < current_workarea.height) {
            Main.wm.skipNextEffect(current_window.get_compositor_private());
            current_window.unmaximize(Meta.MaximizeFlags.VERTICAL);
        }
    } else {
        move_resize_window(current_window, target_rect);
    }
}

function update_height_setting_on_grab_end(display, p0, p1) {
    // On Mutter <=3.38 p0 is display too. On 40 p0 is the window.
    const win = p0 instanceof Meta.Window ? p0 : p1;

    if (win !== current_window || win.maximized_vertically)
        return;

    const current_height = win.get_frame_rect().height / current_workarea.height;
    settings.set_double('window-height', Math.min(1.0, current_height));
}

function setup_update_height_setting_on_grab_end() {
    update_height_setting_on_grab_end_connections.disconnect();

    if (current_window)
        update_height_setting_on_grab_end_connections.connect(global.display, 'grab-op-end', update_height_setting_on_grab_end);
}

function release_window(win) {
    if (!win || win !== current_window)
        return;

    current_window_connections.disconnect();
    unmaximize_fixup_connections.disconnect();
    current_window = null;

    update_height_setting_on_grab_end_connections.disconnect();
    hide_when_focus_lost_connections.disconnect();
    animation_overrides_connections.disconnect();
}

function stop_dbus_watch() {
    if (bus_watch_id) {
        Gio.bus_unwatch_name(bus_watch_id);
        bus_watch_id = null;
    }
}
