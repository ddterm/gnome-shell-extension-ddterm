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
const { util } = Me.imports.ddterm.pref;
const { settings } = Me.imports.ddterm.rx;
const { translations } = Me.imports.ddterm.util;

var Widget = GObject.registerClass(
    {
        GTypeName: 'DDTermPrefsScrolling',
        Template: util.ui_file_uri('prefs-scrolling.ui'),
        Children: [
            'scrollback_spin',
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
    class PrefsScrolling extends Gtk.Grid {
        _init(params) {
            super._init(params);

            const scope = util.scope(this, this.settings);

            scope.setup_widgets({
                'scrollback-lines': this.scrollback_spin,
            });

            this.insert_action_group(
                'settings',
                scope.make_actions([
                    'show-scrollbar',
                    'scroll-on-output',
                    'scroll-on-keystroke',
                ])
            );

            this.insert_action_group('inverse-settings',
                scope.make_inverse_actions([
                    'scrollback-unlimited',
                ])
            );
        }

        get title() {
            return translations.gettext('Scrolling');
        }
    }
);

/* exported Widget */
