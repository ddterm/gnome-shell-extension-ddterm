// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    bind_widget,
    insert_settings_actions,
    set_scale_value_format,
    ui_file_uri,
} from './util.js';

export const PositionSizeWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsPositionSize',
    Template: ui_file_uri('prefs-position-size.ui'),
    Children: [
        'monitor_combo',
        'window_pos_combo',
        'window_size_scale',
    ],
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'monitors': GObject.ParamSpec.object(
            'monitors',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.ListModel
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class PrefsPositionSize extends Gtk.Grid {
    constructor(params) {
        super(params);

        const percent_format = new Intl.NumberFormat(undefined, { style: 'percent' });
        set_scale_value_format(this.window_size_scale, percent_format);

        bind_widget(this.settings, 'window-monitor-connector', this.monitor_combo);
        bind_widget(this.settings, 'window-position', this.window_pos_combo);
        bind_widget(this.settings, 'window-size', this.window_size_scale);

        this.monitors.connect('items-changed', this.#update_monitors.bind(this));
        this.#update_monitors(this.monitors, 0, 0, this.monitors.get_n_items());

        const actions = insert_settings_actions(this, this.settings, ['window-monitor']);

        actions.lookup('window-monitor').bind_property_full(
            'state',
            this.monitor_combo.parent,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE,
            (binding, state) => [true, state?.unpack() === 'connector'],
            null
        );
    }

    get title() {
        return this.gettext_domain.gettext('Position and Size');
    }

    #update_monitors(model, position, removed, added) {
        this.monitor_combo.freeze_notify();

        try {
            while (removed--)
                this.monitor_combo.remove(position);

            for (let i = position; i < position + added; i++) {
                const { connector, display_name, product } = model.get_item(i);
                const description = `${display_name} - ${product} (${connector})`;
                this.monitor_combo.insert(i, connector, description);
            }

            this.monitor_combo.active_id = this.settings.get_string('window-monitor-connector');
        } finally {
            this.monitor_combo.thaw_notify();
        }
    }
});
