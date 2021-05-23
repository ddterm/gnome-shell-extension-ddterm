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

function async_sleep(ms) {
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
        await async_sleep(100);
    }
}

async function async_wait_current_window() {
    while (!Extension.current_window) {
        // eslint-disable-next-line no-await-in-loop
        await async_sleep(100);
    }
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
        JsUnit.assertEquals(0, frame_rect.width % monitor_scale);
        JsUnit.assertEquals(0, frame_rect.height % monitor_scale);

        assert_rect_equals(target_rect, frame_rect);
    }
}

async function test_show(window_height, window_maximize) {
    await hide_window_async_wait();

    settings.set_double('window-height', window_height);
    settings.set_boolean('window-maximize', window_maximize);

    await async_sleep(200);

    toggle();

    await async_wait_current_window();
    await async_sleep(200);

    verify_window_geometry(window_height, window_maximize || window_height === 1.0);
}

async function test_maximize_unmaximize(window_height, initial_window_maximize) {
    await hide_window_async_wait();

    settings.set_double('window-height', window_height);
    settings.set_boolean('window-maximize', initial_window_maximize);

    await async_sleep(200);

    toggle();

    await async_wait_current_window();
    await async_sleep(200);

    verify_window_geometry(window_height, initial_window_maximize || window_height === 1.0);

    settings.set_boolean('window-maximize', true);
    await async_sleep(200);
    verify_window_geometry(window_height, true);

    settings.set_boolean('window-maximize', false);
    await async_sleep(200);
    verify_window_geometry(window_height, window_height === 1.0);
}

async function test_begin_resize(window_height, window_maximize) {
    await hide_window_async_wait();

    settings.set_double('window-height', window_height);
    settings.set_boolean('window-maximize', window_maximize);

    await async_sleep(200);

    toggle();

    await async_wait_current_window();
    await async_sleep(200);

    verify_window_geometry(window_height, window_maximize || window_height === 1.0);

    DBUS_INTERFACE.BeginResize();

    await async_sleep(200);
    verify_window_geometry(window_maximize ? 1.0 : window_height, false);
}

async function test_unmaximize_correct_height(window_height, window_height2) {
    await hide_window_async_wait();

    settings.set_double('window-height', window_height);
    settings.set_boolean('window-maximize', false);

    await async_sleep(200);

    toggle();

    await async_wait_current_window();
    await async_sleep(200);

    verify_window_geometry(window_height, window_height === 1.0);

    settings.set_double('window-height', window_height2);
    await async_sleep(200);
    verify_window_geometry(window_height2, window_height === 1.0 && window_height2 === 1.0);

    settings.set_boolean('window-maximize', true);
    await async_sleep(200);
    verify_window_geometry(window_height2, true);

    settings.set_boolean('window-maximize', false);
    await async_sleep(200);
    verify_window_geometry(window_height2, window_height2 === 1.0);
}

async function test_unmaximize_on_height_change(window_height, window_height2) {
    await hide_window_async_wait();

    settings.set_double('window-height', window_height);
    settings.set_boolean('window-maximize', true);

    await async_sleep(200);

    toggle();

    await async_wait_current_window();
    await async_sleep(200);

    verify_window_geometry(window_height, true);

    settings.set_double('window-height', window_height2);
    await async_sleep(200);
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

    for (let test of tests) {
        const name = JsUnit.getFunctionName(test.func);
        try {
            // eslint-disable-next-line no-await-in-loop
            await test.func(...test.args);
        } catch (e) {
            e.message += `\n${name}(${JSON.stringify(test.args)})`;
            throw e;
        }
    }
}
