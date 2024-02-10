/*
    Copyright © 2022 Aleksandr Mezin

    This file is part of ddterm GNOME Shell extension.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    bind_sensitive,
    bind_widgets,
    insert_settings_actions,
    set_scale_value_format,
    ui_file_uri
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
        return this.gettext_context.gettext('Animation');
    }
});
