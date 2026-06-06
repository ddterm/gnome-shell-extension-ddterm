// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import { WindowMatchGeneric } from './windowmatch.js';

export async function is_wlclipboard(win, cancellable = null) {
    if (!win)
        return false;

    if (win.get_client_type() !== Meta.WindowClientType.WAYLAND)
        return false;

    if (win.title !== 'wl-clipboard')
        return false;

    const pid = win.get_pid();

    try {
        const file = Gio.File.new_for_path(`/proc/${pid}/cmdline`);

        const [, bytes] = await new Promise((resolve, reject) => {
            file.load_contents_async(cancellable, (source, result) => {
                try {
                    resolve(source.load_contents_finish(result));
                } catch (ex) {
                    reject(ex);
                }
            });
        });

        const argv0_bytes = bytes.slice(0, bytes.indexOf(0));
        const argv0 = new TextDecoder().decode(argv0_bytes);

        return ['wl-copy', 'wl-paste'].includes(GLib.path_get_basename(argv0));
    } catch (ex) {
        cancellable?.set_error_if_cancelled();
        logError(ex);

        return false;
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

        if (!await is_wlclipboard(win, cancellable))
            return GLib.SOURCE_REMOVE;

        cancellable.set_error_if_cancelled();

        if (win.is_hidden())
            return GLib.SOURCE_CONTINUE;

        win.focus(global.get_current_time());

        return GLib.SOURCE_REMOVE;
    }
}
