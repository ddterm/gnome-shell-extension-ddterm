#!/usr/bin/env -S gjs -m

// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const pkgs = {
    alpine: 'vte3',
    arch: 'vte3',
    debian: 'gir1.2-vte-2.91',
    fedora: 'vte291',
    suse: 'typelib-1_0-Vte-2_91',
};

const os_ids = [GLib.get_os_info('ID')];

for (const like of GLib.get_os_info('ID_LIKE')?.split(' ') ?? []) {
    if (like)
        os_ids.push(like);
}

if (os_ids.includes('ubuntu') && !os_ids.includes('debian'))
    os_ids.push('debian');

let pkg;

for (const os_id of os_ids) {
    if (pkgs[os_id]) {
        pkg = pkgs[os_id];
        break;
    }
}

Gio.DBus.session.call_sync(
    'org.gnome.Shell',
    '/org/gnome/Shell/Extensions/ddterm',
    'com.github.amezin.ddterm.Extension',
    'MissingDependencies',
    new GLib.Variant('(asas)', [pkg ? [pkg] : [], ['Vte-2.91.typelib']]),
    null,
    Gio.DBusCallFlags.NONE,
    -1,
    null
);
