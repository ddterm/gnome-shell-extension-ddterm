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
    insert_settings_actions,
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

        insert_settings_actions(this, this.settings, [
            'show-scrollbar',
            'scroll-on-output',
            'scroll-on-keystroke',
        ]);

        bind_widget(
            this.settings,
            'scrollback-unlimited',
            this.limit_scrollback_check,
            Gio.SettingsBindFlags.INVERT_BOOLEAN
        );

        bind_widget(this.settings, 'scrollback-lines', this.scrollback_spin);

        bind_sensitive(
            this.settings,
            'scrollback-unlimited',
            this.scrollback_spin.parent,
            true
        );
    }

    get title() {
        return this.gettext_context.gettext('Scrolling');
    }
});
