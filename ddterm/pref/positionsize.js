// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { PreferencesGroup, ComboRow, ScaleRow } from './util.js';
import { Monitor } from '../util/displayconfig.js';

class SpecialMonitor extends Monitor {
    static [GObject.GTypeName] = 'DDTermPreferencesSpecialMonitor';

    static [GObject.properties] = {
        'key': GObject.ParamSpec.string(
            'key',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
    };

    static {
        GObject.registerClass(this);
    }
};

class MonitorSetting extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermPreferencesMonitorSetting';

    static [GObject.properties] = {
        'monitors': GObject.ParamSpec.object(
            'monitors',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.ListModel
        ),
        'selected': GObject.ParamSpec.uint(
            'selected',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            0,
            GLib.MAXUINT32,
            GLib.MAXUINT32
        ),
        'connector': GObject.ParamSpec.string(
            'connector',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamSpec.EXPLICIT_NOTIFY,
            null
        ),
        'key': GObject.ParamSpec.string(
            'key',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamSpec.EXPLICIT_NOTIFY,
            null
        ),
        'editable': GObject.ParamSpec.boolean(
            'editable',
            null,
            null,
            GObject.ParamFlags.READABLE,
            true
        ),
        'connector-editable': GObject.ParamSpec.boolean(
            'connector-editable',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamSpec.EXPLICIT_NOTIFY,
            true
        ),
        'key-editable': GObject.ParamSpec.boolean(
            'key-editable',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamSpec.EXPLICIT_NOTIFY,
            true
        ),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.connect('notify::connector', this.update_selection.bind(this));
        this.connect('notify::key', this.update_selection.bind(this));
        this.update_selection();
        this.connect('notify::selected', this.#update_from_selected.bind(this));

        this.connect('notify::connector-editable', () => this.notify('editable'));
        this.connect('notify::key-editable', () => this.notify('editable'));
    }

    #update_from_selected() {
        const { selected } = this;

        if (selected >= this.monitors.get_n_items())
            return;

        const { connector, key } = this.monitors.get_item(selected);

        if (connector) {
            this.freeze_notify();

            try {
                this.connector = connector;
                this.key = 'connector';
            } finally {
                this.thaw_notify();
            }
        } else if (key) {
            this.key = key;
        }
    }

    update_selection() {
        let { connector, key } = this;

        if (key === 'connector')
            key = null;
        else
            connector = null;

        const n = this.monitors.get_n_items();

        for (let i = 0; i < n; i++) {
            const monitor = this.monitors.get_item(i);

            if ((connector && monitor.connector === connector) ||
                (key && monitor.key === key)) {
                this.selected = i;
                break;
            }
        }
    }

    get editable() {
        return this.connector_editable && this.key_editable;
    }
}

function bind_model_to_list_store(model, store) {
    const offset = store.get_n_items();

    model.connect('items-changed', (_, position, removed, added) => {
        const additions = [];

        for (let i = 0; i < added; i++)
            additions.push(model.get_item(i + position));

        store.splice(position + offset, removed, additions);
    });

    const n = model.get_n_items();

    for (let i = 0; i < n; i++)
        store.append(model.get_item(i));
}

export class PositionSizeGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermPositionSizePreferencesGroup';

    static [GObject.properties] = {
        'monitors': GObject.ParamSpec.object(
            'monitors',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.ListModel
        ),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.title = this.gettext('Position and Size');

        const extended_monitors = Gio.ListStore.new(Monitor);

        extended_monitors.append(new SpecialMonitor({
            key: 'current',
            display_name: this.gettext(
                'On the monitor that contains the mouse pointer'
            ),
        }));

        extended_monitors.append(new SpecialMonitor({
            key: 'primary',
            display_name: this.gettext('On the primary monitor'),
        }));

        extended_monitors.append(new SpecialMonitor({
            key: 'focus',
            display_name: this.gettext('On the monitor with keyboard focus'),
        }));

        bind_model_to_list_store(this.monitors, extended_monitors);

        const monitor_combo = new ComboRow({
            title: this.gettext('On _monitor'),
            visible: true,
            use_underline: true,
            use_subtitle: true,
        });

        monitor_combo.bind_name_model(extended_monitors, v => v.display_name);
        this.add(monitor_combo);

        const monitor_setting = new MonitorSetting({ monitors: extended_monitors });

        this.settings.bind(
            'window-monitor',
            monitor_setting,
            'key',
            Gio.SettingsBindFlags.DEFAULT
        );

        this.settings.bind_writable(
            'window-monitor',
            monitor_setting,
            'key-editable',
            false
        );

        this.settings.bind(
            'window-monitor-connector',
            monitor_setting,
            'connector',
            Gio.SettingsBindFlags.DEFAULT
        );

        this.settings.bind_writable(
            'window-monitor-connector',
            monitor_setting,
            'connector-editable',
            false
        );

        extended_monitors.connect(
            'items-changed',
            monitor_setting.update_selection.bind(monitor_setting)
        );

        monitor_setting.bind_property(
            'selected',
            monitor_combo,
            'selected',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        monitor_setting.bind_property(
            'editable',
            monitor_combo,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.add_combo_text_row({
            key: 'window-position',
            title: this.gettext('_Window position'),
            model: {
                top: this.gettext('Top'),
                bottom: this.gettext('Bottom'),
                left: this.gettext('Left'),
                right: this.gettext('Right'),
            },
        });

        const window_size_adjustment = new Gtk.Adjustment({
            upper: 1,
            step_increment: 0.01,
            page_increment: 0.10,
        });

        this.settings.bind(
            'window-size',
            window_size_adjustment,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        const window_size_row = new ScaleRow({
            adjustment: window_size_adjustment,
            digits: 2,
            round_digits: 2,
            visible: true,
            use_underline: true,
            title: this.gettext('Window _size'),
        });

        const percent_format = new Intl.NumberFormat(undefined, { style: 'percent' });
        window_size_row.set_format_value_func((_, v) => percent_format.format(v));

        this.settings.bind_writable(
            'window-size',
            window_size_row,
            'sensitive',
            false
        );

        this.add(window_size_row);
    }
}
