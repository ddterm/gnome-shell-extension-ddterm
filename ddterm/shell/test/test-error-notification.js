#!/usr/bin/env gjs

// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

const { GLib, Gio } = imports.gi;

function generate_error() {
    return new Error('Test error message');
}

function generate_error_log() {
    const err = generate_error();
    return [err.toString(), err.stack].join('\n');
}

const message = 'Test error';
const error_log = [generate_error_log()];

for (let i = 0; i < 100; i++)
    error_log.push(`Extra line ${i}`);

Gio.DBus.session.call_sync(
    'org.gnome.Shell',
    '/org/gnome/Shell/Extensions/ddterm',
    'com.github.amezin.ddterm.Extension',
    'Error',
    new GLib.Variant('(ss)', [message, error_log.join('\n')]),
    null,
    Gio.DBusCallFlags.NONE,
    -1,
    null
);
