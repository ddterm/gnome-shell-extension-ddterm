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

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

export const GtkThemeManager = GObject.registerClass({
    Properties: {
        'gtk-settings': GObject.ParamSpec.object(
            'gtk-settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gtk.Settings
        ),
        'theme-variant': GObject.ParamSpec.string(
            'theme-variant',
            '',
            '',
            GObject.ParamFlags.WRITABLE,
            null
        ),
    },
},
class DDTermGtkThemeManager extends GObject.Object {
    set theme_variant(value) {
        switch (value) {
        case 'system':
            this.gtk_settings.reset_property('gtk-application-prefer-dark-theme');
            break;

        case 'dark':
            this.gtk_settings.gtk_application_prefer_dark_theme = true;
            break;

        case 'light':
            this.gtk_settings.gtk_application_prefer_dark_theme = false;
            break;

        default:
            printerr(`Unknown theme-variant: ${value}`);
        }
    }
});
