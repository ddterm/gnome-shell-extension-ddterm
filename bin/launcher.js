#!@GJS@

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

const { GLib, GObject, Gio } = imports.gi;

const System = imports.system;
const Gettext = imports.gettext;

GObject.gtypeNameBasedOnJSPath = true;

GLib.set_prgname('com.github.amezin.ddterm');

function resolve_symlink(file) {
    if (!(file instanceof GObject.Object))
        file = Gio.File.new_for_path(file);

    for (;;) {
        const info = file.query_info(
            Gio.FILE_ATTRIBUTE_STANDARD_SYMLINK_TARGET,
            Gio.FileQueryInfoFlags.NONE,
            null
        );

        if (!info.has_attribute(Gio.FILE_ATTRIBUTE_STANDARD_SYMLINK_TARGET))
            return file;

        const link = info.get_symlink_target();

        if (GLib.path_is_absolute(link))
            file = Gio.File.new_for_path(link);
        else
            file = file.get_child(link);
    }
}

const this_file = resolve_symlink(System.programPath);
const bin_dir = resolve_symlink(this_file.get_parent());

const launcher_in_path = GLib.find_program_in_path('com.github.amezin.ddterm');
const launcher_in_path_file =
    launcher_in_path ? resolve_symlink(launcher_in_path) : null;

if (!launcher_in_path_file?.equal(this_file)) {
    const items = GLib.getenv('PATH')?.split(GLib.SEARCHPATH_SEPARATOR_S) ?? [];
    items.unshift(bin_dir.get_path());
    GLib.setenv('PATH', items.join(GLib.SEARCHPATH_SEPARATOR_S), true);
}

function resolve_sync(promise) {
    const loop = GLib.MainLoop.new(null, false);
    let result;
    let error;

    promise.then(res => {
        result = res;
    }).catch(ex => {
        error = ex;
    }).finally(() => {
        loop.quit();
    });

    loop.run();

    if (error)
        throw error;

    return result;
}

const base_uri = bin_dir.get_uri();

function import_sync(uri) {
    const resolved_uri =
        GLib.Uri.resolve_relative(base_uri, uri, GLib.UriFlags.NONE);

    return resolve_sync(import(resolved_uri));
}

const { metadata, dir } = import_sync('ddterm/app/meta.js');

Gettext.bindtextdomain(metadata['gettext-domain'], dir.get_child('locale').get_path());
Gettext.textdomain(metadata['gettext-domain']);

const { gi_require } = import_sync('ddterm/app/dependencies.js');

gi_require({
    'Gtk': '3.0',
    'Gdk': '3.0',
    'Pango': '1.0',
    'Vte': '2.91',
});

const app_module = import_sync('ddterm/app/application.js');

const app = new app_module.Application({
    application_id: 'com.github.amezin.ddterm',
    register_session: true,
});

System.exit(app.run([System.programInvocationName, ...System.programArgs]));
