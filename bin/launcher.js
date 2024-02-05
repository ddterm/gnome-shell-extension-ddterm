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

const { GLib, GObject } = imports.gi;

const System = imports.system;

GObject.gtypeNameBasedOnJSPath = true;

GLib.set_prgname('com.github.amezin.ddterm');

function split_path(pathname) {
    const after_root = GLib.path_skip_root(pathname);
    const root = pathname.substr(0, pathname.length - after_root.length);
    const parts = after_root.split(GLib.DIR_SEPARATOR_S);

    parts.unshift(root);
    return parts;
}

function realpath(filename) {
    let parts = split_path(filename);
    let resolved = parts[0];
    let n_resolved = 1;

    while (n_resolved < parts.length) {
        const try_filename = GLib.build_filenamev([resolved, parts[n_resolved]]);

        if (!GLib.file_test(try_filename, GLib.FileTest.IS_SYMLINK)) {
            resolved = try_filename;
            n_resolved++;
            continue;
        }

        const target = GLib.canonicalize_filename(GLib.file_read_link(try_filename), resolved);
        const target_parts = split_path(target);
        let new_n_resolved = 1;

        while (
            new_n_resolved < n_resolved &&
            new_n_resolved < target_parts.length &&
            target_parts[new_n_resolved] === parts[new_n_resolved]
        )
            new_n_resolved++;

        parts = target_parts.concat(parts.slice(n_resolved + 1));

        if (n_resolved !== new_n_resolved) {
            n_resolved = new_n_resolved;
            resolved = GLib.build_filenamev(target_parts.slice(0, new_n_resolved));
        }
    }

    return resolved;
}

const this_file = realpath(System.programPath);
const bin_dir = GLib.path_get_dirname(this_file);
const launcher_in_path = GLib.find_program_in_path('com.github.amezin.ddterm');

if (!launcher_in_path || this_file !== realpath(launcher_in_path)) {
    const current_env_path = GLib.getenv('PATH') ?? '';
    const new_env_path =
        GLib.build_pathv(GLib.SEARCHPATH_SEPARATOR_S, [bin_dir, current_env_path]);

    GLib.setenv('PATH', new_env_path, true);
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

const base_uri = GLib.filename_to_uri(bin_dir, null);

function import_sync(uri) {
    const resolved_uri =
        GLib.Uri.resolve_relative(base_uri, uri, GLib.UriFlags.NONE);

    return resolve_sync(import(resolved_uri));
}

let app_module;

try {
    app_module = import_sync('ddterm/app/application.js');
} catch (ex) {
    if (ex.name === 'MissingDependenciesError')
        System.exit(1);

    throw ex;
}

const app = new app_module.Application({
    application_id: 'com.github.amezin.ddterm',
    register_session: true,
});

System.exit(app.run([System.programInvocationName, ...System.programArgs]));
