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

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

function arrays_equal(a, b) {
    if (a.length !== b.length)
        return false;

    return a.every((v, i) => v === b[i]);
}

class File {
    constructor(source_file, target_file, fallback_files = []) {
        const [, content_bytes] = GLib.file_get_contents(source_file);
        this.content = new TextDecoder().decode(content_bytes);

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
                const [, content_bytes] = GLib.file_get_contents(existing_file);

                return content_bytes;
            } catch (ex) {
                if (!ex.matches(GLib.file_error_quark(), GLib.FileError.NOENT))
                    logError(ex, `Can't read ${JSON.stringify(existing_file)}`);
            }
        }

        return null;
    }

    install() {
        const new_content = new TextEncoder().encode(this.content);
        const existing_content = this.get_existing_content();

        if (existing_content && arrays_equal(existing_content, new_content))
            return false;

        GLib.mkdir_with_parents(
            GLib.path_get_dirname(this.target_file),
            0o700
        );

        this.uninstall();

        GLib.file_set_contents_full(
            this.target_file,
            new_content,
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
    constructor(src_dir, launcher_path) {
        const configure_vars = {
            LAUNCHER: launcher_path,
        };

        const system_data_dirs = GLib.get_system_data_dirs();

        this.desktop_entry = new File(
            GLib.build_filenamev([src_dir, 'com.github.amezin.ddterm.desktop.in']),
            desktop_entry_path(GLib.get_user_data_dir()),
            system_data_dirs.map(desktop_entry_path)
        );

        this.desktop_entry.configure(configure_vars);

        this.dbus_service = new File(
            GLib.build_filenamev([src_dir, 'com.github.amezin.ddterm.service.in']),
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
