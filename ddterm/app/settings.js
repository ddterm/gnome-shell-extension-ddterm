// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';

import { dir, metadata } from './meta.js';

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
