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

'use strict';

const { GObject, Gio, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { backport } = Me.imports.ddterm;
const { util } = Me.imports.ddterm.pref;
const { translations } = Me.imports.ddterm.util;

function get_seconds_format() {
    try {
        return new Intl.NumberFormat(undefined, { style: 'unit', unit: 'second' });
    } catch {
        // Gnome 3.36 doesn't understand style: 'unit'
        return new class {
            format(v) {
                return `${v} sec`;
            }
        }();
    }
}

const SECONDS_FORMAT = get_seconds_format();

function seconds_formatter(_, value) {
    return SECONDS_FORMAT.format(value);
}

var Widget = backport.GObject.registerClass(
    {
        GTypeName: 'DDTermPrefsAnimation',
        Template: util.ui_file_uri('prefs-animation.ui'),
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
        },
    },
    class PrefsAnimation extends Gtk.Box {
        _init(params) {
            super._init(params);

            util.insert_settings_actions(this, this.settings, ['override-window-animation']);
            util.bind_sensitive(this.settings, 'override-window-animation', this.animation_prefs);

            util.bind_widgets(this.settings, {
                'show-animation': this.show_animation_combo,
                'show-animation-duration': this.show_animation_duration_scale,
                'hide-animation': this.hide_animation_combo,
                'hide-animation-duration': this.hide_animation_duration_scale,
            });

            util.set_scale_value_formatter(this.show_animation_duration_scale, seconds_formatter);
            util.set_scale_value_formatter(this.hide_animation_duration_scale, seconds_formatter);
        }

        get title() {
            return translations.gettext('Animation');
        }
    }
);

/* exported Widget */
