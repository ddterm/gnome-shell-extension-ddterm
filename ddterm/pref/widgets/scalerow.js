// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { ActionRow } from './actionrow.js';

export class ScaleRow extends ActionRow {
    static [GObject.GTypeName] = 'DDTermScaleRow';

    static [GObject.properties] = {
        'adjustment': GObject.ParamSpec.object(
            'adjustment',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gtk.Adjustment
        ),
        'round-digits': GObject.ParamSpec.int(
            'round-digits',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            -1,
            GLib.MAXINT32,
            -1
        ),
        'digits': GObject.ParamSpec.int(
            'digits',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            -1,
            32,
            1
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #scale;
    #format_handler;

    constructor(params) {
        super(params);

        this.#scale = new Gtk.Scale({
            visible: true,
            hexpand: true,
            valign: Gtk.Align.CENTER,
            draw_value: true,
        });

        for (const prop of ['round-digits', 'digits', 'adjustment'])
            this.bind_property(prop, this.#scale, prop, GObject.BindingFlags.SYNC_CREATE);

        this.set_activatable(true);
        this.set_activatable_widget(this.#scale);
        this.add_suffix(this.#scale);
    }

    set_format_value_func(formatter) {
        if (this.#format_handler)
            this.#scale.disconnect(this.#format_handler);

        if (this.#scale.set_format_value_func)
            this.#scale.set_format_value_func(formatter);
        else
            this.#format_handler = this.#scale.connect('format-value', formatter);
    }
}
