// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    bind_widgets,
    insert_settings_actions,
    set_scale_value_format,
    ui_file_uri,
} from './util.js';

export const TabsWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsTabs',
    Template: ui_file_uri('prefs-tabs.ui'),
    Children: [
        'expand_tabs_check',
        'tab_policy_combo',
        'tab_position_combo',
        'tab_label_width_scale',
        'tab_label_ellipsize_combo',
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
}, class PrefsTabs extends Gtk.Grid {
    constructor(params) {
        super(params);

        bind_widgets(this.settings, {
            'tab-policy': this.tab_policy_combo,
            'tab-position': this.tab_position_combo,
            'tab-label-ellipsize-mode': this.tab_label_ellipsize_combo,
            'tab-label-width': this.tab_label_width_scale,
        });

        const percent_format = new Intl.NumberFormat(undefined, { style: 'percent' });
        set_scale_value_format(this.tab_label_width_scale, percent_format);

        insert_settings_actions(this, this.settings, [
            'tab-expand',
            'tab-close-buttons',
            'new-tab-button',
            'new-tab-front-button',
            'tab-switcher-popup',
            'notebook-border',
            'tab-show-shortcuts',
            'save-restore-session',
        ]);

        this.connect('realize', this.#realize.bind(this));
    }

    #realize() {
        this.saved_ellipsize_mode = this.settings.get_string('tab-label-ellipsize-mode');

        if (this.saved_ellipsize_mode === 'none')
            this.saved_ellipsize_mode = 'middle';

        const auto_enable_ellipsize = this.#auto_enable_ellipsize.bind(this);

        const tab_pos_handler =
            this.tab_position_combo.connect('changed', auto_enable_ellipsize);

        const tab_expand_handler =
            this.expand_tabs_check.connect('toggled', auto_enable_ellipsize);

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);
            this.tab_position_combo.disconnect(tab_pos_handler);
            this.expand_tabs_check.disconnect(tab_expand_handler);
        });
    }

    get title() {
        return this.gettext_domain.gettext('Tabs');
    }

    #auto_enable_ellipsize() {
        const current_mode = this.tab_label_ellipsize_combo.active_id;
        const current_enabled = current_mode !== 'none';
        const should_enable =
            ['left', 'right'].includes(this.tab_position_combo.active_id) ||
                this.expand_tabs_check.active;

        if (current_enabled === should_enable)
            return;

        if (should_enable) {
            this.tab_label_ellipsize_combo.active_id = this.saved_ellipsize_mode;
        } else {
            this.saved_ellipsize_mode = current_mode;
            this.tab_label_ellipsize_combo.active_id = 'none';
        }
    }
});
