// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const uri = GLib.Uri.resolve_relative(import.meta.url, '../..', GLib.UriFlags.NONE);

export const dir = Gio.File.new_for_uri(uri);
export const path = dir.get_path();

function load() {
    const [, bytes] = GLib.file_get_contents(GLib.build_filenamev([path, 'metadata.json']));

    return JSON.parse(new TextDecoder().decode(bytes));
}

export const metadata = load();

export default metadata;

export const { name, uuid } = metadata;

function get_settings_schema_source() {
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
    const settings_schema = get_settings_schema_source().lookup(settings_schema_name, true);

    if (!settings_schema) {
        throw new Error(
            `Schema ${settings_schema_name} could not be found. Please check your installation`
        );
    }

    return new Gio.Settings({ settings_schema });
}
