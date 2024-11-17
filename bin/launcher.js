#!@GJS_SHEBANG@

// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

/*
    To have the correct process name, the launcher has to be a GJS script.
    Not a shell script exec'ing gjs.
*/

const { GLib, GObject } = imports.gi;

const System = imports.system;

GObject.gtypeNameBasedOnJSPath = true;

GLib.set_prgname('@APP_ID@');

function realpath(filename) {
    const remaining = [];

    for (;;) {
        const parent = GLib.path_get_dirname(filename);

        if (parent === filename)
            break;

        remaining.push(GLib.path_get_basename(filename));
        filename = parent;
    }

    let resolved = filename;
    let resolved_parents = [filename];

    while (remaining.length) {
        const next_filename = GLib.build_filenamev([resolved, remaining.pop()]);

        if (!GLib.file_test(next_filename, GLib.FileTest.IS_SYMLINK)) {
            resolved = next_filename;
            resolved_parents.push(resolved);
            continue;
        }

        let target =
            GLib.canonicalize_filename(GLib.file_read_link(next_filename), resolved);

        while (resolved !== target) {
            if (resolved.length >= target.length && resolved_parents.length > 1) {
                resolved_parents.pop();
                resolved = resolved_parents[resolved_parents.length - 1];
            } else {
                const parent = GLib.path_get_dirname(target);

                if (parent === target) {
                    resolved = target;
                    resolved_parents = [target];
                    break;
                }

                remaining.push(GLib.path_get_basename(target));
                target = parent;
            }
        }
    }

    return resolved;
}

const this_file = realpath(System.programPath);
const this_file_name = GLib.path_get_basename(this_file);
const bin_dir = GLib.path_get_dirname(this_file);
const launcher_in_path = GLib.find_program_in_path(this_file_name);

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

const this_file_uri = GLib.filename_to_uri(this_file, null);
const app_module_uri =
    GLib.Uri.resolve_relative(this_file_uri, '@APP_MODULE@', GLib.UriFlags.NONE);

let app_module;

try {
    app_module = resolve_sync(import(app_module_uri));
} catch (ex) {
    if (ex.name === 'MissingDependenciesError')
        System.exit(1);

    throw ex;
}

const app = new app_module.Application({
    application_id: '@APP_ID@',
    register_session: true,
});

System.exit(app.run([System.programInvocationName, ...System.programArgs]));
