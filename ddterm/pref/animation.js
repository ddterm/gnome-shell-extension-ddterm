// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { PreferencesGroup, ScaleRow, ComboTextItem } from './util.js';

export class AnimationGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermAnimationPreferencesGroup';

    static {
        GObject.registerClass(this);
    }

    #show_animation_combo;
    #show_animation_duration_scale;
    #hide_animation_combo;
    #hide_animation_duration_scale;

    constructor(params) {
        super(params);

        this.title = this.gettext('Animation');

        this.add_switch_row({
            key: 'override-window-animation',
            title: this.gettext('_Override default window animations'),
        });

        const animations = ComboTextItem.create_list({
            'disable': this.gettext('Disable'),
            'linear': this.gettext('Linear tweening'),
            'ease-in-quad': this.gettext('Quadratic tweening'),
            'ease-out-quad': this.gettext('Quadratic tweening, inverse'),
            'ease-in-out-quad': this.gettext('Quadratic tweening, combining direct and inverse'),
            'ease-in-cubic': this.gettext('Cubic tweening'),
            'ease-out-cubic': this.gettext('Cubic tweening, inverse'),
            'ease-in-out-cubic': this.gettext('Cubic tweening, combining direct and inverse'),
            'ease-in-quart': this.gettext('Quartic tweening'),
            'ease-out-quart': this.gettext('Quartic tweening, inverse'),
            'ease-in-out-quart': this.gettext('Quartic tweening, combining direct and inverse'),
            'ease-in-quint': this.gettext('Quintic tweening'),
            'ease-out-quint': this.gettext('Quintic tweening, inverse'),
            'ease-in-out-quint': this.gettext('Quintic tweening, combining direct and inverse'),
            'ease-in-sine': this.gettext('Sinusoidal tweening'),
            'ease-out-sine': this.gettext('Sinusoidal tweening, inverse'),
            'ease-in-out-sine': this.gettext('Sinusoidal tweening, combining direct and inverse'),
            'ease-in-expo': this.gettext('Exponential tweening'),
            'ease-out-expo': this.gettext('Exponential tweening, inverse'),
            'ease-in-out-expo': this.gettext('Exponential tweening, combining direct and inverse'),
            'ease-in-circ': this.gettext('Circular tweening'),
            'ease-out-circ': this.gettext('Circular tweening, inverse'),
            'ease-in-out-circ': this.gettext('Circular tweening, combining direct and inverse'),
            'ease-in-elastic': this.gettext('Elastic tweening, with offshoot on start'),
            'ease-out-elastic': this.gettext('Elastic tweening, with offshoot on end'),
            'ease-in-out-elastic': this.gettext('Elastic tweening with offshoot on both ends'),
            'ease-in-back': this.gettext('Overshooting cubic tweening, with backtracking on start'),
            'ease-out-back': this.gettext('Overshooting cubic tweening, with backtracking on end'),
            'ease-in-out-back': this.gettext(
                'Overshooting cubic tweening, with backtracking on both ends'
            ),
            'ease-in-bounce': this.gettext(
                'Exponentially decaying parabolic (bounce) tweening, with bounce on start'
            ),
            'ease-out-bounce': this.gettext(
                'Exponentially decaying parabolic (bounce) tweening, with bounce on end'
            ),
            'ease-in-out-bounce': this.gettext(
                'Exponentially decaying parabolic (bounce) tweening, with bounce on both ends'
            ),
        });

        const duration_params = {
            lower: 0.001,
            upper: 1,
            step_increment: 0.01,
            page_increment: 0.1,
        };

        const show_animation_duration_adjustment = new Gtk.Adjustment(duration_params);

        this.settings.bind(
            'show-animation-duration',
            show_animation_duration_adjustment,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        const hide_animation_duration_adjustment = new Gtk.Adjustment(duration_params);

        this.settings.bind(
            'hide-animation-duration',
            hide_animation_duration_adjustment,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        this.#show_animation_combo = this.add_combo_text_row({
            key: 'show-animation',
            title: this.gettext('_Show animation'),
            model: animations,
            flags: Gio.SettingsBindFlags.NO_SENSITIVITY,
        });

        this.#show_animation_duration_scale = new ScaleRow({
            adjustment: show_animation_duration_adjustment,
            digits: 2,
            round_digits: 2,
            visible: true,
            use_underline: true,
            title: this.gettext('_Show animation duration'),
        });

        this.settings.bind_writable(
            'show-animation-duration',
            this.#show_animation_duration_scale,
            'sensitive',
            false
        );

        this.add(this.#show_animation_duration_scale);

        this.#hide_animation_combo = this.add_combo_text_row({
            key: 'hide-animation',
            title: this.gettext('_Hide animation'),
            model: animations,
            flags: Gio.SettingsBindFlags.NO_SENSITIVITY,
        });

        this.#hide_animation_duration_scale = new ScaleRow({
            adjustment: hide_animation_duration_adjustment,
            digits: 2,
            round_digits: 2,
            visible: true,
            use_underline: true,
            title: this.gettext('_Hide animation duration'),
        });

        this.settings.bind_writable(
            'hide-animation-duration',
            this.#hide_animation_duration_scale,
            'sensitive',
            false
        );

        this.add(this.#hide_animation_duration_scale);

        const seconds_format = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'second' });
        const seconds_format_value_func = (_, v) => seconds_format.format(v);

        this.#show_animation_duration_scale.set_format_value_func(seconds_format_value_func);
        this.#hide_animation_duration_scale.set_format_value_func(seconds_format_value_func);

        this.connect('realize', this.#realize.bind(this));
    }

    #realize() {
        const update = this.#update_sensitivity.bind(this);

        const handlers = [
            this.settings.connect('changed::override-window-animation', update),
            this.settings.connect('changed::show-animation', update),
            this.settings.connect('writable-changed::show-animation', update),
            this.settings.connect('writable-changed::show-animation-duration', update),
            this.settings.connect('changed::hide-animation', update),
            this.settings.connect('writable-changed::hide-animation', update),
            this.settings.connect('writable-changed::hide-animation-duration', update),
        ];

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);

            for (const handler of handlers)
                this.settings.disconnect(handler);
        });

        this.#update_sensitivity();
    }

    #update_sensitivity() {
        const enable = this.settings.get_boolean('override-window-animation');

        this.#show_animation_combo.sensitive =
            enable && this.settings.is_writable('show-animation');

        this.#show_animation_duration_scale.sensitive = enable &&
            this.settings.get_string('show-animation') !== 'disable' &&
            this.settings.is_writable('show-animation-duration');

        this.#hide_animation_combo.sensitive =
            enable && this.settings.is_writable('hide-animation');

        this.#hide_animation_duration_scale.sensitive = enable &&
            this.settings.get_string('hide-animation') !== 'disable' &&
            this.settings.is_writable('hide-animation-duration');
    }
}
