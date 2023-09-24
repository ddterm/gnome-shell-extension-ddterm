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

const Monitor = GObject.registerClass({
    Properties: {
        'connector': GObject.ParamSpec.string(
            'connector',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'description': GObject.ParamSpec.string(
            'description',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            null
        ),
    },
}, class DDTermPrefsMonitor extends GObject.Object {
});

const MonitorList = GObject.registerClass({
}, class DDTermPrefsMonitorList extends Gio.ListStore {
    _init(params) {
        super._init({
            'item-type': Monitor.$gtype,
            ...params,
        });

        this.display_config = new displayconfig.DisplayConfig({
            dbus_connection: Gio.DBus.session,
        });

        this.display_config.connect('notify::monitors', () => {
            this._update(this.display_config.monitors);
        });

        this.display_config.update_async();
    }

    destroy() {
        this.display_config.unwatch();
        this.remove_all();
    }

    find_by_connector(connector) {
        const n = this.get_n_items();

        for (let index = 0; index < n; index++) {
            const item = this.get_item(index);

            if (item.connector === connector)
                return { item, index };
        }

        return null;
    }

    _filter(callback) {
        let n = this.get_n_items();

        for (let index = 0; index < n; index++) {
            let end = index;

            while (end < n && !callback(this.get_item(end), end))
                end++;

            const n_remove = end - index;

            if (n_remove) {
                this.splice(index, n_remove, []);
                n -= n_remove;
            }
        }
    }

    _update(entries) {
        const connectors = entries.map(({ connector }) => connector);

        this._filter(item => connectors.includes(item.connector));

        for (const { connector, model, display_name } of entries) {
            const found = this.find_by_connector(connector);
            const description = `${display_name} - ${model} (${connector})`;

            if (found) {
                found.item.description = description;
            } else {
                this.insert(
                    Math.min(this.get_n_items(), connectors.indexOf(connector)),
                    new Monitor({ connector, description })
                );
            }
        }
    }
});

const ListToTreeModelAdapter = GObject.registerClass({
    Properties: {
        'source': GObject.ParamSpec.object(
            'source',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.ListModel
        ),
    },
}, class DDTermListToTreeModelAdapter extends Gtk.ListStore {
    _init(params) {
        super._init(params);

        const item_type = this.source.get_item_type();
        this.column_pspecs = GObject.Object.list_properties.call(item_type);

        const column_types = this.column_pspecs.map(spec => spec.value_type);
        this.item_column = column_types.length;
        column_types.push(item_type);

        this.set_column_types(column_types);

        this._notify_handlers = new Map();
        this._items_changed_handler = this.source.connect(
            'items-changed',
            (source_, ...args) => this._items_changed(...args)
        );

        this._items_added(0, this.source.get_n_items());
    }

    _items_removed(position, n) {
        const [ok_, iter] = this.iter_nth_child(null, position);

        while (n--)
            this.remove(iter);

        this._gc_notify_handlers();
    }

    _items_added(position, n) {
        while (n--) {
            const source_item = this.source.get_item(position);

            if (!this._notify_handlers.has(source_item)) {
                this._notify_handlers.set(
                    source_item,
                    source_item.connect('notify', this._item_property_changed.bind(this))
                );
            }

            const columns = this.column_pspecs.map((_, index) => index);
            const values = this.column_pspecs.map(pspec => source_item[pspec.name]);

            columns.push(this.item_column);
            values.push(source_item);

            if (this.insert_with_valuesv)
                this.insert_with_valuesv(position, columns, values);
            else
                this.insert_with_values(position, columns, values);

            position++;
        }
    }

    _items_changed(position, removed, added) {
        this._items_removed(position, removed);
        this._items_added(position, added);
    }

    _item_property_changed(source, pspec) {
        const column = this.column_pspecs.indexOf(pspec);
        const value = source[pspec.name];

        this.foreach((model, path, iter) => {
            const item = model.get_value(iter, this.item_column);

            if (item === source)
                this.set_value(iter, column, value);
        });
    }

    _gc_notify_handlers() {
        const valid_items = new Set();

        this.foreach((model, path, iter) => {
            const item = model.get_value(iter, this.item_column);
            valid_items.add(item);
        });

        for (const [item, handler] of this._notify_handlers) {
            if (valid_items.has(item))
                continue;

            item.disconnect(handler);
            this._notify_handlers.delete(item);
        }
    }

    destroy() {
        if (this._items_changed_handler) {
            this.source.disconnect(this._items_changed_handler);
            this._items_changed_handler = null;
        }

        this.clear();
        this._gc_notify_handlers();
    }
});

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

        const monitor_list = new MonitorList();
        this.connect('destroy', () => monitor_list.destroy());

        const adapter = new ListToTreeModelAdapter({ source: monitor_list });
        this.monitor_combo.set_model(adapter);
        this.connect('destroy', () => adapter.destroy());

        const monitor_added_handler_id = adapter.connect('row-inserted', () => {
            this.monitor_combo.active_id = this.settings.get_string('window-monitor-connector');
        });
        this.connect('destroy', () => adapter.disconnect(monitor_added_handler_id));

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
});

/* exported Widget */
