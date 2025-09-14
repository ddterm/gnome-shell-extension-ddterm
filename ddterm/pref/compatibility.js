// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { bind_widgets, ui_file_uri } from './util.js';

export const CompatibilityWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsCompatibility',
    Template: ui_file_uri('prefs-compatibility.ui'),
    Children: [
        'ambiguous_width_combo',
        'backspace_binding_combo',
        'delete_binding_combo',
        'reset_button',
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
}, class PrefsCompatibility extends Gtk.Grid {
    constructor(params) {
        super(params);

        bind_widgets(this.settings, {
            'backspace-binding': this.backspace_binding_combo,
            'delete-binding': this.delete_binding_combo,
            'cjk-utf8-ambiguous-width': this.ambiguous_width_combo,
        });

        this.connect('realize', () => {
            const reset_handler = this.reset_button.connect('clicked', () => {
                this.settings.reset('backspace-binding');
                this.settings.reset('delete-binding');
                this.settings.reset('cjk-utf8-ambiguous-width');
            });

            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);
                this.reset_button.disconnect(reset_handler);
            });
        });
    }

    get title() {
        return this.gettext_domain.gettext('Compatibility');
    }
});
