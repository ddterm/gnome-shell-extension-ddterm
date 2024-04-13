/*
    Copyright © 2024 Aleksandr Mezin

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
    // BEGIN ESM
    'Handy': '1',
    // END ESM
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
