// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { PreferencesGroup, SpinRow } from './util.js';

export class ScrollingGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermScrollingPreferencesGroup';

    static {
        GObject.registerClass(this);
    }

    #lines_adjustment;
    #lines_row;

    constructor(params) {
        super(params);

        this.title = this.gettext('Scrolling');

        this.add_switch_row({
            key: 'show-scrollbar',
            title: this.gettext('Show _Scrollbar'),
        });

        this.add_switch_row({
            key: 'scroll-on-output',
            title: this.gettext('Scroll On Output'),
        });

        this.add_switch_row({
            key: 'scroll-on-keystroke',
            title: this.gettext('Scroll On Keystroke'),
        });

        this.add_switch_row({
            key: 'scrollback-unlimited',
            title: this.gettext('Unlimited Scrollback'),
        });

        this.#lines_adjustment = new Gtk.Adjustment({
            upper: 1000000000,
            step_increment: 1,
            page_increment: 10,
        });

        this.#lines_row = new SpinRow({
            title: this.gettext('Scrollback Lines'),
            adjustment: this.#lines_adjustment,
            visible: true,
            snap_to_ticks: true,
            numeric: true,
        });

        this.settings.bind(
            'scrollback-lines',
            this.#lines_adjustment,
            'value',
            Gio.SettingsBindFlags.NO_SENSITIVITY
        );

        this.add(this.#lines_row);

        this.connect('realize', this.#realize.bind(this));
    }

    #realize() {
        const update_sensitivity = this.#update_sensitivity.bind(this);

        const settings_handlers = [
            this.settings.connect('writable-changed::scrollback-lines', update_sensitivity),
            this.settings.connect('changed::scrollback-unlimited', update_sensitivity),
        ];

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);

            for (const handler of settings_handlers)
                this.settings.disconnect(handler);
        });

        this.#update_sensitivity();
    }

    #update_sensitivity() {
        this.#lines_row.sensitive = !this.settings.get_boolean('scrollback-unlimited') &&
            this.settings.is_writable('scrollback-lines');
    }
}
