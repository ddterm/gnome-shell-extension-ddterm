// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    bind_sensitive,
    bind_widget,
    callback_stack,
    insert_action_group,
    make_settings_actions,
    ui_file_uri,
} from './util.js';

export const ScrollingWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsScrolling',
    Template: ui_file_uri('prefs-scrolling.ui'),
    Children: [
        'scrollback_spin',
        'limit_scrollback_check',
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
}, class PrefsScrolling extends Gtk.Grid {
    _init(params) {
        super._init(params);

        this.unbind_settings = callback_stack();
        this.connect_after('unrealize', this.unbind_settings);
        this.connect('realize', this.bind_settings.bind(this));
    }

    bind_settings() {
        this.unbind_settings();

        const actions = make_settings_actions(this.settings, [
            'show-scrollbar',
            'scroll-on-output',
            'scroll-on-keystroke',
        ]);

        this.unbind_settings.push(
            insert_action_group(this, 'settings', actions),
            bind_widget(
                this.settings,
                'scrollback-unlimited',
                this.limit_scrollback_check,
                Gio.SettingsBindFlags.INVERT_BOOLEAN
            ),
            bind_widget(this.settings, 'scrollback-lines', this.scrollback_spin),
            bind_sensitive(
                this.settings,
                'scrollback-unlimited',
                this.scrollback_spin.parent,
                true
            )
        );
    }

    get title() {
        return this.gettext_context.gettext('Scrolling');
    }
});
