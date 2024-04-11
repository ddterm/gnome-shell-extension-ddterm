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

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import Gettext from 'gettext';

import { AccelLabel } from './accellabel.js';

export const TabLabel = GObject.registerClass({
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
        'reset-label': {},
    },
}, class DDTermTabLabel extends Gtk.EventBox {
    _init(params) {
        super._init(params);
        this.__heapgraph_name = this.constructor.$gtype.name;

        const layout = new Gtk.Box({
            visible: true,
            spacing: 10,
            parent: this,
        });

        this.shortcut_label = new AccelLabel({
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
            tooltip_text: Gettext.gettext('Close'),
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

    edit() {
        if (this._edit_popover) {
            this._edit_popover.popup();
            return;
        }

        const edit_entry = new Gtk.Entry({
            visible: true,
            secondary_icon_name: 'edit-clear',
            secondary_icon_activatable: true,
            secondary_icon_sensitive: true,
        });

        this._edit_popover = new Gtk.Popover({
            relative_to: this,
            child: edit_entry,
        });

        this._edit_popover.__heapgraph_name =
            `${this.__heapgraph_name}._edit_popover`;

        edit_entry.__heapgraph_name =
            `${this._edit_popover.__heapgraph_name}.child`;

        const activate_handler = edit_entry.connect('activate', () => {
            this._edit_popover.popdown();
        });

        const icon_press_handler = edit_entry.connect(
            'icon-press',
            () => {
                this._edit_popover.popdown();
                this.emit('reset-label');
            }
        );

        const text_binding = this.bind_property(
            'label',
            edit_entry,
            'text',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        const size_alloc_handler = this.connect('size-allocate', (_, allocation) => {
            edit_entry.width_request = allocation.width;
        });

        edit_entry.width_request = this.get_allocated_width();

        this._edit_popover.connect('closed', () => {
            edit_entry.disconnect(activate_handler);
            edit_entry.disconnect(icon_press_handler);
            this.disconnect(size_alloc_handler);
            text_binding.unbind();

            this._edit_popover = null;
        });

        this._edit_popover.popup();
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
});
