// SPDX-FileCopyrightText: © 2024 Aleksandr Mezin
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

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
    _init(params) {
        super._init(params);

        this._gtk_settings = Gtk.Settings.get_default();
        this._desktop_settings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._has_desktop_color_schemes =
            this._desktop_settings.settings_schema.has_key('color-scheme');

        this.connect('notify::theme-variant', () => this._update());
        this._desktop_settings.connect('changed::color-scheme', () => this._update());
        this._update();
    }

    _update() {
        switch (this.theme_variant) {
        case 'system':
            if (!this._has_desktop_color_schemes) {
                this._gtk_settings.reset_property('gtk-application-prefer-dark-theme');
                break;
            }

            switch (this._desktop_settings.get_string('color-scheme')) {
            case 'prefer-dark':
                this._gtk_settings.gtk_application_prefer_dark_theme = true;
                break;
            case 'prefer-light':
                this._gtk_settings.gtk_application_prefer_dark_theme = false;
                break;
            default:
                this._gtk_settings.reset_property('gtk-application-prefer-dark-theme');
            }

            break;

        case 'dark':
            this._gtk_settings.gtk_application_prefer_dark_theme = true;
            break;

        case 'light':
            this._gtk_settings.gtk_application_prefer_dark_theme = false;
            break;

        default:
            logError(new Error(`Unknown theme-variant: ${this.theme_variant}`));
        }
    }
});
