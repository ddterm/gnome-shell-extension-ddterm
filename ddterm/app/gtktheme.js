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
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gi_require_optional } from './dependencies.js';

const { Handy } = gi_require_optional({ 'Handy': '1' });

export const ThemeManager = GObject.registerClass({
    Properties: {
        'theme-variant': GObject.ParamSpec.string(
            'theme-variant',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'system'
        ),
    },
}, class DDTermThemeManager extends GObject.Object {
    static create(theme_variant, desktop_settings) {
        Handy?.init();

        const style_manager = Handy?.StyleManager?.get_default();

        if (style_manager)
            return new HandyThemeManager({ style_manager, theme_variant });

        const gtk_settings = Gtk.Settings.get_default();

        if (!desktop_settings.settings_schema.has_key('color-scheme'))
            return new GtkThemeManager({ gtk_settings, theme_variant });

        const desktop_color_scheme = desktop_settings.get_string('color-scheme');

        const theme_manager = new DesktopSettingsThemeManager({
            gtk_settings,
            desktop_color_scheme,
            theme_variant,
        });

        desktop_settings.bind(
            'color-scheme',
            theme_manager,
            'desktop-color-scheme',
            Gio.SettingsBindFlags.GET
        );

        return theme_manager;
    }
});

const GtkThemeManager = GObject.registerClass({
    Properties: {
        'gtk-settings': GObject.ParamSpec.object(
            'gtk-settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gtk.Settings
        ),
    },
}, class DDTermThemeManagerGtk extends ThemeManager {
    _init(params) {
        super._init(params);

        this.connect('notify::theme-variant', () => this._update());
        this._update();
    }

    _set_system_theme() {
        this.gtk_settings.reset_property('gtk-application-prefer-dark-theme');
    }

    _update() {
        switch (this.theme_variant) {
        case 'system':
            this._set_system_theme();
            break;

        case 'dark':
            this.gtk_settings.gtk_application_prefer_dark_theme = true;
            break;

        case 'light':
            this.gtk_settings.gtk_application_prefer_dark_theme = false;
            break;

        default:
            logError(new Error(`Unknown theme-variant: ${this.theme_variant}`));
        }
    }
});

const DesktopSettingsThemeManager = GObject.registerClass({
    Properties: {
        'desktop-color-scheme': GObject.ParamSpec.string(
            'desktop-color-scheme',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'default'
        ),
    },
}, class DDTermThemeManagerDesktopSettings extends GtkThemeManager {
    _init(params) {
        super._init(params);

        this.connect('notify::desktop-color-scheme', () => this._update());
    }

    _set_system_theme() {
        switch (this.desktop_color_scheme) {
        case 'prefer-dark':
            this.gtk_settings.gtk_application_prefer_dark_theme = true;
            break;

        case 'prefer-light':
            this.gtk_settings.gtk_application_prefer_dark_theme = false;
            break;

        case 'default':
            super._set_system_theme();
            break;

        default:
            logError(new Error(`Unknown color-scheme: ${this.desktop_color_scheme}`));
        }
    }
});

const HandyThemeManager = Handy?.StyleManager ? GObject.registerClass({
    Properties: {
        'style-manager': GObject.ParamSpec.object(
            'style-manager',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Handy.StyleManager
        ),
    },
}, class DDTermThemeManagerHandy extends ThemeManager {
    _init(params) {
        super._init(params);

        this.connect('notify::theme-variant', () => this._update());
        this._update();
    }

    _update() {
        switch (this.theme_variant) {
        case 'system':
            this.style_manager.color_scheme = Handy.ColorScheme.PREFER_LIGHT;
            break;

        case 'dark':
            this.style_manager.color_scheme = Handy.ColorScheme.FORCE_DARK;
            break;

        case 'light':
            this.style_manager.color_scheme = Handy.ColorScheme.FORCE_LIGHT;
            break;

        default:
            logError(new Error(`Unknown theme-variant: ${this.theme_variant}`));
        }
    }
}) : null;
