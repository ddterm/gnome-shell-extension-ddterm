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

'use strict';

const { GObject, Gio, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { util } = Me.imports.ddterm.pref;

var Widget = GObject.registerClass({
    GTypeName: 'DDTermPrefsCompatibility',
    Template: util.ui_file_uri('prefs-compatibility.ui'),
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

        util.bind_widgets(this.settings, {
            'backspace-binding': this.backspace_binding_combo,
            'delete-binding': this.delete_binding_combo,
            'cjk-utf8-ambiguous-width': this.ambiguous_width_combo,
        });

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
        this.insert_action_group('aux', aux_actions);
    }

    get title() {
        return this.gettext_context.gettext('Compatibility');
    }
});

/* exported Widget */
