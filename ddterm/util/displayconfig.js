// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

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
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.DBusConnection
        ),
        'current-state': GObject.param_spec_variant(
            'current-state',
            null,
            null,
            CURRENT_STATE_TYPE,
            null,
            GObject.ParamFlags.READABLE
        ),
        'layout-mode': GObject.ParamSpec.int(
            'layout-mode',
            null,
            null,
            GObject.ParamFlags.READABLE,
            0,
            2,
            0
        ),
        'error': GObject.ParamSpec.boxed(
            'error',
            null,
            null,
            GObject.ParamFlags.READABLE,
            GLib.Error
        ),
    },
}, class DDTermDisplayConfig extends GObject.Object {
    #current_state = null;
    #cancellable = null;
    #layout_mode = 0;
    #serial = -1;
    #change_handler;
    #error = null;

    constructor(params) {
        super(params);

        this.#change_handler = this.dbus_connection.signal_subscribe(
            BUS_NAME,
            INTERFACE_NAME,
            'MonitorsChanged',
            OBJECT_PATH,
            null,
            Gio.DBusSignalFlags.NONE,
            this.update.bind(this)
        );

        this.update();
    }

    init_async() {
        const handlers = [];

        return new Promise((resolve, reject) => {
            if (this.#error)
                reject(this.#error);

            if (this.#current_state)
                resolve(this.#current_state);

            handlers.push(this.connect('notify::error', () => {
                if (this.#error)
                    reject(this.#error);
            }));

            handlers.push(this.connect('notify::current-state', () => {
                if (this.#current_state)
                    resolve(this.#current_state);
            }));
        }).finally(() => {
            while (handlers.length)
                this.disconnect(handlers.pop());
        });
    }

    static new(dbus_connection = null) {
        if (!dbus_connection)
            dbus_connection = Gio.DBus.session;

        return new DisplayConfig({ dbus_connection });
    }

    get current_state() {
        return this.#current_state;
    }

    get layout_mode() {
        return this.#layout_mode;
    }

    get error() {
        return this.#error;
    }

    create_monitor_list() {
        const monitors = new MonitorList();

        this.bind_property(
            'current-state',
            monitors,
            'current-state',
            this.#current_state ? GObject.BindingFlags.SYNC_CREATE : GObject.BindingFlags.DEFAULT
        );

        return monitors;
    }

    update() {
        this.#cancellable?.cancel();
        this.#cancellable = new Gio.Cancellable();

        this.dbus_connection.call(
            BUS_NAME,
            OBJECT_PATH,
            INTERFACE_NAME,
            'GetCurrentState',
            null,
            CURRENT_STATE_TYPE,
            Gio.DBusCallFlags.NO_AUTO_START,
            -1,
            this.#cancellable,
            (source, result) => {
                try {
                    this.#parse_current_state(source.call_finish(result));
                } catch (error) {
                    if (error instanceof GLib.Error &&
                        error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED))
                        return;

                    logError(error);
                    this.#error = error;
                    this.notify(error);
                }
            }
        );
    }

    #parse_current_state(state) {
        const serial = state.get_child_value(0).get_uint32();

        if (serial <= this.#serial)
            return;

        this.#current_state = state;
        this.#serial = serial;
        this.freeze_notify();

        try {
            this.notify('current-state');

            const properties = this.current_state.get_child_value(3);
            const layout_mode = properties.lookup_value('layout-mode', null)?.unpack();

            if (layout_mode !== this.#layout_mode) {
                this.#layout_mode = layout_mode;
                this.notify('layout-mode');
            }

            if (this.#error) {
                this.#error = null;
                this.notify('error');
            }
        } finally {
            this.thaw_notify();
        }
    }

    unwatch() {
        if (this.#change_handler) {
            this.dbus_connection.signal_unsubscribe(this.#change_handler);
            this.#change_handler = null;
        }

        this.#cancellable?.cancel();

        this.#error = GLib.Error.new_literal(
            Gio.io_error_quark(),
            Gio.IOErrorEnum.CANCELLED,
            'Unsubscribed from notifications'
        );

        this.notify('error');
    }
});

export const Monitor = GObject.registerClass({
    Properties: {
        'connector': GObject.ParamSpec.string(
            'connector',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
        'vendor': GObject.ParamSpec.string(
            'vendor',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
        'product': GObject.ParamSpec.string(
            'product',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
        'serial': GObject.ParamSpec.string(
            'serial',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            ''
        ),
        'display-name': GObject.ParamSpec.string(
            'display-name',
            null,
            null,
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
            null,
            null,
            CURRENT_STATE_TYPE,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY
        ),
    },
}, class DDTermMonitorList extends GObject.Object {
    #objects = [];
    #current_state = null;

    vfunc_get_item(position) {
        if (position >= this.#objects.length)
            return 0;

        return this.#objects[position];
    }

    vfunc_get_item_type() {
        return Monitor.$gtype;
    }

    vfunc_get_n_items() {
        return this.#objects.length;
    }

    get current_state() {
        return this.#current_state;
    }

    set current_state(value) {
        if (this.#current_state?.equal(value))
            return;

        const monitors = value.get_child_value(1);
        const properties = Array.from(
            { length: monitors.n_children() },
            (_, i) => Monitor.properties_from_variant(monitors.get_child_value(i))
        );

        const max_same = Math.min(properties.length, this.#objects.length);
        let same_head = 0;

        while (same_head < max_same && this.#objects[same_head].matches(properties[same_head]))
            same_head++;

        const max_same_tail = max_same - same_head;
        let same_tail = 0;

        while (
            same_tail < max_same_tail &&
            this.#objects[this.#objects.length - same_tail - 1].matches(
                properties[properties.length - same_tail - 1]
            )
        )
            same_tail++;

        const n_same = same_head + same_tail;

        if (properties.length !== n_same || this.#objects.length !== n_same) {
            const remove = this.#objects.length - n_same;
            const add = [];

            for (let i = same_head; i < properties.length - same_tail; i++)
                add.push(new Monitor(properties[i]));

            this.#objects.splice(same_head, remove, ...add);
            this.items_changed(same_head, remove, add.length);
        }

        this.#current_state = value;
        this.notify('current-state');
    }
});
