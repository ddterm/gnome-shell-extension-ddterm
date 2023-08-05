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

'use strict';

const { GObject, Gtk, Pango } = imports.gi;
const { accellabel } = imports.ddterm.app;
const { translations } = imports.ddterm.util;

var TabLabel = GObject.registerClass(
    {
        Implements: [Gtk.Actionable],
        Properties: {
            'label': GObject.ParamSpec.string(
                'label',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                ''
            ),
            'close-button': GObject.ParamSpec.boolean(
                'close-button',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                true
            ),
            'ellipsize': GObject.ParamSpec.enum(
                'ellipsize',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                Pango.EllipsizeMode,
                Pango.EllipsizeMode.NONE
            ),
            'show-shortcut': GObject.ParamSpec.boolean(
                'show-shortcut',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                true
            ),
            'action-name': GObject.ParamSpec.override('action-name', Gtk.Actionable),
            'action-target': GObject.ParamSpec.override('action-target', Gtk.Actionable),
        },
        Signals: {
            'close': {},
        },
    },
    class DDTermTabLabel extends Gtk.EventBox {
        _init(params) {
            super._init(params);

            const layout = new Gtk.Box({
                visible: true,
                spacing: 10,
                parent: this,
            });

            this.shortcut_label = new accellabel.AccelLabel({
                visible: true,
            });

            layout.pack_start(this.shortcut_label, false, false, 0);

            this.bind_property(
                'show-shortcut',
                this.shortcut_label,
                'visible',
                GObject.BindingFlags.SYNC_CREATE
            );

            this.shortcut_label.get_style_context().add_class('tab-title-shortcut');

            const label = new Gtk.Label({
                visible: true,
            });

            layout.pack_start(label, true, true, 0);

            this.bind_property(
                'label',
                label,
                'label',
                GObject.BindingFlags.SYNC_CREATE
            );

            this.bind_property(
                'ellipsize',
                label,
                'ellipsize',
                GObject.BindingFlags.SYNC_CREATE
            );

            const close_button = new Gtk.Button({
                tooltip_text: translations.gettext('Close'),
                image: new Gtk.Image({
                    icon_name: 'window-close',
                    visible: true,
                }),
                visible: true,
                focus_on_click: false,
                relief: Gtk.ReliefStyle.NONE,
            });

            layout.pack_end(close_button, false, false, 0);

            this.bind_property(
                'close-button',
                close_button,
                'visible',
                GObject.BindingFlags.SYNC_CREATE
            );

            close_button.connect('clicked', () => this.emit('close'));

            this.edit_popover = new Gtk.Popover({
                relative_to: this,
            });

            this.connect('destroy', () => this.edit_popover.destroy());

            const edit_entry = new Gtk.Entry({
                visible: true,
                parent: this.edit_popover,
            });

            edit_entry.bind_property(
                'text-length',
                edit_entry,
                'width-chars',
                GObject.BindingFlags.SYNC_CREATE
            );

            this.bind_property(
                'label',
                edit_entry,
                'text',
                GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
            );
        }

        edit() {
            this.edit_popover.popup();
        }

        get action_name() {
            return this.shortcut_label.action_name;
        }

        vfunc_get_action_name() {
            return this.shortcut_label.get_action_name();
        }

        get action_target() {
            return this.shortcut_label.action_target;
        }

        vfunc_get_action_target_value() {
            return this.shortcut_label.get_action_target_value();
        }

        set action_name(value) {
            this.shortcut_label.action_name = value;
        }

        vfunc_set_action_name(value) {
            this.shortcut_label.set_action_name(value);
        }

        set action_target(value) {
            this.shortcut_label.action_target = value;
        }

        vfunc_set_action_target_value(value) {
            this.shortcut_label.set_action_target_value(value);
        }
    }
);

/* exported TabLabel */
