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

const { GObject, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { prefsutil, settings, translations } = Me.imports;

var Widget = GObject.registerClass(
    {
        GTypeName: 'DDTermPrefsCommand',
        Template: Me.dir.get_child(`prefs-command-gtk${Gtk.get_major_version()}.ui`).get_uri(),
        Children: [
            'custom_command_entry',
        ],
        Properties: {
            'settings': GObject.ParamSpec.object(
                'settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                settings.Settings
            ),
        },
    },
    class PrefsCommand extends Gtk.Grid {
        _init(params) {
            super._init(params);

            const scope = prefsutil.scope(this, this.settings);

            scope.setup_widgets({
                'custom-command': this.custom_command_entry,
            });

            /*
                GtkRadioButton: always build the group around the last one.
                I. e. 'group' property of all buttons (except the last one)
                should point to the last one. Otherwise, settings-based action
                won't work correctly on Gtk 3.
            */
            this.insert_action_group(
                'settings',
                scope.make_actions([
                    'command',
                    'preserve-working-directory',
                ])
            );
        }

        get title() {
            return translations.gettext('Command');
        }
    }
);

/* exported Widget */
