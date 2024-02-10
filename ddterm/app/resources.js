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

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

export function get_resource_file(file_or_relative_url) {
    // 'instanceof Gio.File' with non-GObject instances can crash some GJS versions
    if (file_or_relative_url instanceof GObject.Object && file_or_relative_url instanceof Gio.File)
        return file_or_relative_url;

    return Gio.File.new_for_uri(
        GLib.Uri.resolve_relative(import.meta.url, file_or_relative_url, GLib.UriFlags.NONE)
    );
}

export function get_resource_binary(file_or_relative_url) {
    const [, bytes] = get_resource_file(file_or_relative_url).load_contents(null);
    return bytes;
}

export function get_resource_text(file_or_relative_url) {
    const bytes = get_resource_binary(file_or_relative_url);
    // BEGIN !ESM
    if (!globalThis.TextDecoder)
        return imports.byteArray.toString(bytes);
    // END !ESM
    return new TextDecoder().decode(bytes);
}
