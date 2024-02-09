/*
    Copyright © 2023 Aleksandr Mezin

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

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';

import { WindowMatchGeneric } from './windowmatch.js';

export function is_wlclipboard(win) {
    if (win.get_client_type() !== Meta.WindowClientType.WAYLAND)
        return false;

    if (win.title !== 'wl-clipboard')
        return false;

    const pid = win.get_pid();

    try {
        const [, bytes] = GLib.file_get_contents(`/proc/${pid}/cmdline`);
        const argv0_bytes = bytes.slice(0, bytes.indexOf(0));
        const argv0 = globalThis.TextDecoder
            ? new TextDecoder().decode(argv0_bytes)
            : imports.byteArray.toString(argv0_bytes);

        return ['wl-copy', 'wl-paste'].includes(GLib.path_get_basename(argv0));
    } catch {
        return false;
    }
}

export const WlClipboardActivator = GObject.registerClass({
}, class DDTermWlClipboardActivator extends WindowMatchGeneric {
    _init(params) {
        super._init({
            track_signals: [
                'notify::title',
                'shown',
            ],
            ...params,
        });
    }

    check_window(win) {
        if (win.get_client_type() !== Meta.WindowClientType.WAYLAND)
            return GLib.SOURCE_REMOVE;

        if (!win.title)
            return GLib.SOURCE_CONTINUE;

        if (!is_wlclipboard(win))
            return GLib.SOURCE_REMOVE;

        if (win.is_hidden())
            return GLib.SOURCE_CONTINUE;

        win.focus(global.get_current_time());
        return GLib.SOURCE_REMOVE;
    }
});
