// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Pedro Sader Azevedo
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

function get_file_contents_utf8(file) {
    return new Promise((resolve, reject) => {
        file.load_contents_async(null, (source, result) => {
            try {
                const [, contents] = source.load_contents_finish(result);

                resolve(new TextDecoder().decode(contents));
            } catch (ex) {
                reject(ex);
            }
        });
    });
}

function mkdir(file) {
    return new Promise((resolve, reject) => {
        file.make_directory_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
            try {
                resolve(source.make_directory_finish(result));
            } catch (ex) {
                reject(ex);
            }
        });
    });
}

async function mkdir_with_parents(file) {
    const missing_parent_dirs = [];

    while (file) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await mkdir(file);

            break;
        } catch (ex) {
            if (missing_parent_dirs.length === 0 &&
                ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.EXISTS))
                break;

            if (!ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND))
                throw ex;
        }

        missing_parent_dirs.push(file);
        file = file.get_parent();
    }

    while (missing_parent_dirs.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await mkdir(missing_parent_dirs.pop());
    }
}

function file_set_contents(file, contents) {
    return new Promise((resolve, reject) => {
        file.replace_contents_bytes_async(
            contents,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null,
            (source, result) => {
                try {
                    const [ok] = source.replace_contents_finish(result);

                    resolve(ok);
                } catch (ex) {
                    reject(ex);
                }
            }
        );
    });
}

class File {
    constructor(source_url, target_path, fallback_paths = []) {
        this.source_file = Gio.File.new_for_uri(
            GLib.Uri.resolve_relative(import.meta.url, source_url, GLib.UriFlags.NONE)
        );

        this.target_file = Gio.File.new_for_path(target_path);
        this.fallback_files = fallback_paths.map(path => Gio.File.new_for_path(path));
    }

    async get_existing_contents() {
        for (const existing_file of [this.target_file, ...this.fallback_files]) {
            try {
                // eslint-disable-next-line no-await-in-loop
                return await get_file_contents_utf8(existing_file);
            } catch (ex) {
                if (!ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND))
                    logError(ex, `Can't read ${JSON.stringify(existing_file.get_path())}`);
            }
        }

        return null;
    }

    async install(configure_vars) {
        let contents = await get_file_contents_utf8(this.source_file);

        for (const [key, value] of Object.entries(configure_vars))
            contents = contents.replace(new RegExp(`@${key}@`, 'g'), value);

        const existing_contents = await this.get_existing_contents();

        if (contents === existing_contents)
            return false;

        await mkdir_with_parents(this.target_file.get_parent());
        return file_set_contents(this.target_file, new TextEncoder().encode(contents));
    }

    uninstall() {
        return new Promise((resolve, reject) => {
            this.target_file.delete_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
                try {
                    resolve(source.delete_finish(result));
                } catch (ex) {
                    if (ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND))
                        resolve(false);
                    else
                        reject(ex);
                }
            });
        });
    }
}

function desktop_entry_path(basedir) {
    return GLib.build_filenamev(
        [basedir, 'applications', 'com.github.amezin.ddterm.desktop']
    );
}

function dbus_service_path(basedir) {
    return GLib.build_filenamev(
        [basedir, 'dbus-1', 'services', 'com.github.amezin.ddterm.service']
    );
}

function reload_dbus_daemon_config() {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ReloadConfig',
            null,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (source, result) => {
                try {
                    resolve(source.call_finish(result));
                } catch (ex) {
                    reject(ex);
                }
            }
        );
    });
}

let in_progress = null;

export class Installer {
    constructor(launcher_path) {
        const [icon_path] = GLib.filename_from_uri(GLib.Uri.resolve_relative(
            import.meta.url,
            '../../data/com.github.amezin.ddterm.svg',
            GLib.UriFlags.NONE
        ));

        this.configure_vars = {
            LAUNCHER: launcher_path,
            ICON: icon_path,
        };

        const system_data_dirs = GLib.get_system_data_dirs();

        this.desktop_entry = new File(
            '../../data/com.github.amezin.ddterm.desktop.in',
            desktop_entry_path(GLib.get_user_data_dir()),
            system_data_dirs.map(desktop_entry_path)
        );

        this.dbus_service = new File(
            '../../data/com.github.amezin.ddterm.service.in',
            dbus_service_path(GLib.get_user_runtime_dir()),
            system_data_dirs.map(dbus_service_path)
        );
    }

    async #install() {
        const results = await Promise.allSettled([
            this.dbus_service.install(this.configure_vars).then(
                changed => changed ? reload_dbus_daemon_config() : undefined
            ),
            this.desktop_entry.install(this.configure_vars),
        ]);

        const errors = results.map(result => result.reason).filter(Boolean);

        if (errors.length > 0)
            throw errors.length === 1 ? errors[0] : new AggregateError(errors);
    }

    async #uninstall() {
        const results = await Promise.allSettled([
            this.dbus_service.uninstall(),
            this.desktop_entry.uninstall(),
        ]);

        const errors = results.map(result => result.reason).filter(Boolean);

        if (errors.length > 0)
            throw errors.length === 1 ? errors[0] : new AggregateError(errors);
    }

    async install() {
        while (in_progress)
            await in_progress.catch(() => {}); // eslint-disable-line no-await-in-loop

        in_progress = this.#install();

        try {
            await in_progress;
        } finally {
            in_progress = null;
        }
    }

    async uninstall() {
        while (in_progress)
            await in_progress.catch(() => {}); // eslint-disable-line no-await-in-loop

        in_progress = this.#uninstall();

        try {
            await in_progress;
        } finally {
            in_progress = null;
        }
    }
}
