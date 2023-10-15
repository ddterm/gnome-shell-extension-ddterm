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

const { GLib, GObject, Gio } = imports.gi;
const ByteArray = imports.byteArray;

function to_gio_file(file_or_path) {
    // `<string> instanceof Gio.File` causes a crash!
    if (file_or_path instanceof GObject.Object && file_or_path instanceof Gio.File)
        return file_or_path;

    return Gio.File.new_for_path(file_or_path);
}

class File {
    constructor(source_file, target_file, fallback_files = []) {
        this.content = ByteArray.toString(
            to_gio_file(source_file).load_contents(null)[1]
        );

        this.target_file = to_gio_file(target_file);
        this.fallback_files = fallback_files.map(to_gio_file);
    }

    configure(mapping) {
        for (const [key, value] of Object.entries(mapping))
            this.content = this.content.replace(new RegExp(`@${key}@`, 'g'), value);
    }

    get_existing_content() {
        for (const existing_file of [this.target_file, ...this.fallback_files]) {
            try {
                return existing_file.load_contents(null)[1];
            } catch (ex) {
                if (!ex.matches(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND))
                    logError(ex, `Can't read ${JSON.stringify(existing_file.get_path())}`);
            }
        }

        return null;
    }

    install() {
        const new_content = ByteArray.fromString(this.content);
        const existing_content = this.get_existing_content();

        if (existing_content &&
            existing_content.length === new_content.length &&
            existing_content.every((v, i) => v === new_content[i]))
            return false;

        GLib.mkdir_with_parents(this.target_file.get_parent().get_path(), 0o700);

        this.target_file.replace_contents(
            new_content,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );

        return true;
    }

    uninstall() {
        try {
            this.target_file.delete(null);
        } catch (e) {
            if (!e.matches(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND))
                logError(e, `Can't delete ${JSON.stringify(this.target_file.get_path())}`);
        }
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

var Installer = class Installer {
    constructor(src_dir, launcher_path) {
        src_dir = to_gio_file(src_dir);

        const configure_vars = {
            LAUNCHER: to_gio_file(launcher_path).get_path(),
        };

        const system_data_dirs = GLib.get_system_data_dirs();

        this.desktop_entry = new File(
            src_dir.get_child('com.github.amezin.ddterm.desktop.in'),
            desktop_entry_path(GLib.get_user_data_dir()),
            system_data_dirs.map(desktop_entry_path)
        );

        this.desktop_entry.configure(configure_vars);

        this.dbus_service = new File(
            src_dir.get_child('com.github.amezin.ddterm.service.in'),
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
};

/* exported Installer */
