// SPDX-FileCopyrightText: 2025 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

// Logger from js/extensions/sharedInternals.js
// https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/3586

export default class Console {
    #extension;

    constructor(ext) {
        this.#extension = ext;
    }

    #prefixArgs(first, ...args) {
        return [`[${this.#extension.metadata.name}] ${first}`, ...args];
    }

    log(...args) {
        globalThis.console.log(...this.#prefixArgs(...args));
    }

    warn(...args) {
        globalThis.console.warn(...this.#prefixArgs(...args));
    }

    error(...args) {
        globalThis.console.error(...this.#prefixArgs(...args));
    }

    info(...args) {
        globalThis.console.info(...this.#prefixArgs(...args));
    }

    debug(...args) {
        globalThis.console.debug(...this.#prefixArgs(...args));
    }

    assert(condition, ...args) {
        if (condition)
            return;

        const message = 'Assertion failed';

        if (args.length === 0)
            args.push(message);

        if (typeof args[0] !== 'string') {
            args.unshift(message);
        } else {
            const first = args.shift();
            args.unshift(`${message}: ${first}`);
        }
        globalThis.console.error(...this.#prefixArgs(...args));
    }

    trace(...args) {
        if (args.length === 0)
            args = ['Trace'];

        globalThis.console.trace(...this.#prefixArgs(...args));
    }

    group(...args) {
        globalThis.console.group(...this.#prefixArgs(...args));
    }

    groupEnd() {
        globalThis.console.groupEnd();
    }
}
