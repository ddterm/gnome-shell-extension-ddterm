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

/* exported enable disable message debug info warning critical */

const { GLib, Gio, Meta } = imports.gi;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;
const JsUnit = imports.jsUnit;
const Config = imports.misc.config;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Extension = Me.imports.extension;
const { ConnectionSet } = Me.imports.connectionset;

const WindowMaximizeMode = {
    NOT_MAXIMIZED: 'not-maximized',
    EARLY: 'maximize-early',
    LATE: 'maximize-late',
};

let settings = null;
const window_trace = new ConnectionSet();

const DEFAULT_IDLE_TIMEOUT_MS = 200;
const WAIT_TIMEOUT_MS = 2000;
const START_TIMEOUT_MS = 10000;

const LOG_DOMAIN = 'ddterm-test';

function _makeLogFunction(level) {
    return message => {
        let stack = new Error().stack;
        let caller = stack.split('\n')[1];

        let [code, line] = caller.split(':');
        let [func, file] = code.split(/\W*@/);

        GLib.log_structured(LOG_DOMAIN, level, {
            'MESSAGE': `[${func}:${line}] ${message}`,
            'SYSLOG_IDENTIFIER': 'ddterm.ExtensionTest',
            'CODE_FILE': file,
            'CODE_FUNC': func,
            'CODE_LINE': line,
        });
    };
}

const message = _makeLogFunction(GLib.LogLevelFlags.LEVEL_MESSAGE);
const debug = _makeLogFunction(GLib.LogLevelFlags.LEVEL_DEBUG);
const info = _makeLogFunction(GLib.LogLevelFlags.LEVEL_INFO);
const warning = _makeLogFunction(GLib.LogLevelFlags.LEVEL_WARNING);
const critical = _makeLogFunction(GLib.LogLevelFlags.LEVEL_CRITICAL);

