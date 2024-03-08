#!/usr/bin/env gjs

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
