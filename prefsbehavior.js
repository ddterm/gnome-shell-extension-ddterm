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
        GTypeName: 'DDTermPrefsBehavior',
        Template: Me.dir.get_child(`prefs-behavior-gtk${Gtk.get_major_version()}.ui`).get_uri(),
        Children: [
            'window_type_hint_combo',
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
    class PrefsBehavior extends Gtk.Grid {
        _init(params) {
            super._init(params);

            const scope = prefsutil.scope(this, this.settings);

            scope.setup_widgets({
                'window-type-hint': this.window_type_hint_combo,
            });

            this.insert_action_group(
                'settings',
                scope.make_actions([
                    'window-resizable',
                    'window-above',
                    'window-stick',
                    'window-skip-taskbar',
                    'hide-when-focus-lost',
                    'hide-window-on-esc',
                    'pointer-autohide',
                    'force-x11-gdk-backend',
                ])
            );
        }

        get title() {
            return translations.gettext('Behavior');
        }
    }
);

/* exported Widget */
