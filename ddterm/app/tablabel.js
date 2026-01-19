// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import Handy from 'gi://Handy';

import Gettext from 'gettext';

import { AccelLabel } from './accellabel.js';
import { EntryRow } from '../pref/util.js';

export class TabTitleDialog extends Gtk.Dialog {
    static [GObject.GTypeName] = 'DDTermTabTitleDialog';

    static [GObject.properties] = {
        'use-custom-title': GObject.ParamSpec.boolean(
            'use-custom-title',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'custom-title': GObject.ParamSpec.string(
            'custom-title',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            ''
        ),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            title: Gettext.gettext('Set Custom Tab Title'),
            ...params,
        });

        const entry = new EntryRow({
            visible: true,
            use_underline: true,
            title: Gettext.gettext('Tab _title:'),
        });

        this.bind_property(
            'custom-title',
            entry,
            'text',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        const expander = new Handy.ExpanderRow({
            visible: true,
            show_enable_switch: true,
            use_underline: true,
            title: Gettext.gettext('Use Custom Tab Title'),
        });

        expander.add(entry);

        this.bind_property(
            'use-custom-title',
            expander,
            'enable-expansion',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        const group = new Handy.PreferencesGroup({
            visible: true,
        });

        group.add(expander);

        this.get_content_area().add(group);
    }
}

export const TabLabel = GObject.registerClass({
    Implements: [Gtk.Actionable],
    Properties: {
        'label': GObject.ParamSpec.string(
            'label',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            ''
        ),
        'close-button': GObject.ParamSpec.boolean(
            'close-button',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'ellipsize': GObject.ParamSpec.enum(
            'ellipsize',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Pango.EllipsizeMode,
            Pango.EllipsizeMode.NONE
        ),
        'show-shortcut': GObject.ParamSpec.boolean(
            'show-shortcut',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            true
        ),
        'action-name': GObject.ParamSpec.override('action-name', Gtk.Actionable),
        'action-target': GObject.ParamSpec.override('action-target', Gtk.Actionable),
        'context-menu-model': GObject.ParamSpec.object(
            'context-menu-model',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gio.MenuModel
        ),
    },
    Signals: {
        'close': {},
    },
}, class DDTermTabLabel extends Gtk.EventBox {
    _init(params) {
        super._init(params);

        this.connect_after('button-press-event', this._button_press_event.bind(this));
        this.connect('popup-menu', this._popup_menu.bind(this));

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

    _button_press_event(terminal, event) {
        if (!event.triggers_context_menu())
            return false;

        const menu = Gtk.Menu.new_from_model(this.context_menu_model);

        menu.__heapgraph_name = 'DDTermTabLabelContextMenu';
        menu.attach_to_widget(this, (widget, m) => m.destroy());
        menu.connect('selection-done', m => m.detach());
        menu.popup_at_pointer(event);

        return true;
    }

    _popup_menu() {
        const menu = Gtk.Menu.new_from_model(this.context_menu_model);

        menu.__heapgraph_name = 'DDTermTabLabelContextMenu';
        menu.attach_to_widget(this, (widget, m) => m.destroy());
        menu.connect('selection-done', m => m.detach());
        menu.popup_at_widget(this, Gdk.Gravity.SOUTH, Gdk.Gravity.SOUTH, null);

        return true;
    }
});
