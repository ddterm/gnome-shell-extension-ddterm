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

'use strict';

const { Gio } = imports.gi;

const SCHEMA_NAME = 'com.github.amezin.ddterm';

function get_schema_source(me_dir) {
    const default_source = Gio.SettingsSchemaSource.get_default();
    const schema_dir = me_dir.get_child('schemas');

    if (!schema_dir.query_exists(null))
        return default_source;

    return Gio.SettingsSchemaSource.new_from_directory(
        schema_dir.get_path(),
        default_source,
        false
    );
}

function get_schema(me_dir) {
    return get_schema_source(me_dir).lookup(SCHEMA_NAME, true);
}

function get_settings(me_dir) {
    const schema = get_schema(me_dir);
    if (!schema)
        throw new Error(`Schema ${SCHEMA_NAME} could not be found. Please check your installation`);

    return new Gio.Settings({ settings_schema: schema });
}

/* exported get_settings */
