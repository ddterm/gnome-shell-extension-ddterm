// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
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
        'context-menu-model': GObject.ParamSpec.object(
            'context-menu-model',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gio.MenuModel
        ),
    },
    Signals: {
        'close': {},
        'reset-label': {},
    },
}, class DDTermTabLabel extends Gtk.Box {
    _init(params) {
        super._init({ spacing: 10, ...params });

        this._setup_popup_menu();

        this.shortcut_label = new AccelLabel({
            visible: true,
        });

        this.append(this.shortcut_label);

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

        this.append(label);

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
            icon_name: 'window-close',
            visible: true,
            focus_on_click: false,
            has_frame: false,
        });

        this.append(close_button);

        this.bind_property(
            'close-button',
            close_button,
            'visible',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.connect('realize', () => {
            const handler = close_button.connect('clicked', () => this.emit('close'));
            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);
                close_button.disconnect(handler);
            });
        });

        const edit_entry = new Gtk.Entry({
            visible: true,
            secondary_icon_name: 'edit-clear',
            secondary_icon_activatable: true,
            secondary_icon_sensitive: true,
            width_chars: 50,
        });

        this.bind_property(
            'label',
            edit_entry,
            'text',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.edit_popover = new Gtk.Popover({
            visible: false,
            child: edit_entry,
            autohide: true,
        });

        this.connect('realize', () => {
            const activate_handler =
                edit_entry.connect('activate', () => this.edit_popover.popdown());

            const icon_handler = edit_entry.connect('icon-press', () => {
                this.edit_popover.popdown();
                this.emit('reset-label');
            });

            this.edit_popover.set_parent(this);

            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);
                edit_entry.disconnect(activate_handler);
                edit_entry.disconnect(icon_handler);
                this.edit_popover.unparent();
            });
        });
    }

    _setup_popup_menu() {
        const gesture = Gtk.GestureClick.new();
        this.add_controller(gesture);
        gesture.button = 0;
        gesture.exclusive = true;

        this.connect('realize', () => {
            // eslint-disable-next-line no-shadow
            const handler = gesture.connect('pressed', (gesture, n_press, x, y) => {
                const event = gesture.get_current_event();

                if (event.triggers_context_menu()) {
                    gesture.set_state(Gtk.EventSequenceState.CLAIMED);
                    this.show_popup_menu(x, y, event.get_pointer_emulated());
                }
            });

            const create_handler = this.connect(
                'notify::context-menu-model',
                this._create_context_menu.bind(this)
            );

            const unrealize_handler = this.connect('unrealize', () => {
                this.disconnect(unrealize_handler);
                this.disconnect(create_handler);
                gesture.disconnect(handler);
            });

            this._create_context_menu();
        });

        this.connect('unrealize', () => {
            this._context_menu?.unparent();
            this._context_menu = null;
        });
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

    _create_context_menu() {
        this._context_menu?.unparent();

        if (!this.context_menu_model) {
            this._context_menu = null;
            return;
        }

        this._context_menu = Gtk.PopoverMenu.new_from_model(this.context_menu_model);
        this._context_menu.__heapgraph_name = 'DDTermTabLabelContextMenu';
        this._context_menu.set_parent(this);
    }

    show_popup_menu(x, y, is_touch = false) {
        if (is_touch)
            this._context_menu.halign = Gtk.Align.FILL;
        else if (this.get_direction() === Gtk.TextDirection.RTL)
            this._context_menu.halign = Gtk.Align.END;
        else
            this._context_menu.halign = Gtk.Align.START;

        this._context_menu.autohide = true;
        this._context_menu.cascade_popdown = true;
        this._context_menu.has_arrow = is_touch;
        this._context_menu.position = is_touch ? Gtk.PositionType.TOP : Gtk.PositionType.BOTTOM;
        this._context_menu.pointing_to = new Gdk.Rectangle({ x, y, width: 0, height: 0 });

        this._context_menu.popup();
    }
});
