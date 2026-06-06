// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import { WindowMatchGeneric } from './windowmatch.js';

function read_async(path, cancellable) {
    return new Promise((resolve, reject) => {
        const file = Gio.File.new_for_path(path);

        file.load_contents_async(cancellable, (source, result) => {
            try {
                resolve(source.load_contents_finish(result));
            } catch (ex) {
                reject(ex);
            }
        });
    });
}

function wait_cancellable(promise, cancellable) {
    if (!cancellable)
        return promise;

    cancellable.set_error_if_cancelled();

    let cancel_handler;

    return new Promise((resolve, reject) => {
        cancel_handler = cancellable.connect(source => {
            try {
                source.set_error_if_cancelled();
            } catch (ex) {
                reject(ex);
            }
        });

        promise.then(resolve, reject);
    }).finally(() => {
        cancellable.disconnect(cancel_handler);
    });
}

let read_locks = null;

// Async file read isn't really interruptible, it's just a blocking read()
// in a thread. So keep a lock per path in progress, to prevent stacking
// of read tasks for the same path in the thread pool.
async function read_async_locking(path, cancellable) {
    for (let lock = read_locks?.get(path); lock; lock = read_locks?.get(path)) {
        // eslint-disable-next-line no-await-in-loop
        await wait_cancellable(lock, cancellable);
    }

    let unlock;

    const lock = new Promise(resolve => {
        unlock = resolve;
    });

    if (!read_locks)
        read_locks = new Map();

    read_locks.set(path, lock);

    try {
        return await read_async(path, cancellable);
    } finally {
        read_locks.delete(path);

        if (read_locks.size === 0)
            read_locks = null;

        unlock();
    }
}

export async function is_wlclipboard(win, cancellable = null) {
    if (!win)
        return false;

    if (win.get_client_type() !== Meta.WindowClientType.WAYLAND)
        return false;

    if (win.title !== 'wl-clipboard')
        return false;

    const pid = win.get_pid();

    try {
        const [, bytes] = await read_async_locking(`/proc/${pid}/cmdline`, cancellable);
        const argv0_bytes = bytes.slice(0, bytes.indexOf(0));
        const argv0 = new TextDecoder().decode(argv0_bytes);

        return ['wl-copy', 'wl-paste'].includes(GLib.path_get_basename(argv0));
    } catch (ex) {
        // /proc read can return ENOENT or ESRCH if the process has terminated
        // ESRCH is, unfortunately, converted to generic IOErrorEnum.FAILED
        if (ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.FAILED) &&
            ex.message.includes('No such process'))
            throw GLib.Error.new_literal(ex.domain, Gio.IOErrorEnum.NOT_FOUND, ex.message);

        throw ex;
    }
}

export class WlClipboardActivator extends WindowMatchGeneric {
    static [GObject.GTypeName] = 'DDTermWlClipboardActivator';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            track_signals: [
                'notify::title',
                'shown',
            ],
            ...params,
        });
    }

    async check_window(win, cancellable) {
        if (win.get_client_type() !== Meta.WindowClientType.WAYLAND)
            return GLib.SOURCE_REMOVE;

        if (!win.title)
            return GLib.SOURCE_CONTINUE;

        try {
            if (!await is_wlclipboard(win, cancellable))
                return GLib.SOURCE_REMOVE;
        } catch (ex) {
            if (ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED))
                throw ex;

            if (!ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND))
                logError(ex);

            return GLib.SOURCE_REMOVE;
        }

        if (win.is_hidden())
            return GLib.SOURCE_CONTINUE;

        win.focus(global.get_current_time());

        return GLib.SOURCE_REMOVE;
    }
}
