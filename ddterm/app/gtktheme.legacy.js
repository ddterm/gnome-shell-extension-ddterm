// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Handy from 'gi://Handy';

export const ThemeManager = Handy.StyleManager ? GObject.registerClass({
    Properties: {
        'theme-variant': GObject.ParamSpec.string(
            'theme-variant',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'system'
        ),
    },
}, class DDTermThemeManagerHandy extends GObject.Object {
    _init(params) {
        super._init(params);

        Handy.init();
        this._style_manager = Handy.StyleManager.get_default();

        this.connect('notify::theme-variant', () => this._update());
        this._update();
    }

    _update() {
        switch (this.theme_variant) {
        case 'system':
            this._style_manager.color_scheme = Handy.ColorScheme.PREFER_LIGHT;
            break;

        case 'dark':
            this._style_manager.color_scheme = Handy.ColorScheme.FORCE_DARK;
            break;

        case 'light':
            this._style_manager.color_scheme = Handy.ColorScheme.FORCE_LIGHT;
            break;

        default:
            logError(new Error(`Unknown theme-variant: ${this.theme_variant}`));
        }
    }
}) : GObject.registerClass({
    Properties: {
        'theme-variant': GObject.ParamSpec.string(
            'theme-variant',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            'system'
        ),
    },
}, class DDTermThemeManagerFallback extends GObject.Object {
    _init(params) {
        super._init(params);

        this._gtk_settings = Gtk.Settings.get_default();

        this.connect('notify::theme-variant', () => this._update());
        this._update();
    }

    _update() {
        switch (this.theme_variant) {
        case 'system':
            this._gtk_settings.reset_property('gtk-application-prefer-dark-theme');
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
