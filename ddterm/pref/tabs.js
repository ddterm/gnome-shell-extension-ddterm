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
const { translations } = Me.imports.ddterm.util;

var Widget = GObject.registerClass(
    {
        GTypeName: 'DDTermPrefsTabs',
        Template: util.ui_file_uri('prefs-tabs.ui'),
        Children: [
            'tab_policy_combo',
            'tab_position_combo',
            'tab_label_width_scale',
            'tab_label_ellipsize_combo',
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
            });

            util.set_scale_value_formatter(this.tab_label_width_scale, util.percent_formatter);

            util.insert_settings_actions(this, this.settings, [
                'tab-expand',
                'tab-close-buttons',
                'new-tab-button',
                'new-tab-front-button',
                'tab-switcher-popup',
                'notebook-border',
                'tab-show-shortcuts',
            ]);

            this.saved_ellipsize_mode = this.settings.get_string('tab-label-ellipsize-mode');

            if (this.saved_ellipsize_mode === 'none')
                this.saved_ellipsize_mode = 'middle';

            const tab_position_handler = this.settings.connect('changed::tab-position', () => {
                this.auto_enable_ellipsize();
            });
            this.connect('destroy', () => this.settings.disconnect(tab_position_handler));

            const tab_expand_handler = this.settings.connect('changed::tab-expand', () => {
                this.auto_enable_ellipsize();
            });
            this.connect('destroy', () => this.settings.disconnect(tab_expand_handler));
        }

        get title() {
            return translations.gettext('Tabs');
        }

        auto_enable_ellipsize() {
            const current_mode = this.settings.get_string('tab-label-ellipsize-mode');
            const current_enabled = current_mode !== 'none';
            const should_enable =
                ['left', 'right'].includes(this.settings.get_string('tab-position')) ||
                    this.settings.get_boolean('tab-expand');

            if (current_enabled === should_enable)
                return;

            if (should_enable) {
                this.settings.set_string('tab-label-ellipsize-mode', this.saved_ellipsize_mode);
            } else {
                this.saved_ellipsize_mode = current_mode;
                this.settings.set_string('tab-label-ellipsize-mode', 'none');
            }
        }
    }
);

/* exported Widget */
