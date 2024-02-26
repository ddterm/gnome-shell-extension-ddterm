// SPDX-FileCopyrightText: © 2022 Aleksandr Mezin
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    bind_widget,
    insert_settings_actions,
    set_scale_value_format,
    ui_file_uri
} from './util.js';
// BEGIN ESM
import { DisplayConfig } from '../util/displayconfig.js';
// END ESM

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

        insert_settings_actions(this, this.settings, ['window-monitor']);

        // BEGIN !ESM
        const destroy_cancel = new Gio.Cancellable();
        this.connect('destroy', () => destroy_cancel.cancel());

        import('../util/displayconfig.js').then(displayconfig => {
            destroy_cancel.set_error_if_cancelled();

            const display_config = new displayconfig.DisplayConfig({
                dbus_connection: Gio.DBus.session,
            });

            destroy_cancel.connect(() => display_config.unwatch());

            display_config.connect('notify::monitors', () => {
                this.update_monitors(display_config.monitors);
            });

            display_config.update_async();
        });
        // END !ESM
        // BEGIN ESM
        const display_config = new DisplayConfig({
            dbus_connection: Gio.DBus.session,
        });

        this.connect('destroy', () => display_config.unwatch());

        display_config.connect('notify::monitors', () => {
            this.update_monitors(display_config.monitors);
        });

        display_config.update_async();
        // END ESM

        bind_widget(this.settings, 'window-monitor-connector', this.monitor_combo);

        const window_monitor_handler = this.settings.connect(
            'changed::window-monitor',
            this.enable_monitor_combo.bind(this)
        );
        this.connect('destroy', () => this.settings.disconnect(window_monitor_handler));
        this.enable_monitor_combo();

        bind_widget(this.settings, 'window-position', this.window_pos_combo);
        bind_widget(this.settings, 'window-size', this.window_size_scale);

        const percent_format = new Intl.NumberFormat(undefined, { style: 'percent' });
        set_scale_value_format(this.window_size_scale, percent_format);
    }

    get title() {
        return this.gettext_context.gettext('Position and Size');
    }

    enable_monitor_combo() {
        this.monitor_combo.sensitive =
            this.settings.get_string('window-monitor') === 'connector';
    }

    update_monitors(monitors) {
        this.monitor_combo.freeze_notify();

        try {
            this.monitor_combo.remove_all();

            for (const { connector, model, display_name } of monitors) {
                const description = `${display_name} - ${model} (${connector})`;
                this.monitor_combo.append(connector, description);
            }

            this.monitor_combo.active_id = this.settings.get_string('window-monitor-connector');
        } finally {
            this.monitor_combo.thaw_notify();
        }
    }
});
