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

const { GObject, Gtk } = imports.gi;

var Resources = GObject.registerClass(
    {
        Properties: {
            'menus': GObject.ParamSpec.object(
                'menus',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gtk.Builder
            ),
            'style': GObject.ParamSpec.object(
                'style',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gtk.CssProvider
            ),
        },
    },
    class DDTermAppResources extends GObject.Object {
        static load(path) {
            const app_dir = path.get_child('ddterm').get_child('app');

            const menus = Gtk.Builder.new_from_file(app_dir.get_child('menus.ui').get_path());

            const style = Gtk.CssProvider.new();
            style.load_from_path(app_dir.get_child('style.css').get_path());

            return new Resources({
                menus,
                style,
            });
        }
    }
);

/* exported Resources */
