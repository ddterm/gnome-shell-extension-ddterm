// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    bind_widgets,
    callback_stack,
    insert_action_group,
    ui_file_uri,
} from './util.js';

export const CompatibilityWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsCompatibility',
    Template: ui_file_uri('prefs-compatibility.ui'),
    Children: [
        'backspace_binding_combo',
        'delete_binding_combo',
        'ambiguous_width_combo',
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
}, class PrefsCompatibility extends Gtk.Grid {
    _init(params) {
        super._init(params);

        this.unbind_settings = callback_stack();
        this.connect_after('unrealize', this.unbind_settings);
        this.connect('realize', this.bind_settings.bind(this));
    }

    bind_settings() {
        this.unbind_settings();

        const reset_action = new Gio.SimpleAction({
            name: 'reset-compatibility-options',
        });

        reset_action.connect('activate', () => {
            this.settings.reset('backspace-binding');
            this.settings.reset('delete-binding');
            this.settings.reset('cjk-utf8-ambiguous-width');
        });

        const aux_actions = new Gio.SimpleActionGroup();
        aux_actions.add_action(reset_action);

        this.unbind_settings.push(
            bind_widgets(this.settings, {
                'backspace-binding': this.backspace_binding_combo,
                'delete-binding': this.delete_binding_combo,
                'cjk-utf8-ambiguous-width': this.ambiguous_width_combo,
            }),
            insert_action_group('aux', aux_actions)
        );
    }

    get title() {
        return this.gettext_context.gettext('Compatibility');
    }
});
