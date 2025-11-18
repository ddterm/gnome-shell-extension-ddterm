// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import Gettext from 'gettext';
import System from 'system';
import { setConsoleLogDomain } from 'console';

import { metadata, path } from './meta.js';
import { require, MissingDependencies } from '../util/gjs-typelib-installer.js';

setConsoleLogDomain(metadata['name']);

Gettext.bindtextdomain(metadata['gettext-domain'], GLib.build_filenamev([path, 'locale']));
Gettext.textdomain(metadata['gettext-domain']);

try {
    require({
        'Gtk': '3.0',
        'Gdk': '3.0',
        'Pango': '1.0',
        'Vte': '2.91',
        'Handy': '1',
    });
} catch (ex) {
    if (!(ex instanceof MissingDependencies))
        throw ex;

    const message_lines = [
        Gettext.gettext('ddterm needs additional packages to run'),
    ];

    const packages = Array.from(ex.packages);
    const files = Array.from(ex.files);

    if (packages.length > 0) {
        message_lines.push(
            Gettext.gettext('Please install the following packages:'),
            packages.join(' ')
        );
    }

    if (files.length > 0) {
        message_lines.push(
            Gettext.gettext('Please install packages that provide the following files:'),
            files.join(' ')
        );
    }

    printerr(message_lines.join('\n'));

    Gio.DBus.session.call_sync(
        'org.gnome.Shell',
        '/org/gnome/Shell/Extensions/ddterm',
        'com.github.amezin.ddterm.Extension',
        'MissingDependencies',
        GLib.Variant.new_tuple([
            GLib.Variant.new_strv(packages),
            GLib.Variant.new_strv(files),
        ]),
        null,
        Gio.DBusCallFlags.NO_AUTO_START,
        2000,
        null
    );

    System.exit(1);
}

GObject.Object.prototype.disconnect = function (id) {
    if (GObject.signal_handler_is_connected(this, id))
        GObject.signal_handler_disconnect(this, id);
    else
        logError(new Error(`Signal handler ${id} is not connected to ${this}`));
};
