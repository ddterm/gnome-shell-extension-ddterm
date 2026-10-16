// SPDX-FileCopyrightText: 2026 spi
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ColorRow } from './colors.js';
import { ScaleRow } from './widgets/scalerow.js';
import { add_reset_button, PreferencesGroup } from './util.js';

export class TerminalPaddingGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermTerminalPaddingPreferencesGroup';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.title = this.gettext('Padding');

        for (const [key, title] of [
            ['terminal-padding-horizontal', this.gettext('Horizontal (px per side)')],
            ['terminal-padding-vertical', this.gettext('Vertical (px per side)')],
        ]) {
            const adjustment = new Gtk.Adjustment({
                lower: 0,
                upper: 64,
                step_increment: 1,
                page_increment: 8,
            });

            const row = new ScaleRow({
                title,
                adjustment,
                digits: 0,
                round_digits: 0,
                visible: true,
            });

            row.set_format_value_func((_, value) => `${Math.round(value)} px`);

            this.settings.bind(key, adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind_writable(key, row, 'sensitive', false);
            add_reset_button(row, this.settings, key, this.gettext_domain);
            this.add(row);
        }

        const custom_color = this.add_expander_row({
            key: 'terminal-padding-custom-color',
            title: this.gettext('Custom Padding Color'),
        });

        custom_color.add_row(ColorRow.create({
            title: this.gettext('Padding Color'),
            settings: this.settings,
            key: 'terminal-padding-color',
            gettext_domain: this.gettext_domain,
        }));
    }
}
