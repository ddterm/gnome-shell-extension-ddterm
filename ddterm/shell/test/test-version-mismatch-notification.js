#!/usr/bin/env gjs

// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

const { Gio } = imports.gi;

Gio.DBus.session.call_sync(
    'org.gnome.Shell',
    '/org/gnome/Shell/Extensions/ddterm',
    'com.github.amezin.ddterm.Extension',
    'VersionMismatch',
    null,
    null,
    Gio.DBusCallFlags.NONE,
    -1,
    null
);
