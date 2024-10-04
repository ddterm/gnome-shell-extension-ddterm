/*
    Copyright © 2023 Aleksandr Mezin

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

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

export const LayoutMode = {
    LOGICAL: 1,
    PHYSICAL: 2,
};

const BUS_NAME = 'org.gnome.Mutter.DisplayConfig';
const OBJECT_PATH = '/org/gnome/Mutter/DisplayConfig';
const INTERFACE_NAME = 'org.gnome.Mutter.DisplayConfig';

const CURRENT_STATE_TYPE = GLib.VariantType.new_tuple([
    new GLib.VariantType('u'), // serial
    new GLib.VariantType('a((ssss)a(siiddada{sv})a{sv})'), // monitors
    new GLib.VariantType('a(iiduba(ssss)a{sv})'), // logical_monitors
    new GLib.VariantType('a{sv}'), // properties
]);

export const DisplayConfig = GObject.registerClass({
    Properties: {
        'dbus-connection': GObject.ParamSpec.object(
            'dbus-connection',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.DBusConnection
        ),
        'current-state': GObject.param_spec_variant(
            'current-state',
            '',
            '',
            CURRENT_STATE_TYPE,
            null,
            GObject.ParamFlags.READABLE
        ),
        'layout-mode': GObject.ParamSpec.int(
            'layout-mode',
            '',
            '',
            GObject.ParamFlags.READABLE,
            0
        ),
    },
}, class DDTermDisplayConfig extends GObject.Object {
    _init(params) {
        super._init(params);

        this._cancellable = null;
        this._layout_mode = 0;
        this._serial = -1;

        this._change_handler = this.dbus_connection.signal_subscribe(
            BUS_NAME,
            INTERFACE_NAME,
            'MonitorsChanged',
            OBJECT_PATH,
            null,
            Gio.DBusSignalFlags.NONE,
            () => this.update_async()
        );
    }

    static new() {
        const obj = new DisplayConfig({ dbus_connection: Gio.DBus.session });

        obj.update_async();

        return obj;
    }

    get current_state() {
        return this._current_state;
    }

    get layout_mode() {
        return this._layout_mode;
    }

    create_monitor_list() {
        const monitors = new MonitorList();

        this.bind_property(
            'current-state',
            monitors,
            'current-state',
            this._current_state ? GObject.BindingFlags.SYNC_CREATE : GObject.BindingFlags.DEFAULT
        );

        return monitors;
    }

    update_sync() {
        this._cancellable?.cancel();
        this._cancellable = new Gio.Cancellable();

        this._parse_current_state(
            this.dbus_connection.call_sync(
                BUS_NAME,
                OBJECT_PATH,
                INTERFACE_NAME,
                'GetCurrentState',
                null,
                CURRENT_STATE_TYPE,
                Gio.DBusCallFlags.NO_AUTO_START,
                -1,
                this._cancellable
            )
        );
    }

    update_async() {
        this._cancellable?.cancel();
        this._cancellable = new Gio.Cancellable();

        this.dbus_connection.call(
            BUS_NAME,
            OBJECT_PATH,
            INTERFACE_NAME,
            'GetCurrentState',
            null,
            CURRENT_STATE_TYPE,
            Gio.DBusCallFlags.NO_AUTO_START,
            -1,
            this._cancellable,
            (source, result) => {
                try {
                    this._parse_current_state(source.call_finish(result));
                } catch (error) {
                    if (!(error instanceof GLib.Error &&
                          error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED)))
                        logError(error);
                }
            }
        );
    }

    _parse_current_state(state) {
        const serial = state.get_child_value(0).get_uint32();
        if (serial <= this._serial)
            return;

        this._current_state = state;
        this._serial = serial;
        this.freeze_notify();

        try {
            this.notify('current-state');

            const properties = this.current_state.get_child_value(3);
            const layout_mode = properties.lookup_value('layout-mode', null)?.unpack();

            if (layout_mode !== this._layout_mode) {
                this._layout_mode = layout_mode;
                this.notify('layout-mode');
            }
        } finally {
            this.thaw_notify();
        }
    }

    unwatch() {
        if (this._change_handler) {
            this.dbus_connection.signal_unsubscribe(this._change_handler);
            this._change_handler = null;
        }

        this._cancellable?.cancel();
    }
});

export const Monitor = GObject.registerClass({
    Properties: {
        'connector': GObject.ParamSpec.string(
            'connector',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
        'vendor': GObject.ParamSpec.string(
            'vendor',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
        'product': GObject.ParamSpec.string(
            'product',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
        'serial': GObject.ParamSpec.string(
            'serial',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
        'display-name': GObject.ParamSpec.string(
            'display-name',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
    },
}, class DDTermMonitor extends GObject.Object {
    static properties_from_variant(variant) {
        const ids = variant.get_child_value(0);
        const [connector, vendor, product, serial] = ids.deep_unpack();
        const props = variant.get_child_value(2);
        const display_name =
            props.lookup_value('display-name', new GLib.VariantType('s'))?.unpack() ?? null;

        return { connector, vendor, product, serial, display_name };
    }

    matches(properties) {
        return Object.entries(properties).every(([k, v]) => this[k] === v);
    }
});

export const MonitorList = GObject.registerClass({
    Implements: [Gio.ListModel],
    Properties: {
        'current-state': GObject.param_spec_variant(
            'current-state',
            '',
            '',
            CURRENT_STATE_TYPE,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY
        ),
    },
}, class DDTermMonitorList extends GObject.Object {
    _init(params) {
        this._objects = [];

        super._init(params);
    }

    vfunc_get_item(position) {
        if (position >= this._objects.length)
            return 0;

        return this._objects[position];
    }

    vfunc_get_item_type() {
        return Monitor.$gtype;
    }

    vfunc_get_n_items() {
        return this._objects.length;
    }

    get current_state() {
        return this._current_state;
    }

    set current_state(value) {
        if (this._current_state?.equal(value))
            return;

        const monitors = value.get_child_value(1);
        const properties = Array.from(
            { length: monitors.n_children() },
            (_, i) => Monitor.properties_from_variant(monitors.get_child_value(i))
        );

        const max_same = Math.min(properties.length, this._objects.length);
        let same_head = 0;

        while (same_head < max_same && this._objects[same_head].matches(properties[same_head]))
            same_head++;

        const max_same_tail = max_same - same_head;
        let same_tail = 0;

        while (
            same_tail < max_same_tail &&
            this._objects[this._objects.length - same_tail - 1].matches(
                properties[properties.length - same_tail - 1]
            )
        )
            same_tail++;

        const n_same = same_head + same_tail;

        if (properties.length !== n_same || this._objects.length !== n_same) {
            const remove = this._objects.length - n_same;
            const add = [];

            for (let i = same_head; i < properties.length - same_tail; i++)
                add.push(new Monitor(properties[i]));

            this._objects.splice(same_head, remove, ...add);
            this.items_changed(same_head, remove, add.length);
        }

        this._current_state = value;
        this.notify('current-state');
    }
});
