// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Pedro Sader Azevedo
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

class File {
    constructor(source_url, target_file, fallback_files = []) {
        const [source_file] = GLib.filename_from_uri(
            GLib.Uri.resolve_relative(import.meta.url, source_url, GLib.UriFlags.NONE)
        );

        this.content = Shell.get_file_contents_utf8_sync(source_file);
        this.target_file = target_file;
        this.fallback_files = fallback_files;
    }

    configure(mapping) {
        for (const [key, value] of Object.entries(mapping))
            this.content = this.content.replace(new RegExp(`@${key}@`, 'g'), value);
    }

    get_existing_content() {
        for (const existing_file of [this.target_file, ...this.fallback_files]) {
            try {
                return Shell.get_file_contents_utf8_sync(existing_file);
            } catch (ex) {
                if (!ex.matches(GLib.file_error_quark(), GLib.FileError.NOENT))
                    logError(ex, `Can't read ${JSON.stringify(existing_file)}`);
            }
        }

        return null;
    }

    install() {
        const existing_content = this.get_existing_content();

        if (this.content === existing_content)
            return false;

        GLib.mkdir_with_parents(
            GLib.path_get_dirname(this.target_file),
            0o700
        );

        this.uninstall();

        GLib.file_set_contents_full(
            this.target_file,
            this.content,
            GLib.FileSetContentsFlags.NONE,
            0o600
        );

        return true;
    }

    uninstall() {
        GLib.unlink(this.target_file);
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

export class Installer {
    constructor(launcher_path) {
        const [icon_path] = GLib.filename_from_uri(GLib.Uri.resolve_relative(
            import.meta.url,
            '../../data/com.github.amezin.ddterm.svg',
            GLib.UriFlags.NONE
        ));

        const configure_vars = {
            LAUNCHER: launcher_path,
            ICON: icon_path,
        };

        const system_data_dirs = GLib.get_system_data_dirs();

        this.desktop_entry = new File(
            '../../data/com.github.amezin.ddterm.desktop.in',
            desktop_entry_path(GLib.get_user_data_dir()),
            system_data_dirs.map(desktop_entry_path)
        );

        this.desktop_entry.configure(configure_vars);

        this.dbus_service = new File(
            '../../data/com.github.amezin.ddterm.service.in',
            dbus_service_path(GLib.get_user_runtime_dir()),
            system_data_dirs.map(dbus_service_path)
        );

        this.dbus_service.configure(configure_vars);
    }

    install() {
        this.desktop_entry.install();

        if (this.dbus_service.install()) {
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
                null
            );
        }
    }

    uninstall() {
        this.desktop_entry.uninstall();
        this.dbus_service.uninstall();
    }
}
