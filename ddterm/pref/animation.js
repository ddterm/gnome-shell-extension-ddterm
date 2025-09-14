// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    bind_sensitive,
    bind_widgets,
    insert_settings_actions,
    set_scale_value_format,
    ui_file_uri,
} from './util.js';

export const AnimationWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsAnimation',
    Template: ui_file_uri('prefs-animation.ui'),
    Children: [
        'animation_prefs',
        'show_animation_combo',
        'hide_animation_combo',
        'show_animation_duration_scale',
        'hide_animation_duration_scale',
    ],
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class PrefsAnimation extends Gtk.Box {
    constructor(params) {
        super(params);

        insert_settings_actions(this, this.settings, ['override-window-animation']);
        bind_sensitive(this.settings, 'override-window-animation', this.animation_prefs);

        bind_widgets(this.settings, {
            'show-animation': this.show_animation_combo,
            'show-animation-duration': this.show_animation_duration_scale,
            'hide-animation': this.hide_animation_combo,
            'hide-animation-duration': this.hide_animation_duration_scale,
        });

        const seconds_format = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'second' });
        set_scale_value_format(this.show_animation_duration_scale, seconds_format);
        set_scale_value_format(this.hide_animation_duration_scale, seconds_format);
    }

    get title() {
        return this.gettext_domain.gettext('Animation');
    }
});
