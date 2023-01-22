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
const { settings } = Me.imports.ddterm.common;
const { translations } = Me.imports.ddterm;

var Widget = GObject.registerClass(
    {
        GTypeName: 'DDTermPrefsText',
        Template: util.ui_file_uri('prefs-text.ui'),
        Children: [
            'font_chooser',
            'text_blink_mode_combo',
            'cursor_blink_mode_combo',
            'cursor_shape_combo',
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
    class PrefsText extends Gtk.Grid {
        _init(params) {
            super._init(params);

            const scope = util.scope(this, this.settings);

            scope.setup_widgets({
                'text-blink-mode': this.text_blink_mode_combo,
                'cursor-blink-mode': this.cursor_blink_mode_combo,
                'cursor-shape': this.cursor_shape_combo,
                'custom-font': this.font_chooser,
            });

            this.insert_action_group(
                'settings',
                scope.make_actions([
                    'allow-hyperlink',
                    'audible-bell',
                    'detect-urls',
                    'detect-urls-as-is',
                    'detect-urls-file',
                    'detect-urls-http',
                    'detect-urls-voip',
                    'detect-urls-email',
                    'detect-urls-news-man',
                ])
            );

            this.insert_action_group('inverse-settings',
                scope.make_inverse_actions([
                    'use-system-font',
                ])
            );
        }

        get title() {
            return translations.gettext('Text');
        }
    }
);

/* exported Widget */
