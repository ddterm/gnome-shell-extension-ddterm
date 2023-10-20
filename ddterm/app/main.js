/*
    Copyright © 2020, 2021 Aleksandr Mezin

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

import Gettext from 'gettext';
import System from 'system';

const ByteArray = imports.byteArray;

GLib.set_prgname('com.github.amezin.ddterm');

GObject.gtypeNameBasedOnJSPath = true;

const ME_DIR = Gio.File.new_for_uri(
    GLib.Uri.resolve_relative(import.meta.url, '../..', GLib.UriFlags.NONE)
);

imports.searchPath.unshift(ME_DIR.get_path());

function load_metadata(install_dir) {
    const metadata_file = install_dir.get_child('metadata.json');
    const [ok_, metadata_bytes] = metadata_file.load_contents(null);
    const metadata_str = ByteArray.toString(metadata_bytes);

    return JSON.parse(metadata_str);
}

const metadata = load_metadata(ME_DIR);

Gettext.bindtextdomain(metadata['gettext-domain'], ME_DIR.get_child('locale').get_path());
Gettext.textdomain(metadata['gettext-domain']);

/* fake current extension object to make 'Me.imports' and 'Me.dir' work in application context */
Object.assign(imports.misc.extensionUtils.getCurrentExtension(), { imports, dir: ME_DIR });

imports.ddterm.app.dependencies.gi_require(ME_DIR, {
    'Gtk': '3.0',
    'Gdk': '3.0',
    'Pango': '1.0',
    'Vte': '2.91',
});

const app = new imports.ddterm.app.application.Application({
    application_id: 'com.github.amezin.ddterm',
    register_session: true,
    install_dir: ME_DIR,
    metadata,
});

System.exit(app.run([System.programInvocationName].concat(ARGV)));
