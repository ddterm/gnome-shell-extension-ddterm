// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    callback_stack,
    insert_action_group,
    make_settings_actions,
    ui_file_uri,
} from './util.js';

export const BehaviorWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsBehavior',
    Template: ui_file_uri('prefs-behavior.ui'),
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
}, class PrefsBehavior extends Gtk.Grid {
    _init(params) {
        super._init(params);

        this.unbind_settings = callback_stack();
        this.connect_after('unrealize', this.unbind_settings);
        this.connect('realize', this.bind_settings.bind(this));
    }

    get title() {
        return this.gettext_context.gettext('Behavior');
    }

    bind_settings() {
        this.unbind_settings();

        const actions = make_settings_actions(this.settings, [
            'window-resizable',
            'window-above',
            'window-stick',
            'window-skip-taskbar',
            'hide-when-focus-lost',
            'hide-window-on-esc',
            'pointer-autohide',
            'force-x11-gdk-backend',
        ]);

        this.unbind_settings.push(insert_action_group(this, 'settings', actions));
    }
});
