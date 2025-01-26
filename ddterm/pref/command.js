// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    bind_widget,
    callback_stack,
    connect,
    insert_action_group,
    make_settings_actions,
    ui_file_uri,
} from './util.js';

export const CommandWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsCommand',
    Template: ui_file_uri('prefs-command.ui'),
    Children: [
        'custom_command_entry',
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
}, class PrefsCommand extends Gtk.Grid {
    _init(params) {
        super._init(params);

        this.unbind_settings = callback_stack();
        this.connect_after('unrealize', this.unbind_settings);
        this.connect('realize', this.bind_settings.bind(this));
    }

    bind_settings() {
        this.unbind_settings();

        const actions = make_settings_actions(this.settings, [
            'command',
            'preserve-working-directory',
        ]);

        this.unbind_settings.push(
            insert_action_group(this, 'settings', actions),
            bind_widget(this.settings, 'custom-command', this.custom_command_entry),
            connect(this.settings, 'changed::command', this.enable_custom_command_entry.bind(this))
        );

        this.enable_custom_command_entry();
    }

    get title() {
        return this.gettext_context.gettext('Command');
    }

    enable_custom_command_entry() {
        this.custom_command_entry.parent.sensitive =
            this.settings.get_string('command') === 'custom-command';
    }
});