function invoke_async(f, params, invocation) {
    f(...params).then(_ => {
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

async function invoke_test(f, ...params) {
    const handlers = new ConnectionSet();
    handlers.connect(Extension.window_manager, 'notify::current-window', setup_window_trace);
    handlers.connect(Extension.window_manager, 'move-resize-requested', (_, rect) => {
        info(`Extension requested move-resize to { .x = ${rect.x}, .y = ${rect.y}, .width = ${rect.width}, .height = ${rect.height} }`);
    });
    try {
        await f(...params);
    } finally {
        handlers.disconnect();
    }
}

function invoke_test_async(f, params, invocation) {
    invoke_async(invoke_test.bind(null, f), params, invocation);
}

async function setup() {
    if (global.settings.settings_schema.has_key('welcome-dialog-last-shown-version'))
        global.settings.set_string('welcome-dialog-last-shown-version', '99.0');

    if (Main.layoutManager._startingUp) {
        message('Waiting for startup to complete');
        await async_wait_signal(
            Main.layoutManager,
            'startup-complete',
            () => !Main.layoutManager._startingUp,
            START_TIMEOUT_MS
        );
        message('Startup complete');
    }

    Main.messageTray.bannerBlocked = true;

    if (Main.welcomeDialog) {
        const ModalDialog = imports.ui.modalDialog;
        if (Main.welcomeDialog.state !== ModalDialog.State.CLOSED) {
            message('Closing welcome dialog');
            const wait_close = async_wait_signal(
                Main.welcomeDialog,
                'closed',
                () => Main.welcomeDialog.state === ModalDialog.State.CLOSED
            );
            Main.welcomeDialog.close();
            await wait_close;
            message('Welcome dialog closed');
        }
    }

    if (Main.overview.visible) {
        message('Hiding overview');
        const wait_hide = async_wait_signal(
            Main.overview,
            'hidden',
            () => !Main.overview.visible
        );
        Main.overview.hide();
        await wait_hide;
        message('Overview hidden');
    }

    const wait = wait_first_frame(START_TIMEOUT_MS);
    Extension.toggle();
    await wait;
}

function setup_window_trace() {
    const win = Extension.window_manager.current_window;

    info(`current window changed: ${win}`);

    window_trace.disconnect();

    if (!win)
        return;

    window_trace.connect(win, 'position-changed', () => {
        const rect = win.get_frame_rect();
        info(`position-changed: { .x = ${rect.x}, .y = ${rect.y}, .width = ${rect.width}, .height = ${rect.height} }`);
    });

    window_trace.connect(win, 'size-changed', () => {
        const rect = win.get_frame_rect();
        info(`size-changed: { .x = ${rect.x}, .y = ${rect.y}, .width = ${rect.width}, .height = ${rect.height} }`);
    });

    window_trace.connect(win, 'notify::maximized-vertically', () => {
        info(`notify::maximized-vertically = ${win.maximized_vertically}`);
    });

    window_trace.connect(win, 'notify::maximized-horizontally', () => {
        info(`notify::maximized-horizontally = ${win.maximized_horizontally}`);
    });
}

function async_sleep(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_LOW, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

function with_timeout(promise, timeout_ms = WAIT_TIMEOUT_MS) {
    const timeout = new Error('Timed out');
    return Promise.race([
        promise,
        new Promise((resolve, reject) => async_sleep(timeout_ms).then(() => {
            reject(timeout);
        })),
    ]);
}

function idle() {
    return new Promise(resolve => {
        GLib.idle_add(GLib.PRIORITY_LOW, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

function hide_window_async_wait() {
    return new Promise(resolve => {
        const win = Extension.window_manager.current_window;
        if (!win) {
            resolve();
            return;
        }

        async_wait_signal(win, 'unmanaged').then(() => {
            message('Window hidden');
            idle().then(resolve);
        });

        message('Hiding the window');
        Extension.toggle();
    });
}

function wait_first_frame(timeout_ms = WAIT_TIMEOUT_MS) {
    return with_timeout(new Promise(resolve => {
        const windows = [];
        const connections = new ConnectionSet();

        const check = () => {
            if (windows.includes(Extension.window_manager.current_window)) {
                message('Got first-frame');
                connections.disconnect();
                idle().then(resolve);
            }
        };

        JsUnit.assertNull(Extension.window_manager.current_window);
        connections.connect(Extension.window_manager, 'notify::current-window', check);
        connections.connect(global.display, 'window-created', (_, win) => {
            connections.connect(win.get_compositor_private(), 'first-frame', actor => {
                windows.push(actor.meta_window);
                check();
            });
        });
    }), timeout_ms);
}

function wait_window_settle(idle_timeout_ms = DEFAULT_IDLE_TIMEOUT_MS) {
    return with_timeout(new Promise(resolve => {
        const win = Extension.window_manager.current_window;
        let timer_id = null;
        const handlers = new ConnectionSet();

        message('Waiting for the window to stop generating events');

        const ready = () => {
            handlers.disconnect();
            resolve();
            message('Idle timeout elapsed');
            return GLib.SOURCE_REMOVE;
        };

        const restart_timer = () => {
            if (timer_id !== null)
                GLib.source_remove(timer_id);

            timer_id = GLib.timeout_add(GLib.PRIORITY_LOW, idle_timeout_ms, ready);
        };

        handlers.connect(win, 'position-changed', () => {
            message('Restarting wait because of position-changed signal');
            restart_timer();
        });
        handlers.connect(win, 'size-changed', () => {
            message('Restarting wait because of size-changed signal');
            restart_timer();
        });
        handlers.connect(win, 'notify::maximized-vertically', () => {
            message('Restarting wait because of notify::maximized-vertically signal');
            restart_timer();
        });
        handlers.connect(win, 'notify::maximized-horizontally', () => {
            message('Restarting wait because of notify::maximized-horizontally signal');
            restart_timer();
        });
        handlers.connect(Extension.window_manager, 'move-resize-requested', () => {
            message('Restarting wait because of move-resize-requested signal');
            restart_timer();
        });

        restart_timer();
    }));
}

function async_wait_signal(object, signal, predicate = null, timeout_ms = WAIT_TIMEOUT_MS) {
    return with_timeout(new Promise(resolve => {
        const pred_check = () => {
            if (!predicate())
                return;

            object.disconnect(handler_id);
            GLib.idle_add(GLib.PRIORITY_LOW, () => {
                resolve();
                return GLib.SOURCE_REMOVE;
            });
        };

        const handler_id = object.connect(signal, pred_check);
        if (predicate)
            pred_check();
        else
            predicate = () => true;
    }), timeout_ms);
}

function async_run_process(argv) {
    return with_timeout(new Promise(resolve => {
        info(`Starting subprocess ${JSON.stringify(argv)}`);
        const subprocess = Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
        subprocess.wait_check_async(null, (source, result) => {
            info(`Finished subprocess ${JSON.stringify(argv)}`);
            resolve(source.wait_check_finish(result));
        });
    }));
}

function set_settings_double(name, value) {
    info(`Setting ${name}=${value}`);
    return settings.set_double(name, value);
}

function set_settings_boolean(name, value) {
    info(`Setting ${name}=${value}`);
    return settings.set_boolean(name, value);
}

function set_settings_string(name, value) {
    info(`Setting ${name}=${value}`);
    return settings.set_string(name, value);
}

function assert_rect_equals(expected, actual) {
    message(`Checking if rect { .x=${actual.x}, .y=${actual.y}, .width=${actual.width}, .height=${actual.height} } matches expected { .x=${expected.x}, .y=${expected.y}, .width=${expected.width}, .height=${expected.height} }`);
    JsUnit.assertEquals(expected.x, actual.x);
    JsUnit.assertEquals(expected.y, actual.y);
    JsUnit.assertEquals(expected.width, actual.width);
    JsUnit.assertEquals(expected.height, actual.height);
}

function compute_target_rect(window_size, window_pos, monitor_index) {
    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitor_index);
    const monitor_scale = global.display.get_monitor_scale(monitor_index);
    const target_rect = workarea.copy();

    if (['top', 'bottom'].includes(window_pos)) {
        target_rect.height *= window_size;
        target_rect.height -= target_rect.height % monitor_scale;

        if (window_pos === 'bottom')
            target_rect.y += workarea.height - target_rect.height;
    } else {
        target_rect.width *= window_size;
        target_rect.width -= target_rect.width % monitor_scale;

        if (window_pos === 'right')
            target_rect.x += workarea.width - target_rect.width;
    }

    return target_rect;
}

function verify_window_geometry(window_size, window_maximize, window_pos, monitor_index) {
    message(`Verifying window geometry (expected size=${window_size}, maximized=${window_maximize}, position=${window_pos})`);
    const win = Extension.window_manager.current_window;

    const maximize_prop = ['top', 'bottom'].includes(window_pos) ? 'maximized-vertically' : 'maximized-horizontally';
    JsUnit.assertEquals(window_maximize, win[maximize_prop]);
    JsUnit.assertEquals(window_maximize, settings.get_boolean('window-maximize'));

    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitor_index);
    const monitor_scale = global.display.get_monitor_scale(monitor_index);
    const target_rect_unmaximized = compute_target_rect(window_size, window_pos, monitor_index);

    JsUnit.assertEquals(0, target_rect_unmaximized.width % monitor_scale);
    JsUnit.assertEquals(0, target_rect_unmaximized.height % monitor_scale);
    JsUnit.assertEquals(0, target_rect_unmaximized.x % monitor_scale);
    JsUnit.assertEquals(0, target_rect_unmaximized.y % monitor_scale);

    assert_rect_equals(target_rect_unmaximized, Extension.window_manager.target_rect_for_workarea_size(workarea, monitor_scale, window_size));
    assert_rect_equals(target_rect_unmaximized, Extension.window_manager.current_target_rect);

    const target_rect = window_maximize ? workarea : target_rect_unmaximized;
    assert_rect_equals(target_rect, win.get_frame_rect());

    message('Window geometry is fine');
}

function window_monitor_index(window_monitor) {
    if (window_monitor === 'current')
        return global.display.get_current_monitor();

    return Main.layoutManager.primaryIndex;
}

async function xte_mouse_move(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);

    let [c_x, c_y, _] = global.get_pointer();
    if (c_x === x && c_y === y)
        return;

    message(`Moving mouse from (${c_x}, ${c_y}) to (${x}, ${y})`);
    await async_run_process(['xte', `mousemove ${x} ${y}`]);

    while (c_x !== x || c_y !== y) {
        // eslint-disable-next-line no-await-in-loop
        await async_sleep(10);
        [c_x, c_y, _] = global.get_pointer();
    }

    message(`Mouse is at (${c_x}, ${c_y})`);
}

let xte_mouse_button_last = false;

async function xte_mouse_button(button) {
    const mods_getter_broken = Config.PACKAGE_VERSION.startsWith('3.38');
    if (!mods_getter_broken) {
        const [unused_x, unused_y, c_mods] = global.get_pointer();
        xte_mouse_button_last = c_mods !== 0;
    }

    if (xte_mouse_button_last === button)
        return;

    message(button ? 'Pressing mouse button 1' : 'Releasing mouse button 1');

    await async_run_process(['xte', button ? 'mousedown 1' : 'mouseup 1']);

    if (mods_getter_broken) {
        await async_sleep(100);
        xte_mouse_button_last = button;
    } else {
        while (xte_mouse_button_last !== button) {
            // eslint-disable-next-line no-await-in-loop
            await async_sleep(10);
            const [unused_x, unused_y, c_mods] = global.get_pointer();
            xte_mouse_button_last = c_mods !== 0;
        }
    }

    message(`Mouse button pressed = ${xte_mouse_button_last}`);
}

function wait_move_resize_start(window_size, window_maximize, window_pos, monitor_index) {
    const win = Extension.window_manager.current_window;

    const maximize_prop = ['top', 'bottom'].includes(window_pos) ? 'maximized-vertically' : 'maximized-horizontally';
    let wait = [
        async_wait_signal(win, `notify::${maximize_prop}`, () => win[maximize_prop] === window_maximize),
    ];

    const target_rect = window_maximize
        ? Main.layoutManager.getWorkAreaForMonitor(monitor_index)
        : compute_target_rect(window_size, window_pos, monitor_index);
    const current_rect = win.get_frame_rect();

    if (current_rect.x !== target_rect.x || current_rect.y !== target_rect.y) {
        message('Waiting for position-changed');
        wait.push(async_wait_signal(win, 'position-changed'));
    }

    if (current_rect.width !== target_rect.width || current_rect.height !== target_rect.height) {
        message('Waiting for size-changed');
        wait.push(async_wait_signal(win, 'size-changed'));
    }

    return Promise.all(wait);
}

async function test_show(window_size, window_maximize, window_pos, current_monitor, window_monitor) {
    message(`Starting test with window size=${window_size}, maximize=${window_maximize}, position=${window_pos}`);

    await hide_window_async_wait();

    const monitor_rect = Main.layoutManager.monitors[current_monitor];
    await xte_mouse_move(
        monitor_rect.x + Math.floor(monitor_rect.width / 2),
        monitor_rect.y + Math.floor(monitor_rect.height / 2)
    );

    // 'current' monitor doesn't seem to be updated in nested mode
    if (current_monitor !== global.display.get_current_monitor())
        Meta.MonitorManager.get().emit('monitors-changed-internal');

    JsUnit.assertEquals(current_monitor, global.display.get_current_monitor());

    set_settings_double('window-size', window_size);
    set_settings_boolean('window-maximize', window_maximize === WindowMaximizeMode.EARLY);
    set_settings_string('window-position', window_pos);
    set_settings_string('window-monitor', window_monitor);

    const wait = wait_first_frame();

    Extension.toggle();

    await wait;
    await wait_window_settle();

    const monitor_index = window_monitor_index(window_monitor);
    const should_maximize = window_maximize === WindowMaximizeMode.EARLY || (window_size === 1.0 && settings.get_boolean('window-maximize'));
    verify_window_geometry(window_size, should_maximize, window_pos, monitor_index);

    if (window_maximize === WindowMaximizeMode.LATE) {
        const geometry_wait = wait_move_resize_start(window_size, true, window_pos, monitor_index);

        set_settings_boolean('window-maximize', true);

        await geometry_wait;
        await wait_window_settle();

        verify_window_geometry(window_size, true, window_pos, monitor_index);
    }
}

async function test_unmaximize(window_size, window_maximize, window_pos, current_monitor, window_monitor) {
    await test_show(window_size, window_maximize, window_pos, current_monitor, window_monitor);

    const monitor_index = window_monitor_index(window_monitor);
    const geometry_wait = wait_move_resize_start(window_size, false, window_pos, monitor_index);

    set_settings_boolean('window-maximize', false);

    await geometry_wait;
    await wait_window_settle();

    verify_window_geometry(window_size, false, window_pos, monitor_index);
}

async function test_unmaximize_correct_size(window_size, window_size2, window_pos, current_monitor, window_monitor) {
    await test_show(window_size, WindowMaximizeMode.NOT_MAXIMIZED, window_pos, current_monitor, window_monitor);

    const monitor_index = window_monitor_index(window_monitor);
    const initially_maximized = settings.get_boolean('window-maximize');
    const geometry_wait1 = wait_move_resize_start(window_size2, window_size === 1.0 && window_size2 === 1.0 && initially_maximized, window_pos, monitor_index);

    set_settings_double('window-size', window_size2);

    await geometry_wait1;
    await wait_window_settle();

    verify_window_geometry(window_size2, window_size === 1.0 && window_size2 === 1.0 && initially_maximized, window_pos, monitor_index);

    const geometry_wait2 = wait_move_resize_start(window_size2, true, window_pos, monitor_index);

    set_settings_boolean('window-maximize', true);

    await geometry_wait2;
    await wait_window_settle();

    verify_window_geometry(window_size2, true, window_pos, monitor_index);

    const geometry_wait3 = wait_move_resize_start(window_size2, false, window_pos, monitor_index);

    set_settings_boolean('window-maximize', false);

    await geometry_wait3;
    await wait_window_settle();

    verify_window_geometry(window_size2, false, window_pos, monitor_index);
}

async function test_unmaximize_on_size_change(window_size, window_size2, window_pos, current_monitor, window_monitor) {
    await test_show(window_size, WindowMaximizeMode.EARLY, window_pos, current_monitor, window_monitor);

    const monitor_index = window_monitor_index(window_monitor);
    const geometry_wait = wait_move_resize_start(window_size2, window_size2 === 1.0, window_pos, monitor_index);

    set_settings_double('window-size', window_size2);

    await geometry_wait;
    await wait_window_settle();

    verify_window_geometry(window_size2, window_size2 === 1.0, window_pos, monitor_index);
}

function resize_point(frame_rect, window_pos, monitor_scale) {
    let x = frame_rect.x, y = frame_rect.y;
    const edge_offset = 3 * monitor_scale;

    if (window_pos === 'left' || window_pos === 'right') {
        y += Math.floor(frame_rect.height / 2);

        if (window_pos === 'left')
            x += frame_rect.width - edge_offset;
        else
            x += edge_offset;
    } else {
        x += Math.floor(frame_rect.width / 2);

        if (window_pos === 'top')
            y += frame_rect.height - edge_offset;
        else
            y += edge_offset;
    }

    return { x, y };
}

async function test_resize_xte(window_size, window_maximize, window_size2, window_pos, current_monitor, window_monitor) {
    await test_show(window_size, window_maximize, window_pos, current_monitor, window_monitor);

    const win = Extension.window_manager.current_window;
    const actor = win.get_compositor_private();
    await async_wait_signal(actor, 'transitions-completed', () => {
        return !(actor.get_transition('scale-x') || actor.get_transition('scale-y'));
    });
    await wait_window_settle();

    const monitor_index = window_monitor_index(window_monitor);
    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitor_index);
    const monitor_scale = global.display.get_monitor_scale(monitor_index);

    const initial_frame_rect = Extension.window_manager.current_window.get_frame_rect();
    const initial = resize_point(initial_frame_rect, window_pos, monitor_scale);

    await xte_mouse_move(initial.x, initial.y);

    const target_frame_rect = Extension.window_manager.target_rect_for_workarea_size(workarea, monitor_scale, window_size2);
    const target = resize_point(target_frame_rect, window_pos, monitor_scale);

    const geometry_wait1 = wait_move_resize_start(window_maximize !== WindowMaximizeMode.NOT_MAXIMIZED ? 1.0 : window_size, false, window_pos, monitor_index);
    let geometry_wait2 = null;

    await xte_mouse_button(true);

    try {
        await geometry_wait1;
        await wait_window_settle();

        verify_window_geometry(window_maximize !== WindowMaximizeMode.NOT_MAXIMIZED ? 1.0 : window_size, false, window_pos, monitor_index);

        geometry_wait2 = wait_move_resize_start(window_size2, false, window_pos, monitor_index);

        await xte_mouse_move(target.x, target.y);
        await wait_window_settle();
    } finally {
        await xte_mouse_button(false);
    }

    await geometry_wait2;
    await wait_window_settle();

    // TODO: 'grab-op-end' isn't emitted on Wayland when simulting mouse with xte.
    // For now, just call update_size_setting_on_grab_end()
    if (Meta.is_wayland_compositor())
        Extension.window_manager.update_size_setting_on_grab_end(global.display, Extension.window_manager.current_window);

    verify_window_geometry(window_size2, false, window_pos, monitor_index);
}

async function test_change_position(window_size, window_pos, window_pos2, current_monitor, window_monitor) {
    await test_show(window_size, false, window_pos, current_monitor, window_monitor);
    const initially_maximized = settings.get_boolean('window-maximize');

    const monitor_index = window_monitor_index(window_monitor);
    const geometry_wait = wait_move_resize_start(window_size, window_size === 1.0 && initially_maximized, window_pos2, monitor_index);

    set_settings_string('window-position', window_pos2);

    await geometry_wait;
    await wait_window_settle();

    verify_window_geometry(window_size, window_size === 1.0 && initially_maximized, window_pos2, monitor_index);
}

class ExtensionTestDBusInterface {
    constructor() {
        let [_, xml] = Me.dir.get_child('test').get_child('com.github.amezin.ddterm.ExtensionTest.xml').load_contents(null);
        this.dbus = Gio.DBusExportedObject.wrapJSObject(ByteArray.toString(xml), this);
    }

    SetupAsync(params, invocation) {
        invoke_async(setup, params, invocation);
    }

    get NMonitors() {
        return global.display.get_n_monitors();
    }

    get PrimaryMonitor() {
        return Main.layoutManager.primaryIndex;
    }

    GetMonitorGeometry(index) {
        const rect = global.display.get_monitor_geometry(index);
        return [rect.x, rect.y, rect.width, rect.height];
    }

    GetMonitorScale(index) {
        return global.display.get_monitor_scale(index);
    }

    LogMessage(msg) {
        message(msg);
    }

    TestShowAsync(params, invocation) {
        invoke_test_async(test_show, params, invocation);
    }

    TestUnmaximizeAsync(params, invocation) {
        invoke_test_async(test_unmaximize, params, invocation);
    }

    TestUnmaximizeCorrectSizeAsync(params, invocation) {
        invoke_test_async(test_unmaximize_correct_size, params, invocation);
    }

    TestUnmaximizeOnSizeChangeAsync(params, invocation) {
        invoke_test_async(test_unmaximize_on_size_change, params, invocation);
    }

    TestResizeXteAsync(params, invocation) {
        invoke_test_async(test_resize_xte, params, invocation);
    }

    TestChangePositionAsync(params, invocation) {
        invoke_test_async(test_change_position, params, invocation);
    }
}

let dbus_interface = null;

function enable() {
    GLib.setenv('G_MESSAGES_DEBUG', LOG_DOMAIN, false);
    settings = Extension.settings;
    dbus_interface = new ExtensionTestDBusInterface();
    dbus_interface.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');
}

function disable() {
    dbus_interface.dbus.unexport();
    dbus_interface = null;
    settings = null;
}
