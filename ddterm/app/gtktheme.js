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

import Gi from 'gi';

export const GtkThemeManager = GObject.registerClass({
    Properties: {
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
    _init(params) {
        super._init(params);

        this._gtk_settings = Gtk.Settings.get_default();

        try {
            this._handy = Gi.require('Handy', '1');
            this._handy_style_manager = this._handy.StyleManager?.get_default();
        } catch (ex) {
            logError(ex, "Can't load libhandy, color scheme switch might not work");
        }
    }

    set theme_variant(value) {
        switch (value) {
        case 'system':
            if (this._handy_style_manager?.system_supports_color_schemes)
                this._handy_style_manager.set_color_scheme(this._handy.ColorScheme.PREFER_LIGHT);
            else
                this._gtk_settings.reset_property('gtk-application-prefer-dark-theme');

            break;

        case 'dark':
            if (this._handy_style_manager?.system_supports_color_schemes)
                this._handy_style_manager.set_color_scheme(this._handy.ColorScheme.FORCE_DARK);
            else
                this._gtk_settings.gtk_application_prefer_dark_theme = true;

            break;

        case 'light':
            if (this._handy_style_manager?.system_supports_color_schemes)
                this._handy_style_manager.set_color_scheme(this._handy.ColorScheme.FORCE_LIGHT);
            else
                this._gtk_settings.gtk_application_prefer_dark_theme = false;
            break;

        default:
            throw new Error(`Unknown theme-variant: ${value}`);
        }
    }
});
