// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import Gi from 'gi';

import { ActionRow } from './actionrow.js';

const AdwOrHdy = Gi.require(Gtk.get_major_version() === 3 ? 'Handy' : 'Adw');

export const SpinRow = AdwOrHdy.SpinRow ?? class extends ActionRow {
    static [GObject.GTypeName] = 'DDTermSpinRow';

    static [GObject.properties] = {
        'adjustment': GObject.ParamSpec.object(
            'adjustment',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gtk.Adjustment
        ),
        'digits': GObject.ParamSpec.int(
            'digits',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            0,
            20,
            0
        ),
        'numeric': GObject.ParamSpec.boolean(
            'numeric',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'snap-to-ticks': GObject.ParamSpec.boolean(
            'snap-to-ticks',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'value': GObject.ParamSpec.double(
            'value',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            -Number.MAX_VALUE,
            Number.MAX_VALUE,
            0
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #spin;

    constructor(params) {
        super(params);

        this.#spin = new Gtk.SpinButton({
            visible: true,
            hexpand: true,
            valign: Gtk.Align.CENTER,
        });

        for (const prop of ['snap-to-ticks', 'numeric', 'digits', 'adjustment'])
            this.bind_property(prop, this.#spin, prop, GObject.BindingFlags.SYNC_CREATE);

        this.bind_property(
            'value',
            this.#spin,
            'value',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.set_activatable(true);
        this.set_activatable_widget(this.#spin);
        this.add_suffix(this.#spin);
    }
};
