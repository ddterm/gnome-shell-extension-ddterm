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
const { backport } = Me.imports.ddterm;
const { util } = Me.imports.ddterm.pref;
const { translations } = Me.imports.ddterm.util;

var Widget = backport.GObject.registerClass(
    {
        GTypeName: 'DDTermPrefsTabs',
        Template: util.ui_file_uri('prefs-tabs.ui'),
        Children: [
            'tab_policy_combo',
            'tab_position_combo',
            'tab_label_width_scale',
            'tab_label_ellipsize_combo',
            'tab_title_template_text_view',
        ],
        Properties: {
            'settings': GObject.ParamSpec.object(
                'settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.Settings
            ),
        },
    },
    class PrefsTabs extends Gtk.Grid {
        _init(params) {
            super._init(params);

            util.bind_widgets(this.settings, {
                'tab-policy': this.tab_policy_combo,
                'tab-position': this.tab_position_combo,
                'tab-label-ellipsize-mode': this.tab_label_ellipsize_combo,
                'tab-label-width': this.tab_label_width_scale,
                'tab-title-template': this.tab_title_template_text_view,
            });

            util.set_scale_value_formatter(this.tab_label_width_scale, util.percent_formatter);

            util.insert_settings_actions(this, this.settings, [
                'tab-expand',
                'tab-close-buttons',
                'new-tab-button',
                'new-tab-front-button',
                'tab-switcher-popup',
                'notebook-border',
            ]);

            const reset_action = new Gio.SimpleAction({
                name: 'reset-tab-title',
            });

            reset_action.connect('activate', () => {
                this.settings.reset('tab-title-template');
            });

            const aux_actions = new Gio.SimpleActionGroup();
            aux_actions.add_action(reset_action);
            this.insert_action_group('aux', aux_actions);

            const tab_position_handler = this.settings.connect('changed::tab-position', () => {
                if (['top', 'bottom'].includes(this.settings.get_string('tab-position'))) {
                    if (this.settings.get_string('tab-label-ellipsize-mode') === 'none')
                        this.settings.set_string('tab-label-ellipsize-mode', 'middle');
                }
            });
            this.connect('destroy', () => this.settings.disconnect(tab_position_handler));
        }

        get title() {
            return translations.gettext('Tabs');
        }
    }
);

/* exported Widget */
