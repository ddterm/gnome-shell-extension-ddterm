// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { add_reset_button, PreferencesGroup } from './util.js';
import { ScaleRow } from './widgets/scalerow.js';

export class WindowAppearanceGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermWindowAppearanceGroup';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.title = this.gettext('Appearance');

        this.add_combo_text_row({
            key: 'theme-variant',
            title: this.gettext('Theme _Variant'),
            model: {
                system: this.gettext('Default'),
                light: this.gettext('Light'),
                dark: this.gettext('Dark'),
            },
        });

        const opacity_adjustment = new Gtk.Adjustment({
            upper: 1,
            step_increment: 0.01,
            page_increment: 0.10,
        });

        this.settings.bind(
            'background-opacity',
            opacity_adjustment,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        const opacity_row = new ScaleRow({
            adjustment: opacity_adjustment,
            digits: 2,
            round_digits: 2,
            visible: true,
            use_underline: true,
            title: this.gettext('_Background Opacity'),
        });

        const percent_format = new Intl.NumberFormat(undefined, { style: 'percent' });
        opacity_row.set_format_value_func((_, v) => percent_format.format(v));

        this.settings.bind_writable(
            'background-opacity',
            opacity_row,
            'sensitive',
            false
        );

        add_reset_button(opacity_row, this.settings, 'background-opacity', this.gettext_domain);

        const opacity_expander = this.add_expander_row({
            key: 'transparent-background',
            title: this.gettext('Transparent Background'),
        });

        opacity_expander.add_row(opacity_row);
    }
}
