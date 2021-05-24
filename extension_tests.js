'use strict';

/* exported run_tests */

const { GLib } = imports.gi;
const Main = imports.ui.main;
const JsUnit = imports.jsUnit;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Extension = Me.imports.extension;
const {
    workarea_for_monitor,
    target_rect_for_workarea_size,
    toggle,
    DBUS_INTERFACE,
} = Extension;

let settings = null;

const PERCENT_FORMAT = new Intl.NumberFormat(undefined, { style: 'percent' });

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
    const { workarea, monitor_scale } = workarea_for_monitor(monitor_index);
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
    await hide_window_async_wait();

    await set_settings_double('window-height', window_height);
    await set_settings_boolean('window-maximize', initial_window_maximize);

    toggle();

    await async_wait_current_window();
    await async_sleep();

    verify_window_geometry(window_height, initial_window_maximize || window_height === 1.0);

    settings.set_boolean('window-maximize', true);
    await async_sleep();
    verify_window_geometry(window_height, true);

    settings.set_boolean('window-maximize', false);
    await async_sleep();
    verify_window_geometry(window_height, window_height === 1.0);
}

async function test_begin_resize(window_height, window_maximize) {
    await hide_window_async_wait();

    await set_settings_double('window-height', window_height);
    await set_settings_boolean('window-maximize', window_maximize);

    toggle();

    await async_wait_current_window();
    await async_sleep();

    verify_window_geometry(window_height, window_maximize || window_height === 1.0);

    DBUS_INTERFACE.BeginResize();

    await async_sleep();
    verify_window_geometry(window_maximize ? 1.0 : window_height, false);
}

async function test_unmaximize_correct_height(window_height, window_height2) {
    await hide_window_async_wait();

    await set_settings_double('window-height', window_height);
    await set_settings_boolean('window-maximize', false);

    toggle();

    await async_wait_current_window();
    await async_sleep();

    verify_window_geometry(window_height, window_height === 1.0);

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
    await hide_window_async_wait();

    await set_settings_double('window-height', window_height);
    await set_settings_boolean('window-maximize', true);

    toggle();

    await async_wait_current_window();
    await async_sleep();

    verify_window_geometry(window_height, true);

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

async function run_tests() {
    const BOOL_VALUES = [true, false];
    const HEIGHT_VALUES = [0.3, 0.5, 0.7, 0.8, 0.9, 1.0];
    const tests = [];

    const add_test = (func, ...args) => tests.push({ func, args });

    settings = Extension.settings;

    for (let window_maximize of BOOL_VALUES) {
        for (let window_height of HEIGHT_VALUES)
            add_test(test_show, window_height, window_maximize);
    }

    for (let window_maximize of BOOL_VALUES) {
        for (let window_height of HEIGHT_VALUES)
            add_test(test_maximize_unmaximize, window_height, window_maximize);
    }

    for (let window_maximize of BOOL_VALUES) {
        for (let window_height of HEIGHT_VALUES)
            add_test(test_begin_resize, window_height, window_maximize);
    }

    for (let window_height of HEIGHT_VALUES) {
        for (let window_height2 of HEIGHT_VALUES)
            add_test(test_unmaximize_correct_height, window_height, window_height2);
    }

    for (let window_height of HEIGHT_VALUES) {
        for (let window_height2 of HEIGHT_VALUES)
            add_test(test_unmaximize_on_height_change, window_height, window_height2);
    }

    let tests_passed = 0;
    for (let test of tests) {
        const test_id = `${JsUnit.getFunctionName(test.func)}(${JSON.stringify(test.args)})`;
        print(`Running test ${test_id} (${tests_passed} of ${tests.length} done, ${PERCENT_FORMAT.format(tests_passed / tests.length)})`);
        try {
            // eslint-disable-next-line no-await-in-loop
            await test.func(...test.args);
        } catch (e) {
            e.message += `\n${test_id})`;
            throw e;
        }
        tests_passed += 1;
    }
}
