// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    bind_sensitive,
    bind_widgets,
    callback_stack,
    insert_action_group,
    make_settings_actions,
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
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'gettext-context': GObject.ParamSpec.jsobject(
            'gettext-context',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class PrefsAnimation extends Gtk.Box {
    _init(params) {
        super._init(params);

        const seconds_format = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'second' });
        set_scale_value_format(this.show_animation_duration_scale, seconds_format);
        set_scale_value_format(this.hide_animation_duration_scale, seconds_format);

        this.unbind_settings = callback_stack();
        this.connect_after('unrealize', this.unbind_settings);
        this.connect('realize', this.bind_settings.bind(this));
    }

    get title() {
        return this.gettext_context.gettext('Animation');
    }

    bind_settings() {
        this.unbind_settings();

        const actions = make_settings_actions(this.settings, ['override-window-animation']);

        this.unbind_settings.push(
            insert_action_group(this, 'settings', actions),
            bind_sensitive(this.settings, 'override-window-animation', this.animation_prefs),
            bind_widgets(this.settings, {
                'show-animation': this.show_animation_combo,
                'show-animation-duration': this.show_animation_duration_scale,
                'hide-animation': this.hide_animation_combo,
                'hide-animation-duration': this.hide_animation_duration_scale,
            })
        );
    }
});
