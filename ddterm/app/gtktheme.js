// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Handy from 'gi://Handy';

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
});
