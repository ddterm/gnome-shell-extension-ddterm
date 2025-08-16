// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import Gettext from 'gettext';
import { setConsoleLogDomain } from 'console';

import { metadata, path } from './meta.js';
import { gi_require } from './dependencies.js';

setConsoleLogDomain(metadata['name']);

Gettext.bindtextdomain(metadata['gettext-domain'], GLib.build_filenamev([path, 'locale']));
Gettext.textdomain(metadata['gettext-domain']);

gi_require({
    'Gtk': '3.0',
    'Gdk': '3.0',
    'Pango': '1.0',
    'Vte': '2.91',
    'Handy': '1',
});

GObject.Object.prototype.disconnect = function (id) {
    if (GObject.signal_handler_is_connected(this, id))
        GObject.signal_handler_disconnect(this, id);
    else
        logError(new Error(`Signal handler ${id} is not connected to ${this}`));
};
