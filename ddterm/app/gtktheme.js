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
