// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    bind_widgets,
    callback_stack,
    connect,
    make_settings_actions,
    insert_action_group,
    set_scale_value_format,
    ui_file_uri,
} from './util.js';

export const TabsWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsTabs',
    Template: ui_file_uri('prefs-tabs.ui'),
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
        'gettext-context': GObject.ParamSpec.jsobject(
            'gettext-context',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class PrefsTabs extends Gtk.Grid {
    _init(params) {
        super._init(params);

        const percent_format = new Intl.NumberFormat(undefined, { style: 'percent' });
        set_scale_value_format(this.tab_label_width_scale, percent_format);

        this.unbind_settings = callback_stack();
        this.connect_after('unrealize', this.unbind_settings);
        this.connect('realize', this.bind_settings.bind(this));
    }

    bind_settings() {
        this.unbind_settings();

        const actions = make_settings_actions(this, this.settings, [
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

        this.unbind_settings.push(
            insert_action_group(this, 'settings', actions),
            bind_widgets(this.settings, {
                'tab-policy': this.tab_policy_combo,
                'tab-position': this.tab_position_combo,
                'tab-label-ellipsize-mode': this.tab_label_ellipsize_combo,
                'tab-label-width': this.tab_label_width_scale,
            }),
            connect(this.settings, 'changed::tab-position', this.auto_enable_ellipsize.bind(this)),
            connect(this.settings, 'changed::tab-expand', this.auto_enable_ellipsize.bind(this))
        );

        this.auto_enable_ellipsize();
    }

    get title() {
        return this.gettext_context.gettext('Tabs');
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
});
