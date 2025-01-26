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

export const PanelIconWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsPanelIcon',
    Template: ui_file_uri('prefs-panel-icon.ui'),
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
}, class PrefsPanelIcon extends Gtk.Box {
    _init(params) {
        super._init(params);

        this.unbind_settings = callback_stack();
        this.connect_after('unrealize', this.unbind_settings);
        this.connect('realize', this.bind_settings.bind(this));
    }

    bind_settings() {
        this.unbind_settings();

        const actions = make_settings_actions(this.settings, ['panel-icon-type']);

        this.unbind_settings.push(insert_action_group(this, 'settings', actions));
    }

    get title() {
        return this.gettext_context.gettext('Panel Icon');
    }
});
