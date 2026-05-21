// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import Gi from 'gi';

import { ActionRow } from './actionrow.js';

const AdwOrHdy = Gi.require(Gtk.get_major_version() === 3 ? 'Handy' : 'Adw');

export const SwitchRow = AdwOrHdy.SwitchRow ?? class extends ActionRow {
    static [GObject.GTypeName] = 'DDTermSwitchRow';

    static [GObject.properties] = {
        'active': GObject.ParamSpec.boolean(
            'active',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #slider;
    #slider_binding;

    constructor(params) {
        super(params);

        this.#slider = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            can_focus: false,
            visible: true,
        });

        this.set_activatable(true);
        this.set_activatable_widget(this.#slider);
        this.add_suffix(this.#slider);

        this.connect('notify::action-name', this.#update_active_binding.bind(this));
        this.#update_active_binding();

        this.bind_property(
            'action-name',
            this.#slider,
            'action-name',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.bind_property(
            'action-target',
            this.#slider,
            'action-target',
            GObject.BindingFlags.SYNC_CREATE
        );
    }

    #update_active_binding() {
        if (this.action_name) {
            this.#slider_binding?.unbind();
            this.#slider_binding = null;
        } else if (!this.#slider_binding) {
            this.#slider_binding = this.bind_property(
                'active',
                this.#slider,
                'active',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
            );
        }
    }
};
