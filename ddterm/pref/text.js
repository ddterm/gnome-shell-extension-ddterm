/*
    Copyright © 2022 Aleksandr Mezin

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

import {
    bind_sensitive,
    bind_widget,
    bind_widgets,
    insert_settings_actions,
    ui_file_uri,
} from './util.js';

export const TextWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsText',
    Template: ui_file_uri('prefs-text.ui'),
    Children: [
        'custom_font_check',
        'font_chooser',
        'text_blink_mode_combo',
        'cursor_blink_mode_combo',
        'cursor_shape_combo',
        'detect_urls_container',
    ],
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'gettext-context': GObject.ParamSpec.jsobject(
            'gettext-context',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class PrefsText extends Gtk.Grid {
    _init(params) {
        super._init(params);

        bind_widget(
            this.settings,
            'use-system-font',
            this.custom_font_check,
            Gio.SettingsBindFlags.INVERT_BOOLEAN
        );

        bind_widget(this.settings, 'custom-font', this.font_chooser);

        bind_sensitive(
            this.settings,
            'use-system-font',
            this.font_chooser.parent,
            true
        );

        bind_widgets(this.settings, {
            'text-blink-mode': this.text_blink_mode_combo,
            'cursor-shape': this.cursor_shape_combo,
            'cursor-blink-mode': this.cursor_blink_mode_combo,
        });

        insert_settings_actions(this, this.settings, [
            'allow-hyperlink',
            'audible-bell',
            'detect-urls',
            'detect-urls-as-is',
            'detect-urls-file',
            'detect-urls-http',
            'detect-urls-voip',
            'detect-urls-email',
            'detect-urls-news-man',
        ]);

        bind_sensitive(this.settings, 'detect-urls', this.detect_urls_container);
    }

    get title() {
        return this.gettext_context.gettext('Text');
    }
});
