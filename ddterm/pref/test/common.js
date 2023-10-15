/*
    Copyright © 2022 Aleksandr Mezin

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

const { GObject, Gio, Gtk } = imports.gi;
const ByteArray = imports.byteArray;
const Gettext = imports.gettext;

const { dialog } = imports.ddterm.pref;

function load_metadata(install_dir) {
    const metadata_file = install_dir.get_child('metadata.json');
    const [ok_, metadata_bytes] = metadata_file.load_contents(null);
    const metadata_str = ByteArray.toString(metadata_bytes);

    return JSON.parse(metadata_str);
}

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

var Application = GObject.registerClass({
    Properties: {
        'install-dir': GObject.ParamSpec.object(
            'install-dir',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.File
        ),
    },
}, class Application extends Gtk.Application {
    _init(params) {
        super._init(params);

        this.connect('startup', this.startup.bind(this));
        this.connect('activate', this.activate.bind(this));
    }

    startup() {
        const metadata = load_metadata(this.install_dir);

        Gettext.bindtextdomain(
            metadata['gettext-domain'],
            this.install_dir.get_child('locale').get_path()
        );

        this.gettext_domain = Gettext.domain(metadata['gettext-domain']);

        const settings_schema =
            get_schema_source(this.install_dir).lookup(metadata['settings-schema'], true);

        this.settings = new Gio.Settings({ settings_schema });
    }

    activate() {
        this.preferences();
    }

    preferences() {
        const prefs_dialog = new dialog.PrefsDialog({
            settings: this.settings,
            application: this,
            gettext_context: this.gettext_domain,
        });

        prefs_dialog.show();
    }
});

/* exported Application */
