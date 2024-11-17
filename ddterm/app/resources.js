// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

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

    return new TextDecoder().decode(bytes);
}
