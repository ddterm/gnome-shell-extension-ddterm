'use strict';

/* exported enable disable */

const { GLib, Gio, Meta } = imports.gi;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;
const JsUnit = imports.jsUnit;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Extension = Me.imports.extension;
const {
    target_rect_for_workarea_size,
    toggle,
} = Extension;

let settings = null;

const PERCENT_FORMAT = new Intl.NumberFormat(undefined, { style: 'percent' });

class ExtensionTestDBusInterface {
    constructor() {
        let [_, xml] = Me.dir.get_child('com.github.amezin.ddterm.ExtensionTest.xml').load_contents(null);
        this.dbus = Gio.DBusExportedObject.wrapJSObject(ByteArray.toString(xml), this);
    }

    RunTestAsync(params, invocation) {
        run_tests(...params).then(_ => {
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

const DBUS_INTERFACE = new ExtensionTestDBusInterface();

function enable() {
    DBUS_INTERFACE.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');
}

function disable() {
    DBUS_INTERFACE.dbus.unexport();
}

function async_sleep(ms = 200) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

async function hide_window_async_wait() {
    if (!Extension.current_window)
        return;

    Extension.toggle();

    while (Extension.current_window) {
        // eslint-disable-next-line no-await-in-loop
        await async_sleep(50);
    }
}

async function async_wait_current_window() {
    while (!Extension.current_window || Extension.current_window.is_hidden()) {
        // eslint-disable-next-line no-await-in-loop
        await async_sleep(50);
    }
}

function wait_window_settle() {
    return new Promise(resolve => {
        const win = Extension.current_window;
        let timer_id = null;
        const handlers = [];

        const restart_timer = () => {
            if (timer_id !== null) {
                GLib.source_remove(timer_id);
                timer_id = null;
            }

            timer_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 200, () => {
                timer_id = null;

                while (handlers.length)
                    win.disconnect(handlers.pop());

                resolve();
                return GLib.SOURCE_REMOVE;
            });
        };

        restart_timer();

        handlers.push(win.connect('position-changed', restart_timer));
        handlers.push(win.connect('size-changed', restart_timer));
        handlers.push(win.connect('notify::maximized-vertically', restart_timer));
    });
}

function connect_once(object, signal, callback) {
    const handler_id = object.connect(signal, (...params) => {
        object.disconnect(handler_id);
        callback(...params);
    });
    return handler_id;
}

function async_wait_signal(object, signal) {
    return new Promise(resolve => connect_once(object, signal, resolve));
}

function async_run_process(argv) {
    return new Promise(resolve => {
        print(`Starting subprocess ${JSON.stringify(argv)}`);
        const subprocess = Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
        subprocess.wait_check_async(null, (source, result) => {
            print(`Finished subprocess ${JSON.stringify(argv)}`);
            resolve(source.wait_check_finish(result));
        });
    });
}

function set_settings_double(name, value) {
    if (settings.get_double(name) === value)
        return Promise.resolve(settings, name);

    const promise = async_wait_signal(settings, `changed::${name}`);
    settings.set_double(name, value);
    return promise;
}

function set_settings_boolean(name, value) {
    if (settings.get_boolean(name) === value)
        return Promise.resolve(settings, name);

    const promise = async_wait_signal(settings, `changed::${name}`);
    settings.set_boolean(name, value);
    return promise;
}

function set_settings_string(name, value) {
    if (settings.get_string(name) === value)
        return Promise.resolve(settings, name);

    const promise = async_wait_signal(settings, `changed::${name}`);
    settings.set_string(name, value);
    return promise;
}

function assert_rect_equals(expected, actual) {
    JsUnit.assertEquals(expected.x, actual.x);
    JsUnit.assertEquals(expected.y, actual.y);
    JsUnit.assertEquals(expected.width, actual.width);
    JsUnit.assertEquals(expected.height, actual.height);
}

function verify_window_geometry(window_height, window_maximize, window_pos) {
    const monitor_index = Main.layoutManager.currentMonitor.index;
    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitor_index);
    const monitor_scale = global.display.get_monitor_scale(monitor_index);
    const frame_rect = Extension.current_window.get_frame_rect();

    if (window_pos === 'top' || window_pos === 'bottom')
        JsUnit.assertEquals(window_maximize, Extension.current_window.maximized_vertically);
    else
        JsUnit.assertEquals(window_maximize, Extension.current_window.maximized_horizontally);

    if (window_maximize) {
        assert_rect_equals(workarea, frame_rect);
        return;
    }

    const target_rect = target_rect_for_workarea_size(workarea, monitor_scale, window_height);

    // Window size (at least, on Wayland) should be an integer number of
    // logical pixels
    if (window_pos === 'top' || window_pos === 'bottom')
        JsUnit.assertEquals(0, target_rect.height % monitor_scale);
    else
        JsUnit.assertEquals(0, target_rect.width % monitor_scale);

    const workarea_right = workarea.x + workarea.width;
    const workarea_bottom = workarea.y + workarea.height;
    const frame_rect_right = frame_rect.x + frame_rect.width;
    const frame_rect_bottom = frame_rect.y + frame_rect.height;

    if (window_pos === 'top') {
        JsUnit.assertEquals(workarea.x, frame_rect.x);
        JsUnit.assertEquals(workarea_right, frame_rect_right);
        JsUnit.assertEquals(workarea.y, frame_rect.y);
    }

    if (window_pos === 'bottom') {
        JsUnit.assertEquals(workarea.x, frame_rect.x);
        JsUnit.assertEquals(workarea_right, frame_rect_right);
        JsUnit.assertEquals(workarea_bottom, frame_rect_bottom);
    }

    if (window_pos === 'left') {
        JsUnit.assertEquals(workarea.x, frame_rect.x);
        JsUnit.assertEquals(workarea.y, frame_rect.y);
        JsUnit.assertEquals(workarea_bottom, frame_rect_bottom);
    }

    if (window_pos === 'right') {
        JsUnit.assertEquals(workarea_right, frame_rect_right);
        JsUnit.assertEquals(workarea.y, frame_rect.y);
        JsUnit.assertEquals(workarea_bottom, frame_rect_bottom);
    }

    assert_rect_equals(target_rect, frame_rect);
}

async function test_show(window_height, window_maximize, window_pos) {
    await hide_window_async_wait();

    await set_settings_double('window-height', window_height);
    await set_settings_boolean('window-maximize', window_maximize);
    await set_settings_string('window-position', window_pos);

    toggle();

    await async_wait_current_window();
    await wait_window_settle();

    verify_window_geometry(window_height, window_maximize || window_height === 1.0, window_pos);
}

async function test_maximize_unmaximize(window_height, initial_window_maximize, window_pos) {
    await test_show(window_height, initial_window_maximize, window_pos);

    settings.set_boolean('window-maximize', true);
    await wait_window_settle();
    verify_window_geometry(window_height, true, window_pos);

    settings.set_boolean('window-maximize', false);
    await wait_window_settle();
    verify_window_geometry(window_height, window_height === 1.0, window_pos);
}

async function test_unmaximize_correct_height(window_height, window_height2, window_pos) {
    await test_show(window_height, false, window_pos);

    await set_settings_double('window-height', window_height2);
    await wait_window_settle();
    verify_window_geometry(window_height2, window_height === 1.0 && window_height2 === 1.0, window_pos);

    await set_settings_boolean('window-maximize', true);
    await wait_window_settle();
    verify_window_geometry(window_height2, true, window_pos);

    await set_settings_boolean('window-maximize', false);
    await wait_window_settle();
    verify_window_geometry(window_height2, window_height2 === 1.0, window_pos);
}

async function test_unmaximize_on_height_change(window_height, window_height2, window_pos) {
    await test_show(window_height, true, window_pos);

    await set_settings_double('window-height', window_height2);
    await wait_window_settle();

    // eslint-disable-next-line no-extra-parens
    const is_maximized = (
        // eslint-disable-next-line no-extra-parens
        (window_pos === 'top' || window_pos === 'bottom')
            ? Extension.current_window.maximized_vertically
            : Extension.current_window.maximized_horizontally
    );

    // When window_height2 === window_height, some GLib/GNOME versions do
    // trigger a change notification, and some don't (and then the window
    // doesn't get unmaximized)
    verify_window_geometry(
        window_height2,
        window_height2 === 1.0 || (window_height2 === window_height && is_maximized),
        window_pos
    );
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

async function test_resize_xte_flaky(window_height, window_maximize, window_height2, window_pos) {
    await test_show(window_height, window_maximize, window_pos);

    const monitor_index = Main.layoutManager.currentMonitor.index;
    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitor_index);
    const monitor_scale = global.display.get_monitor_scale(monitor_index);

    const initial_frame_rect = Extension.current_window.get_frame_rect();
    const initial = resize_point(initial_frame_rect, window_pos, monitor_scale);

    const target_frame_rect = target_rect_for_workarea_size(workarea, monitor_scale, window_height2);
    const target = resize_point(target_frame_rect, window_pos, monitor_scale);

    await async_run_process(['xte', `mousemove ${initial.x} ${initial.y}`, 'sleep 0.2', 'mousedown 1']);
    await wait_window_settle();

    try {
        verify_window_geometry(window_maximize ? 1.0 : window_height, false, window_pos);
    } finally {
        await async_run_process(['xte', `mousermove ${target.x - initial.x} ${target.y - initial.y}`, 'sleep 0.2', 'mouseup 1']);
    }
    await wait_window_settle();

    verify_window_geometry(window_height2, false, window_pos);

    // TODO: 'grab-op-end' isn't emitted on Wayland when simulting mouse with xte.
    // For now, just call update_height_setting_on_grab_end()
    if (Meta.is_wayland_compositor())
        Extension.update_height_setting_on_grab_end(global.display, Extension.current_window);

    assert_rect_equals(target_frame_rect, Extension.target_rect_for_workarea());
}

async function test_resize_xte(window_height, window_maximize, window_height2, window_pos) {
    try {
        await test_resize_xte_flaky(window_height, window_maximize, window_height2, window_pos);
    } catch (e) {
        logError(e, 'Trying again');
        await test_resize_xte_flaky(window_height, window_maximize, window_height2, window_pos);
    }
}

async function run_tests(filter = '', filter_out = false) {
    const BOOL_VALUES = [false, true];
    const HEIGHT_VALUES = [0.3, 0.5, 0.7, 0.8, 0.9, 1.0];
    const POSITIONS = ['top', 'bottom', 'left', 'right'];
    const tests = [];

    const add_test = (func, ...args) => tests.push({
        func,
        args,
        id: `${JsUnit.getFunctionName(func)}${JSON.stringify(args)}`,
    });

    settings = Extension.settings;

    for (let window_height of [0.3, 0.7, 0.8, 0.9, 1.0]) {
        for (let window_maximize of BOOL_VALUES) {
            for (let window_height2 of [0.5, 1.0]) {
                for (let window_pos of POSITIONS)
                    add_test(test_resize_xte, window_height, window_maximize, window_height2, window_pos);
            }
        }
    }

    for (let window_pos of POSITIONS) {
        for (let window_maximize of BOOL_VALUES) {
            for (let window_height of HEIGHT_VALUES)
                add_test(test_maximize_unmaximize, window_height, window_maximize, window_pos);
        }

        for (let window_height of HEIGHT_VALUES) {
            for (let window_height2 of HEIGHT_VALUES)
                add_test(test_unmaximize_correct_height, window_height, window_height2, window_pos);
        }

        for (let window_height of HEIGHT_VALUES) {
            for (let window_height2 of HEIGHT_VALUES)
                add_test(test_unmaximize_on_height_change, window_height, window_height2, window_pos);
        }
    }

    if (global.settings.settings_schema.has_key('welcome-dialog-last-shown-version'))
        global.settings.set_string('welcome-dialog-last-shown-version', '99.0');

    if (Main.welcomeDialog) {
        const ModalDialog = imports.ui.modalDialog;
        if (Main.welcomeDialog.state !== ModalDialog.State.CLOSED) {
            Main.welcomeDialog.close();
            await async_wait_signal(Main.welcomeDialog, 'closed');
        }
    }

    const filter_func = info => info.id.match(filter);
    const filtered_tests = tests.filter(filter_out ? info => !filter_func(info) : filter_func);
    let tests_passed = 0;
    for (let test of filtered_tests) {
        print(`Running test ${test.id} (${tests_passed} of ${filtered_tests.length} done, ${PERCENT_FORMAT.format(tests_passed / filtered_tests.length)})`);
        try {
            // eslint-disable-next-line no-await-in-loop
            await test.func(...test.args);
        } catch (e) {
            e.message += `\n${test.id})`;
            throw e;
        }
        tests_passed += 1;
    }
}
