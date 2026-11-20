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
    }
}

export class BackgroundEffectsGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermBackgroundEffectsGroup';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.title = this.gettext('Background Effects');

        const transparency_expander = this.add_expander_row({
            key: 'background-transparency-enabled',
            title: this.gettext('Transparency'),
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
        transparency_expander.add_row(opacity_row);

        const percent_format = new Intl.NumberFormat(undefined, { style: 'percent' });
        opacity_row.set_format_value_func((_, v) => percent_format.format(v));

        add_reset_button(opacity_row, this.settings, 'background-opacity', this.gettext_domain);

        const blur_adjustment = new Gtk.Adjustment({
            lower: 0,
            upper: 100,
            step_increment: 1,
            page_increment: 10,
        });

        this.settings.bind(
            'background-blur-radius',
            blur_adjustment,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        const blur_expander = this.add_expander_row({
            key: 'background-blur-enabled',
            title: this.gettext('Blur'),
        });

        const blur_row = new ScaleRow({
            adjustment: blur_adjustment,
            digits: 0,
            round_digits: 0,
            visible: true,
            use_underline: true,
            title: this.gettext('Blur Strength'),
        });
        blur_expander.add_row(blur_row);

        add_reset_button(blur_row, this.settings, 'background-blur-radius', this.gettext_domain);

        this.settings.bind_writable('background-opacity', opacity_row, 'sensitive', false);
        this.settings.bind_writable('background-blur-radius', blur_row, 'sensitive', false);
    }
}
