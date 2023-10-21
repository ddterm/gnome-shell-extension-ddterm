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
import Gio from 'gi://Gio';

import './encoding.js';

export const dir = Gio.File.new_for_uri(
    GLib.Uri.resolve_relative(import.meta.url, '../..', GLib.UriFlags.NONE)
);

function load_metadata() {
    const [ok_, bytes] = dir.get_child('metadata.json').load_contents(null);

    return JSON.parse(new TextDecoder().decode(bytes));
}

export const metadata = load_metadata();
export default metadata;

export const { name, uuid, version } = metadata;
