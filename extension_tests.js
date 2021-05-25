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

function assert_rect_equals(expected, actual) {
    JsUnit.assertEquals(expected.x, actual.x);
    JsUnit.assertEquals(expected.y, actual.y);
    JsUnit.assertEquals(expected.width, actual.width);
    JsUnit.assertEquals(expected.height, actual.height);
}

function verify_window_geometry(window_height, window_maximize) {
    const monitor_index = Main.layoutManager.currentMonitor.index;
    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitor_index);
    const monitor_scale = global.display.get_monitor_scale(monitor_index);
    const frame_rect = Extension.current_window.get_frame_rect();

    JsUnit.assertEquals(window_maximize, Extension.current_window.maximized_vertically);

    if (window_maximize) {
        assert_rect_equals(workarea, frame_rect);
    } else {
        const target_rect = target_rect_for_workarea_size(workarea, monitor_scale, window_height);

        // Window size (at least, on Wayland) should be an integer number of
        // logical pixels
        JsUnit.assertEquals(0, frame_rect.height % monitor_scale);

        assert_rect_equals(target_rect, frame_rect);
    }
}

async function test_show(window_height, window_maximize) {
    await hide_window_async_wait();

    await set_settings_double('window-height', window_height);
    await set_settings_boolean('window-maximize', window_maximize);

    toggle();

    await async_wait_current_window();
    await async_sleep();

    verify_window_geometry(window_height, window_maximize || window_height === 1.0);
}

async function test_maximize_unmaximize(window_height, initial_window_maximize) {
    await test_show(window_height, initial_window_maximize);

    settings.set_boolean('window-maximize', true);
    await async_sleep();
    verify_window_geometry(window_height, true);

    settings.set_boolean('window-maximize', false);
    await async_sleep();
    verify_window_geometry(window_height, window_height === 1.0);
}

async function test_unmaximize_correct_height(window_height, window_height2) {
    await test_show(window_height, false);

    await set_settings_double('window-height', window_height2);
    await async_sleep();
    verify_window_geometry(window_height2, window_height === 1.0 && window_height2 === 1.0);

    await set_settings_boolean('window-maximize', true);
    await async_sleep();
    verify_window_geometry(window_height2, true);

    await set_settings_boolean('window-maximize', false);
    await async_sleep();
    verify_window_geometry(window_height2, window_height2 === 1.0);
}

async function test_unmaximize_on_height_change(window_height, window_height2) {
    await test_show(window_height, true);

    await set_settings_double('window-height', window_height2);
    await async_sleep();
    // When window_height2 === window_height, some GLib/GNOME versions do
    // trigger a change notification, and some don't (and then the window
    // doesn't get unmaximized)
    verify_window_geometry(
        window_height2,
        window_height2 === 1.0 || (window_height2 === window_height && Extension.current_window.maximized_vertically)
    );
}

async function test_resize_xte(window_height, window_maximize, window_height2) {
    await test_show(window_height, window_maximize);

    const initial_frame_rect = Extension.current_window.get_frame_rect();

    const initial_x = Math.floor(initial_frame_rect.x + initial_frame_rect.width / 2);
    const initial_y = initial_frame_rect.y + initial_frame_rect.height - 5;

    await async_run_process(['xte', `mousemove ${initial_x} ${initial_y}`, 'sleep 0.2', 'mousedown 1']);
    await async_sleep();

    verify_window_geometry(window_maximize ? 1.0 : window_height, false);

    const monitor_index = Main.layoutManager.currentMonitor.index;
    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitor_index);
    const monitor_scale = global.display.get_monitor_scale(monitor_index);
    const target_frame_rect = target_rect_for_workarea_size(workarea, monitor_scale, window_height2);

    await async_run_process(['xte', `mousermove 0 ${target_frame_rect.height - initial_frame_rect.height}`, 'sleep 0.2', 'mouseup 1']);
    await async_sleep();

    verify_window_geometry(window_height2, false);

    // TODO: 'grab-op-end' isn't emitted on Wayland when simulting mouse with xte.
    // For now, just call update_height_setting_on_grab_end()
    if (Meta.is_wayland_compositor())
        Extension.update_height_setting_on_grab_end(global.display, Extension.current_window);

    assert_rect_equals(target_frame_rect, Extension.target_rect_for_workarea());
}

async function run_tests(filter = '', filter_out = false) {
    const BOOL_VALUES = [false, true];
    const HEIGHT_VALUES = [0.3, 0.5, 0.7, 0.8, 0.9, 1.0];
    const tests = [];

    const add_test = (func, ...args) => tests.push({
        func,
        args,
        id: `${JsUnit.getFunctionName(func)}${JSON.stringify(args)}`,
    });

    settings = Extension.settings;

    for (let window_height of [0.3, 0.7, 0.8, 0.9, 1.0]) {
        for (let window_maximize of BOOL_VALUES) {
            for (let window_height2 of [0.5, 1.0])
                add_test(test_resize_xte, window_height, window_maximize, window_height2);
        }
    }

    for (let window_maximize of BOOL_VALUES) {
        for (let window_height of HEIGHT_VALUES)
            add_test(test_maximize_unmaximize, window_height, window_maximize);
    }

    for (let window_height of HEIGHT_VALUES) {
        for (let window_height2 of HEIGHT_VALUES)
            add_test(test_unmaximize_correct_height, window_height, window_height2);
    }

    for (let window_height of HEIGHT_VALUES) {
        for (let window_height2 of HEIGHT_VALUES)
            add_test(test_unmaximize_on_height_change, window_height, window_height2);
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
