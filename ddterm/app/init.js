// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';

import Gi from 'gi';
import Gettext from 'gettext';
import { setConsoleLogDomain } from 'console';

import { metadata, dir } from './meta.js';
import { gi_require } from './dependencies.js';

setConsoleLogDomain(metadata['name']);

Gettext.bindtextdomain(metadata['gettext-domain'], dir.get_child('locale').get_path());
Gettext.textdomain(metadata['gettext-domain']);

gi_require({
    'Gtk': '4.0',
    'Gdk': '4.0',
    'Pango': '1.0',
    'Vte': '3.91',
    'Adw': '1',
});

try {
    Gi.require('GdkX11', '4.0');
} catch (ex) {
    logError(ex);
}

GObject.Object.prototype.disconnect = function (id) {
    if (GObject.signal_handler_is_connected(this, id))
        GObject.signal_handler_disconnect(this, id);
    else
        logError(new Error(`Signal handler ${id} is not connected to ${this}`));
};
