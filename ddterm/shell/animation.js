/*
    Copyright © 2024 Aleksandr Mezin

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
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { WindowGeometry } from './geometry.js';

function animation_mode_by_nick(nick) {
    return Clutter.AnimationMode[nick.replace(/-/g, '_').toUpperCase()];
}

function opacity_animation_mode(animation_mode) {
    /*
        Bounce/backtracking in opacity animations looks bad.
        TODO: Add dedicated settings for opacity animation.
    */

    switch (animation_mode) {
    case Clutter.AnimationMode.EASE_IN_BACK:
        return Clutter.AnimationMode.EASE_IN_CUBIC;

    case Clutter.AnimationMode.EASE_OUT_BACK:
        return Clutter.AnimationMode.EASE_OUT_CUBIC;

    case Clutter.AnimationMode.EASE_IN_OUT_BACK:
        return Clutter.AnimationMode.EASE_IN_OUT_CUBIC;

    case Clutter.AnimationMode.EASE_IN_ELASTIC:
    case Clutter.AnimationMode.EASE_IN_BOUNCE:
        return Clutter.AnimationMode.EASE_IN_EXPO;

    case Clutter.AnimationMode.EASE_OUT_ELASTIC:
    case Clutter.AnimationMode.EASE_OUT_BOUNCE:
        return Clutter.AnimationMode.EASE_OUT_EXPO;

    case Clutter.AnimationMode.EASE_IN_OUT_ELASTIC:
    case Clutter.AnimationMode.EASE_IN_OUT_BOUNCE:
        return Clutter.AnimationMode.EASE_IN_OUT_EXPO;

    default:
        return animation_mode;
    }
}

export const Animation = GObject.registerClass({
    Properties: {
        'geometry': GObject.ParamSpec.object(
            'geometry',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            WindowGeometry
        ),
        'enable-override': GObject.ParamSpec.boolean(
            'enable-override',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'mode': GObject.ParamSpec.string(
            'mode',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            ''
        ),
        'duration': GObject.ParamSpec.double(
            'duration',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            0.001,
            1.0,
            0.15
        ),
        'global-disable': GObject.ParamSpec.boolean(
            'global-disable',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'should-skip': GObject.ParamSpec.boolean(
            'should-skip',
            '',
            '',
            GObject.ParamFlags.READABLE,
            false
        ),
        'should-override': GObject.ParamSpec.boolean(
            'should-override',
            '',
            '',
            GObject.ParamFlags.READABLE,
            false
        ),
    },
}, class DDTermAnimation extends GObject.Object {
    _init(params) {
        super._init(params);

        this.connect('notify::enable-override', () => this.update());
        this.connect('notify::mode', () => this.update());
        this.connect('notify::duration', () => this.update());
        this.connect('notify::global-disable', () => this.update());

        this.update();
    }

    update() {
        this.freeze_notify();

        try {
            const override_enabled = this.enable_override && !this.global_disable;
            const should_skip = override_enabled && this.mode === 'disable';
            const should_override = override_enabled && !should_skip;

            if (should_skip !== this._should_skip) {
                this._should_skip = should_skip;
                this.notify('should-skip');
            }

            if (should_override !== this._should_override) {
                this._should_override = should_override;
                this.notify('should-override');
            }

            this._duration = Math.floor(1000 * this.duration);
            this._mode = should_override ? animation_mode_by_nick(this.mode) : null;
            this._opacity_mode = opacity_animation_mode(this._mode);
        } finally {
            this.thaw_notify();
        }
    }

    get should_override() {
        return this._should_override;
    }

    get should_skip() {
        return this._should_skip;
    }

    apply_override(actor) {
        if (!this._mode)
            return;

        actor.pivot_point = this.geometry.pivot_point;

        const scale_x_anim = actor.get_transition('scale-x');

        if (scale_x_anim) {
            this.set_interval(
                scale_x_anim,
                this.geometry.orientation === Clutter.Orientation.HORIZONTAL ? 0.0 : 1.0
            );

            scale_x_anim.progress_mode = this._mode;
            scale_x_anim.duration = this._duration;
        }

        const scale_y_anim = actor.get_transition('scale-y');

        if (scale_y_anim) {
            this.set_interval(
                scale_y_anim,
                this.geometry.orientation === Clutter.Orientation.VERTICAL ? 0.0 : 1.0
            );

            scale_y_anim.progress_mode = this._mode;
            scale_y_anim.duration = this._duration;
        }

        const opacity_anim = actor.get_transition('opacity');

        if (opacity_anim) {
            opacity_anim.progress_mode = this._opacity_mode;
            opacity_anim.duration = this._duration;
        }
    }

    set_interval(transition, value) {
        transition.set_from(value);
        transition.set_to(1.0);
    }

    bind_settings(settings, mode_key, duration_key) {
        settings.bind(
            'override-window-animation',
            this,
            'enable-override',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            mode_key,
            this,
            'mode',
            Gio.SettingsBindFlags.GET
        );

        settings.bind(
            duration_key,
            this,
            'duration',
            Gio.SettingsBindFlags.GET
        );

        const toolkit_settings = St.Settings.get();

        toolkit_settings.bind_property(
            'enable-animations',
            this,
            'global-disable',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN
        );
    }
});

export const ReverseAnimation = GObject.registerClass({
}, class DDTermReverseAnimation extends Animation {
    set_interval(transition, value) {
        transition.set_to(value);
    }
});
