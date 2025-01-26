// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    bind_widget,
    callback_stack,
    connect,
    insert_action_group,
    make_settings_actions,
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
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'monitors': GObject.ParamSpec.object(
            'monitors',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gio.ListModel
        ),
        'gettext-context': GObject.ParamSpec.jsobject(
            'gettext-context',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class PrefsPositionSize extends Gtk.Grid {
    _init(params) {
        super._init(params);

        const percent_format = new Intl.NumberFormat(undefined, { style: 'percent' });
        set_scale_value_format(this.window_size_scale, percent_format);

        this.unbind_monitors = callback_stack();
        this.connect_after('unrealize', this.unbind_monitors);
        this.connect('realize', this.bind_monitors.bind(this));
        this.connect('notify::monitors', () => {
            if (this.get_realized())
                this.bind_monitors();
        });

        this.unbind_settings = callback_stack();
        this.connect_after('unrealize', this.unbind_settings);
        this.connect('realize', this.bind_settings.bind(this));
    }

    bind_settings() {
        this.unbind_settings();

        const actions = make_settings_actions(this.settings, ['window-monitor']);

        this.unbind_settings.push(
            insert_action_group(this, 'settings', actions),
            bind_widget(this.settings, 'window-monitor-connector', this.monitor_combo),
            bind_widget(this.settings, 'window-position', this.window_pos_combo),
            bind_widget(this.settings, 'window-size', this.window_size_scale),
            connect(
                this.settings,
                'changed::window-monitor',
                this.enable_monitor_combo.bind(this)
            )
        );

        this.enable_monitor_combo();
    }

    bind_monitors() {
        this.unbind_monitors();

        if (!this.monitors)
            return;

        this.unbind_monitors.push(
            connect(this.monitors, 'items-changed', this.update_monitors.bind(this))
        );

        const n_prev = this.monitor_combo.model.iter_n_children(null);
        this.update_monitors(this.monitors, 0, n_prev, this.monitors.get_n_items());
    }

    get title() {
        return this.gettext_context.gettext('Position and Size');
    }

    enable_monitor_combo() {
        this.monitor_combo.sensitive =
            this.settings.get_string('window-monitor') === 'connector';
    }

    update_monitors(model, position, removed, added) {
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
