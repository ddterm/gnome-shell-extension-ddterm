// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import Gettext from 'gettext';

import { metadata, dir } from './meta.js';
import { gi_require } from './dependencies.js';

Gettext.bindtextdomain(metadata['gettext-domain'], dir.get_child('locale').get_path());
Gettext.textdomain(metadata['gettext-domain']);

gi_require({
    'Gtk': '3.0',
    'Gdk': '3.0',
    'Pango': '1.0',
    'Vte': '2.91',
    'Handy': '1',
});

function get_heapgraph_name(obj) {
    const gtypename = obj.constructor.$gtype.name;

    /* Template literals don't work in __heapgraph_name! */

    if (obj instanceof Gio.Action)
        return [gtypename, '(', obj.name, ')'].join('');

    return gtypename;
}

function set_heapgraph_name(obj) {
    if (!obj.__heapgraph_name)
        obj.__heapgraph_name = get_heapgraph_name(obj);
}

const old_connect = GObject.Object.prototype.connect;
const old_connect_after = GObject.Object.prototype.connect_after;

GObject.Object.prototype.connect = function (signal, handler) {
    set_heapgraph_name(this);

    handler.__heapgraph_name = [this.__heapgraph_name, signal].join('.');

    return old_connect.call(this, signal, handler);
};

GObject.Object.prototype.connect_after = function (signal, handler) {
    set_heapgraph_name(this);

    handler.__heapgraph_name = [this.__heapgraph_name, signal].join('.');

    return old_connect_after.call(this, signal, handler);
};
