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

const { GObject, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { prefsutil, settings, translations } = Me.imports;

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

var Widget = GObject.registerClass(
    {
        GTypeName: 'DDTermPrefsAnimation',
        Template: Me.dir.get_child(`prefs-animation-gtk${Gtk.get_major_version()}.ui`).get_uri(),
        Children: [
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
                settings.Settings
            ),
        },
    },
    class PrefsAnimation extends Gtk.Grid {
        _init(params) {
            super._init(params);

            const scope = prefsutil.scope(this, this.settings);

            scope.setup_widgets({
                'show-animation': this.show_animation_combo,
                'hide-animation': this.hide_animation_combo,
                'show-animation-duration': this.show_animation_duration_scale,
                'hide-animation-duration': this.hide_animation_duration_scale,
            });

            this.insert_action_group(
                'settings',
                scope.make_actions([
                    'override-window-animation',
                ])
            );

            scope.set_scale_value_formatter(
                this.show_animation_duration_scale,
                seconds_formatter
            );

            scope.set_scale_value_formatter(
                this.hide_animation_duration_scale,
                seconds_formatter
            );
        }

        get title() {
            return translations.gettext('Animation');
        }
    }
);

/* exported Widget */
