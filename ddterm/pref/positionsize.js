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
const { displayconfig, translations } = Me.imports.ddterm.util;

var Widget = GObject.registerClass({
    GTypeName: 'DDTermPrefsPositionSize',
    Template: util.ui_file_uri('prefs-position-size.ui'),
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
    },
}, class PrefsPositionSize extends Gtk.Grid {
    _init(params) {
        super._init(params);

        util.insert_settings_actions(this, this.settings, ['window-monitor']);

        this.display_config = new displayconfig.DisplayConfig({
            dbus_connection: Gio.DBus.session,
        });
        this.connect('destroy', () => this.display_config.unwatch());

        this.display_config.connect('notify::monitors', this.update_monitors.bind(this));
        this.display_config.update_async();

        util.bind_widget(this.settings, 'window-monitor-connector', this.monitor_combo);

        const window_monitor_handler = this.settings.connect(
            'changed::window-monitor',
            this.enable_monitor_combo.bind(this)
        );
        this.connect('destroy', () => this.settings.disconnect(window_monitor_handler));
        this.enable_monitor_combo();

        util.bind_widget(this.settings, 'window-position', this.window_pos_combo);
        util.bind_widget(this.settings, 'window-size', this.window_size_scale);

        const percent_format = new Intl.NumberFormat(undefined, { style: 'percent' });
        util.set_scale_value_format(this.window_size_scale, percent_format);
    }

    get title() {
        return translations.gettext('Position and Size');
    }

    enable_monitor_combo() {
        this.monitor_combo.sensitive =
            this.settings.get_string('window-monitor') === 'connector';
    }

    update_monitors() {
        this.monitor_combo.freeze_notify();

        try {
            this.monitor_combo.remove_all();

            for (const { connector, model, display_name } of this.display_config.monitors) {
                const description = `${display_name} - ${model} (${connector})`;
                this.monitor_combo.append(connector, description);
            }

            this.monitor_combo.active_id = this.settings.get_string('window-monitor-connector');
        } finally {
            this.monitor_combo.thaw_notify();
        }
    }
});

/* exported Widget */
