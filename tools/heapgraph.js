// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

function intern_string(str) {
    // Otherwise dynamically generated strings don't work in __heapgraph_name
    return Symbol.for(str).description;
}

function get_heapgraph_name(obj) {
    const gtypename = intern_string(GObject.type_name_from_instance(obj));

    if (obj instanceof Gio.Action)
        return intern_string(`${gtypename}(${obj.name})`);

    return gtypename;
}

function set_heapgraph_name(obj) {
    if (!obj.__heapgraph_name)
        obj.__heapgraph_name = get_heapgraph_name(obj);
}

const old_object_init = GObject.Object.prototype._init;

GObject.Object.prototype._init = function (...args) {
    const result = old_object_init.call(this, ...args);

    set_heapgraph_name(result ?? this);

    return result;
};

const old_connect = GObject.Object.prototype.connect;

GObject.Object.prototype.connect = function connect(signal, handler) {
    set_heapgraph_name(this);

    handler.__heapgraph_name = intern_string(`${this.__heapgraph_name}::${signal}`);

    return old_connect.call(this, signal, handler);
};

const old_connect_after = GObject.Object.prototype.connect_after;

GObject.Object.prototype.connect_after = function connect_after(signal, handler) {
    set_heapgraph_name(this);

    handler.__heapgraph_name = intern_string(`${this.__heapgraph_name}::${signal}`);

    return old_connect_after.call(this, signal, handler);
};

const old_bind_property = GObject.Object.prototype.bind_property;

GObject.Object.prototype.bind_property = function bind_property(
    source_property,
    target,
    target_property,
    flags
) {
    set_heapgraph_name(this);
    set_heapgraph_name(target);

    return old_bind_property.call(this, source_property, target, target_property, flags);
};

const old_bind_property_full = GObject.Object.prototype.bind_property_full;

GObject.Object.prototype.bind_property_full = function bind_property_full(
    source_property,
    target,
    target_property,
    flags,
    transform_to,
    transform_from
) {
    set_heapgraph_name(this);
    set_heapgraph_name(target);

    return old_bind_property_full.call(
        this,
        source_property,
        target,
        target_property,
        flags,
        transform_to,
        transform_from
    );
};

const old_settings_bind = Gio.Settings.prototype.bind;

Gio.Settings.prototype.bind = function bind(key, object, property, flags) {
    set_heapgraph_name(this);
    set_heapgraph_name(object);

    return old_settings_bind.call(this, key, object, property, flags);
};

const old_settings_bind_writable = Gio.Settings.prototype.bind_writable;

Gio.Settings.prototype.bind_writable = function bind_writable(key, object, property, inverted) {
    set_heapgraph_name(this);
    set_heapgraph_name(object);

    return old_settings_bind_writable.call(this, key, object, property, inverted);
};
