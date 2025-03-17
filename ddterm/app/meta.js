// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
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
    const [bytes] = get_resource_file(file_or_relative_url).load_bytes(null);
    return bytes;
}

export function get_resource_text(file_or_relative_url) {
    const bytes = get_resource_binary(file_or_relative_url);

    return new TextDecoder().decode(bytes);
}

export const dir = get_resource_file('../..');
export const metadata = JSON.parse(get_resource_text(dir.get_child('metadata.json')));
export default metadata;

export const { name, uuid, version } = metadata;

function get_schema_source() {
    const default_source = Gio.SettingsSchemaSource.get_default();
    const schema_dir = dir.get_child('schemas');

    if (!schema_dir.query_exists(null))
        return default_source;

    return Gio.SettingsSchemaSource.new_from_directory(
        schema_dir.get_path(),
        default_source,
        false
    );
}

export function get_settings() {
    const settings_schema_name = metadata['settings-schema'];
    const settings_schema = get_schema_source().lookup(settings_schema_name, true);

    if (!settings_schema) {
        throw new Error(
            `Schema ${settings_schema_name} could not be found. Please check your installation`
        );
    }

    return new Gio.Settings({ settings_schema });
}
