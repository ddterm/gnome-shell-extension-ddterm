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
