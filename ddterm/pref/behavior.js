// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { insert_settings_actions, ui_file_uri } from './util.js';

export const BehaviorWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsBehavior',
    Template: ui_file_uri('prefs-behavior.ui'),
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
}, class PrefsBehavior extends Gtk.Grid {
    constructor(params) {
        super(params);

        insert_settings_actions(this, this.settings, [
            'window-resizable',
            'window-above',
            'window-stick',
            'window-skip-taskbar',
            'hide-when-focus-lost',
            'hide-window-on-esc',
            'pointer-autohide',
            'force-x11-gdk-backend',
        ]);
    }

    get title() {
        return this.gettext_domain.gettext('Behavior');
    }
});
