/*
    Copyright © 2021 Aleksandr Mezin

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

imports.gi.versions.Gdk = '4.0';
imports.gi.versions.Gtk = '4.0';

const System = imports.system;
const { GObject, Gio, Gtk } = imports.gi;

const APP_DATA_DIR = Gio.File.new_for_commandline_arg(System.programInvocationName).get_parent().get_parent();

imports.searchPath.unshift(APP_DATA_DIR.get_path());

const Me = imports.misc.extensionUtils.getCurrentExtension();

Me.dir = APP_DATA_DIR;

const { PrefsWidget } = imports.prefs;

var PrefsDialog = GObject.registerClass(
    {
        Properties: {
            settings: GObject.ParamSpec.object('settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings),
        },
    },
    class PrefsDialog extends Gtk.Window {
        _init(params) {
            super._init(params);

            this.set_child(new PrefsWidget({
                settings: this.settings,
            }));
        }
    }
);

const Application = GObject.registerClass(
    class Application extends Gtk.Application {
        _init(params) {
            super._init(params);

            this.connect('startup', this.startup.bind(this));
            this.connect('activate', this.activate.bind(this));
        }

        startup() {
            const settings_source = Gio.SettingsSchemaSource.new_from_directory(
                APP_DATA_DIR.get_child('schemas').get_path(),
                Gio.SettingsSchemaSource.get_default(),
                false
            );

            this.settings = new Gio.Settings({
                settings_schema: settings_source.lookup('com.github.amezin.ddterm', true),
            });
        }

        activate() {
            this.preferences();
        }

        preferences() {
            const prefs_dialog = new PrefsDialog({
                settings: this.settings,
                application: this,
            });

            prefs_dialog.show();
        }
    }
);

const app = new Application();
app.run([System.programInvocationName].concat(ARGV));
