// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Handy from 'gi://Handy';

import Gettext from 'gettext';

import { EntryRow } from '../pref/widgets/entryrow.js';
import { SwitchRow } from '../pref/widgets/switchrow.js';

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

        const toggle = new SwitchRow({
            visible: true,
            use_underline: true,
            title: Gettext.gettext('Use Custom Tab Title'),
        });

        this.bind_property(
            'use-custom-title',
            toggle,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.bind_property(
            'use-custom-title',
            entry,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );

        const group = new Handy.PreferencesGroup({
            visible: true,
        });

        group.add(toggle);
        group.add(entry);

        this.get_content_area().add(group);
    }
}
