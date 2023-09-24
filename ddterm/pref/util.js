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

const { Gio, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();

function ui_file_uri(name) {
    return `${Me.dir.get_uri()}/ddterm/pref/ui/gtk${Gtk.get_major_version()}/${name}`;
}

/* exported ui_file_uri */

function set_scale_value_format(scale, format) {
    const formatter = (_, value) => format.format(value);

    if (scale.set_format_value_func)
        scale.set_format_value_func(formatter);
    else
        scale.connect('format-value', formatter);
}

/* exported set_scale_value_format */

function bind_widget(settings, key, widget, flags = Gio.SettingsBindFlags.DEFAULT) {
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

function bind_widgets(settings, mapping) {
    for (const [key, widget] of Object.entries(mapping))
        bind_widget(settings, key, widget);
}

function bind_sensitive(settings, key, widget, invert = false) {
    let flags = Gio.SettingsBindFlags.GET;

    if (invert)
        flags |= Gio.SettingsBindFlags.INVERT_BOOLEAN;

    settings.bind(key, widget, 'sensitive', flags);
}

/* exported bind_widget bind_widgets bind_sensitive */

function insert_settings_actions(widget, settings, keys) {
    const group = new Gio.SimpleActionGroup();

    for (const key of keys)
        group.add_action(settings.create_action(key));

    widget.insert_action_group('settings', group);
    return group;
}

/* exported insert_settings_actions */
