// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

const BASE_URI = `@PREF_BASE_URI@`;
const UI_BASE_URI =
    GLib.Uri.resolve_relative(BASE_URI, `ui/gtk${Gtk.get_major_version()}/`, GLib.UriFlags.NONE);

export function callback_stack() {
    const stack = [];

    function call() {
        while (stack.length) {
            // eslint-disable-next-line no-invalid-this
            stack.pop().call(this);
        }
    }

    call.push = stack.push.bind(stack);

    return call;
}

export function connect(object, name, handler) {
    const handler_id = GObject.signal_connect(object, name, handler);

    return GObject.Object.prototype.disconnect.bind(object, handler_id);
}

export function connect_after(object, name, handler) {
    const handler_id = GObject.signal_connect_after(object, name, handler);

    return GObject.Object.prototype.disconnect.bind(object, handler_id);
}

export function bind_property(source, source_property, target, target_property, flags) {
    const binding = GObject.Object.prototype.bind_property.call(
        source,
        source_property,
        target,
        target_property,
        flags
    );

    return binding.unbind.bind(binding);
}

export function bind_settings(settings, key, object, property, flags) {
    settings.bind(key, object, property, flags);

    return () => Gio.Settings.unbind(object, property);
}

export function bind_settings_writable(settings, key, object, property, invert_boolean) {
    settings.bind_writable(key, object, property, invert_boolean);

    return () => Gio.Settings.unbind(object, property);
}

export function ui_file_uri(name) {
    return GLib.Uri.resolve_relative(UI_BASE_URI, name, GLib.UriFlags.NONE);
}

export function set_scale_value_format(scale, format) {
    const formatter = (_, value) => format.format(value);

    if (scale.set_format_value_func) {
        scale.set_format_value_func(formatter);

        return () => scale.set_format_value_func(null);
    } else {
        return connect(scale, 'format-value', formatter);
    }
}

export function bind_widget(settings, key, widget, flags = Gio.SettingsBindFlags.DEFAULT) {
    const unbind = callback_stack();

    if (!(flags & Gio.SettingsBindFlags.NO_SENSITIVITY)) {
        unbind.push(bind_settings_writable(settings, key, widget, 'sensitive', false));
        flags |= Gio.SettingsBindFlags.NO_SENSITIVITY;
    }

    let target = widget;
    let property;

    if (widget instanceof Gtk.ComboBox) {
        property = 'active-id';
    } else if (widget instanceof Gtk.Range) {
        target = widget.get_adjustment();
        property = 'value';
    } else if (widget instanceof Gtk.SpinButton) {
        property = 'value';
    } else if (widget instanceof Gtk.Entry) {
        property = 'text';
    } else if (widget instanceof Gtk.TextView) {
        target = widget.buffer;
        property = 'text';
    } else if (widget instanceof Gtk.CheckButton) {
        property = 'active';
    } else if (widget instanceof Gtk.FontChooser) {
        property = 'font';
    } else {
        throw new Error(`Widget ${widget} of unsupported type for setting ${key}`);
    }

    unbind.push(bind_settings(settings, key, target, property, flags));

    return unbind;
}

export function bind_widgets(settings, mapping) {
    const unbind = callback_stack();

    for (const [key, widget] of Object.entries(mapping))
        unbind.push(bind_widget(settings, key, widget));

    return unbind;
}

export function bind_sensitive(settings, key, widget, invert = false) {
    let flags = Gio.SettingsBindFlags.GET;

    if (invert)
        flags |= Gio.SettingsBindFlags.INVERT_BOOLEAN;

    return bind_settings(settings, key, widget, 'sensitive', flags);
}

export function make_settings_actions(settings, keys) {
    const group = new Gio.SimpleActionGroup();

    for (const key of keys)
        group.add_action(settings.create_action(key));

    return group;
}

export function insert_action_group(widget, name, group) {
    widget.insert_action_group(name, group);

    return () => widget.insert_action_group(name, null);
}
