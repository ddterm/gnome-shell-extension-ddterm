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
        'desktop-color-scheme': GObject.ParamSpec.string(
            'desktop-color-scheme',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'default'
        ),
        'theme-variant': GObject.ParamSpec.string(
            'theme-variant',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'system'
        ),
    },
},
class DDTermGtkThemeManager extends GObject.Object {
    _init(params) {
        super._init(params);

        this.connect('notify::theme-variant', this._update.bind(this));
        this.connect('notify::desktop-color-scheme', this._update.bind(this));
        this._update();
    }

    _get_desktop_settings_theme_variant() {
        switch (this.desktop_color_scheme) {
        case 'prefer-dark':
            return 'dark';

        case 'prefer-light':
            return 'light';

        case 'default':
            return 'system';

        default:
            logError(new Error(`Unknown color-scheme: ${this.desktop_color_scheme}`));
            return 'system';
        }
    }

    _update() {
        const theme_variant = this.theme_variant === 'system'
            ? this._get_desktop_settings_theme_variant()
            : this.theme_variant;

        switch (theme_variant) {
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
            logError(new Error(`Unknown theme-variant: ${theme_variant}`));
        }
    }
});
