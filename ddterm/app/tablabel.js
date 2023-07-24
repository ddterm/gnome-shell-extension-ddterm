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
const { translations } = imports.ddterm.util;

var TabLabel = GObject.registerClass(
    {
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
        }
    }
);

/* exported TabLabel */
