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

const Me = imports.misc.extensionUtils.getCurrentExtension();

class File {
    constructor(source_file, target_file) {
        // `<string> instanceof Gio.File` causes a crash
        if (!(source_file instanceof GObject.Object))
            source_file = Gio.File.new_for_path(source_file);

        if (!(target_file instanceof GObject.Object))
            target_file = Gio.File.new_for_path(target_file);

        this.content = ByteArray.toString(source_file.load_contents(null)[1]);
        this.target_file = target_file;
    }

    configure(mapping) {
        for (const [key, value] of Object.entries(mapping))
            this.content = this.content.replace(new RegExp(`@${key}@`, 'g'), value);
    }

    install() {
        GLib.mkdir_with_parents(this.target_file.get_parent().get_path(), 0o700);

        let existing_content = null;

        try {
            existing_content = this.target_file.load_contents(null)[1];
        } catch {
        }

        const new_content = ByteArray.fromString(this.content);

        if (existing_content &&
            existing_content.length === new_content.length &&
            existing_content.every((v, i) => v === new_content[i]))
            return false;

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
            logError(e);
        }
    }
}

var Installer = class Installer {
    constructor() {
        const configure_vars = {
            LAUNCHER: Me.dir.get_child('com.github.amezin.ddterm').get_path(),
        };

        this.desktop_entry = new File(
            Me.dir.get_child('ddterm').get_child('com.github.amezin.ddterm.desktop.in'),
            GLib.build_filenamev([
                GLib.get_user_data_dir(),
                'applications',
                'com.github.amezin.ddterm.desktop',
            ])
        );

        this.desktop_entry.configure(configure_vars);

        this.dbus_service = new File(
            Me.dir.get_child('ddterm').get_child('com.github.amezin.ddterm.service.in'),
            GLib.build_filenamev([
                GLib.get_user_runtime_dir(),
                'dbus-1',
                'services',
                'com.github.amezin.ddterm.service',
            ])
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
