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

import Gettext from 'gettext';

import { gi_require } from './dependencies.js';
import { dir, metadata } from './meta.js';

GLib.set_prgname('com.github.amezin.ddterm');

GObject.gtypeNameBasedOnJSPath = true;

Gettext.bindtextdomain(metadata['gettext-domain'], dir.get_child('locale').get_path());
Gettext.textdomain(metadata['gettext-domain']);

gi_require({
    'Gtk': '3.0',
    'Gdk': '3.0',
    'Pango': '1.0',
    'Vte': '2.91',
});
