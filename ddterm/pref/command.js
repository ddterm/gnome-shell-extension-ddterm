// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { bind_widget, insert_settings_actions, ui_file_uri } from './util.js';

export const CommandWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsCommand',
    Template: ui_file_uri('prefs-command.ui'),
    Children: [
        'custom_command_entry',
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
}, class PrefsCommand extends Gtk.Grid {
    constructor(params) {
        super(params);

        const actions = insert_settings_actions(this, this.settings, [
            'command',
            'preserve-working-directory',
        ]);

        bind_widget(this.settings, 'custom-command', this.custom_command_entry);

        actions.lookup_action('command').bind_property_full(
            'state',
            this.custom_command_entry.parent,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE,
            (binding, state) => [true, state?.unpack() === 'custom-command'],
            null
        );
    }

    get title() {
        return this.gettext_domain.gettext('Command');
    }
});
