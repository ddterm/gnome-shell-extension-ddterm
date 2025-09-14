// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

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
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class PrefsText extends Gtk.Grid {
    constructor(params) {
        super(params);

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
        return this.gettext_domain.gettext('Text');
    }
});
