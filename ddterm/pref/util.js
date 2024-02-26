// SPDX-FileCopyrightText: © 2022 Aleksandr Mezin
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

// BEGIN !ESM
const Me = imports.misc.extensionUtils.getCurrentExtension();
// END !ESM

export function set_scale_value_format(scale, format) {
    const formatter = (_, value) => format.format(value);

    if (scale.set_format_value_func)
        scale.set_format_value_func(formatter);
    else
        scale.connect('format-value', formatter);
}

export function bind_widget(settings, key, widget, flags = Gio.SettingsBindFlags.DEFAULT) {
    if (!(flags & Gio.SettingsBindFlags.NO_SENSITIVITY)) {
        settings.bind_writable(key, widget, 'sensitive', false);
        flags |= Gio.SettingsBindFlags.NO_SENSITIVITY;
    }

    if (widget instanceof Gtk.ComboBox)
        settings.bind(key, widget, 'active-id', flags);

    else if (widget instanceof Gtk.Range)
        settings.bind(key, widget.get_adjustment(), 'value', flags);

    else if (widget instanceof Gtk.SpinButton)
        settings.bind(key, widget, 'value', flags);

    else if (widget instanceof Gtk.Entry)
        settings.bind(key, widget, 'text', flags);

    else if (widget instanceof Gtk.TextView)
        settings.bind(key, widget.buffer, 'text', flags);

    else if (widget instanceof Gtk.CheckButton)
        settings.bind(key, widget, 'active', flags);

    else if (widget instanceof Gtk.FontChooser)
        settings.bind(key, widget, 'font', flags);

    else
        throw new Error(`Widget ${widget} of unsupported type for setting ${key}`);
}

export function bind_widgets(settings, mapping) {
    for (const [key, widget] of Object.entries(mapping))
        bind_widget(settings, key, widget);
}

export function bind_sensitive(settings, key, widget, invert = false) {
    let flags = Gio.SettingsBindFlags.GET;

    if (invert)
        flags |= Gio.SettingsBindFlags.INVERT_BOOLEAN;

    settings.bind(key, widget, 'sensitive', flags);
}

export function insert_settings_actions(widget, settings, keys) {
    const group = new Gio.SimpleActionGroup();

    for (const key of keys)
        group.add_action(settings.create_action(key));

    widget.insert_action_group('settings', group);
    return group;
}

export function ui_file_uri(name) {
    // BEGIN ESM
    return GLib.Uri.resolve_relative(
        import.meta.url,
        `ui/gtk${Gtk.get_major_version()}/${name}`,
        GLib.UriFlags.NONE
    );
    // END ESM
    // BEGIN !ESM
    // eslint-disable-next-line no-unreachable -- eslint doesn't understand our "preprocessor"
    return `${Me.dir.get_uri()}/ddterm/pref/ui/gtk${Gtk.get_major_version()}/${name}`;
    // END !ESM
}
