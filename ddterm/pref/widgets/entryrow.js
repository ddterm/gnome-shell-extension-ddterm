// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import Gi from 'gi';

import { ActionRow } from './actionrow.js';

const AdwOrHdy = Gi.require(Gtk.get_major_version() === 3 ? 'Handy' : 'Adw');

export const EntryRow = AdwOrHdy.EntryRow ?? class extends ActionRow {
    static [GObject.GTypeName] = 'DDTermEntryRow';

    static [GObject.properties] = {
        'text': GObject.ParamSpec.string(
            'text',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            ''
        ),
        'width-chars': GObject.ParamSpec.int(
            'width-chars',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            -1,
            GLib.MAXINT32,
            -1
        ),
        'max-width-chars': GObject.ParamSpec.int(
            'max-width-chars',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            -1,
            GLib.MAXINT32,
            -1
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

        this.bind_property(
            'width-chars',
            this.#entry,
            'width-chars',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.bind_property(
            'max-width-chars',
            this.#entry,
            'max-width-chars',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.set_activatable(true);
        this.set_activatable_widget(this.#entry);
        this.add_suffix(this.#entry);
    }
};
