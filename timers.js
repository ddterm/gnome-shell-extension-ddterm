// eslint-disable-next-line max-len
// https://gitlab.gnome.org/GNOME/gjs/-/blob/43689fecad1fa712974eabc5c939a71d2a7cb7fd/modules/esm/_timers.js

// SPDX-License-Identifier: MIT OR LGPL-2.0-or-later
// SPDX-FileCopyrightText: 2021 Evan Welsh <contact@evanwelsh.com>

/* exported setTimeout, setInterval, clearTimeout, clearInterval */
/* eslint no-implicit-coercion: ["error", {"allow": ["+"]}] */
// Note: implicit coercion with + is used to perform the ToNumber algorithm from
// the timers specification

const { GLib, GObject } = imports.gi;

/**
 * @param {number} delay a number value (in milliseconds)
 */
function validateDelay(delay) {
    // |0 always returns a signed 32-bit integer.
    return Math.max(0, +delay | 0);
}

/** @type {Map<GLib.Source, number>} */
const timeouts = new Map();

/**
 * @param {GLib.Source} source the source to add to our map
 */
function addSource(source) {
    const id = source.attach(null);
    timeouts.set(source, id);
}

/**
 * @param {GLib.Source} source the source object to remove from our map
 */
function releaseSource(source) {
    timeouts.delete(source);
}

/**
 * @param {unknown} thisArg 'this' argument
 * @returns {asserts thisArg is (null | undefined | typeof globalThis)}
 */
function checkThis(thisArg) {
    if (thisArg !== null && thisArg !== undefined && thisArg !== globalThis)
        throw new TypeError('Illegal invocation');
}

/**
 * @param {number} timeout a timeout in milliseconds
 * @param {(...args) => any} handler a callback
 * @returns {GLib.Source}
 */
function createTimeoutSource(timeout, handler) {
    const source = GLib.timeout_source_new(timeout);
    source.set_priority(GLib.PRIORITY_DEFAULT);
    GObject.source_set_closure(source, handler);

    return source;
}

/**
 * @this {typeof globalThis}
 * @param {(...args) => any} callback a callback function
 * @param {number} delay the duration in milliseconds to wait before running callback
 * @param {...any} args arguments to pass to callback
 */
function setTimeout(callback, delay = 0, ...args) {
    checkThis(this);

    delay = validateDelay(delay);
    const boundCallback = callback.bind(globalThis, ...args);
    const source = createTimeoutSource(delay, () => {
        if (!timeouts.has(source))
            return GLib.SOURCE_REMOVE;

        boundCallback();
        releaseSource(source);
        // PromiseNative.drainMicrotaskQueue();

        return GLib.SOURCE_REMOVE;
    });

    addSource(source);
    return source;
}

/**
 * @this {typeof globalThis}
 * @param {(...args) => any} callback a callback function
 * @param {number} delay the duration in milliseconds to wait between calling callback
 * @param {...any} args arguments to pass to callback
 */
function setInterval(callback, delay = 0, ...args) {
    checkThis(this);

    delay = validateDelay(delay);
    const boundCallback = callback.bind(globalThis, ...args);
    const source = createTimeoutSource(delay, () => {
        if (!timeouts.has(source))
            return GLib.SOURCE_REMOVE;

        boundCallback();
        // PromiseNative.drainMicrotaskQueue();

        return GLib.SOURCE_CONTINUE;
    });

    addSource(source);
    return source;
}

/**
 * @param {GLib.Source} source the timeout to clear
 */
function _clearTimer(source) {
    if (!timeouts.has(source))
        return;

    if (source) {
        source.destroy();
        releaseSource(source);
    }
}

/**
 * @param {GLib.Source} timeout the timeout to clear
 */
function clearTimeout(timeout = null) {
    _clearTimer(timeout);
}

/**
 * @param {Glib.Source} timeout the timeout to clear
 */
function clearInterval(timeout = null) {
    _clearTimer(timeout);
}

function install() {
    for (const f of ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval']) {
        if (!globalThis[f]) {
            Object.defineProperty(globalThis, f, {
                configurable: false,
                enumerable: true,
                writable: true,
                value: this[f],
            });
        }
    }
}

/* exported install */
