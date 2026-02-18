// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Handy from 'gi://Handy';

import Gettext from 'gettext';

class EntryRow extends Handy.ActionRow {
    static [GObject.GTypeName] = 'DDTermTabTitleEntryRow';

    static [GObject.properties] = {
        'text': GObject.ParamSpec.string(
            'text',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            ''
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #entry;

    constructor(params) {
        super(params);

        this.#entry = new Gtk.Entry({
            visible: true,
            hexpand: true,
            valign: Gtk.Align.CENTER,
        });

        this.bind_property(
            'text',
            this.#entry,
            'text',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.set_activatable(true);
        this.set_activatable_widget(this.#entry);
        this.add(this.#entry);
    }
}

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
            title: Gettext.gettext('Tab _Title'),
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
