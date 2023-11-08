/*
    Copyright © 2021 Aleksandr Mezin

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
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WM from 'resource:///org/gnome/shell/ui/windowManager.js';

import { WindowGeometry } from './geometry.js';

const MOUSE_RESIZE_GRABS = [
    Meta.GrabOp.RESIZING_NW,
    Meta.GrabOp.RESIZING_N,
    Meta.GrabOp.RESIZING_NE,
    Meta.GrabOp.RESIZING_E,
    Meta.GrabOp.RESIZING_SW,
    Meta.GrabOp.RESIZING_S,
    Meta.GrabOp.RESIZING_SE,
    Meta.GrabOp.RESIZING_W,
];

export { WindowManager };

const WindowManager = GObject.registerClass({
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'window': GObject.ParamSpec.object(
            'window',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Meta.Window
        ),
        'geometry': GObject.ParamSpec.object(
            'geometry',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            WindowGeometry
        ),
    },
    Signals: {
        'hide-request': {},
        'move-resize-requested': {
            param_types: [Mtk.Rectangle.$gtype],
        },
    },
}, class DDTermWindowManager extends GObject.Object {
    _init(params) {
        super._init(params);

        this.debug = null;

        this.show_animation = Clutter.AnimationMode.LINEAR;
        this.show_animation_duration = WM.SHOW_WINDOW_ANIMATION_TIME;
        this.hide_animation = Clutter.AnimationMode.LINEAR;
        this.hide_animation_duration = WM.DESTROY_WINDOW_ANIMATION_TIME;

        this.animation_pivot_x = 0.5;
        this.animation_pivot_y = 0;
        this.animation_scale_x = 1.0;
        this.animation_scale_y = 0.0;

        try {
            this._enable();
        } catch (ex) {
            this.disable();
            throw ex;
        }
    }

    _enable() {
        this._settings_handlers = Object.entries({
            'changed::window-above': this._set_window_above.bind(this),
            'changed::window-stick': this._set_window_stick.bind(this),
            'changed::window-size': this._disable_window_maximize_setting.bind(this),
            'changed::window-maximize': this._set_window_maximized.bind(this),
            'changed::override-window-animation': this._setup_animation_overrides.bind(this),
            'changed::show-animation': this._update_show_animation.bind(this),
            'changed::hide-animation': this._update_hide_animation.bind(this),
            'changed::show-animation-duration': this._update_show_animation_duration.bind(this),
            'changed::hide-animation-duration': this._update_hide_animation_duration.bind(this),
            'changed::hide-when-focus-lost': this._setup_hide_when_focus_lost.bind(this),
        }).map(
            ([signal, callback]) => this.settings.connect(signal, callback)
        );

        this._geometry_handlers = Object.entries({
            'notify::monitor-index': () => {
                this.window.move_to_monitor(this.geometry.monitor_index);
            },
            'notify::resize-x': () => {
                this._update_animation_direction();
                this._setup_maximized_handlers();
            },
            'notify::right-or-bottom': () => this._update_animation_direction(),
            'notify::target-rect': () => this._update_window_geometry(),
        }).map(
            ([signal, callback]) => this.geometry.connect(signal, callback)
        );

        this._update_animation_direction();
        this._update_show_animation();
        this._update_hide_animation();
        this._update_show_animation_duration();
        this._update_hide_animation_duration();

        this._window_handlers = [
            this.window.connect('unmanaged', this.disable.bind(this)),
            this.window.connect('unmanaging', () => {
                if (!this.settings.get_boolean('override-window-animation') || this.hide_animation)
                    return;

                Main.wm.skipNextEffect(this.window.get_compositor_private());
                this.disable();
            }),
        ];

        this._setup_maximized_handlers();

        const mapped = this._window_mapped();
        if (!mapped) {
            if (this.window.get_client_type() === Meta.WindowClientType.WAYLAND) {
                this.debug?.('Scheduling geometry fixup on map');
                this._schedule_geometry_fixup();
                this.window.move_to_monitor(this.geometry.monitor_index);

                this._map_handler = global.window_manager.connect('map', (wm, actor) => {
                    if (actor.meta_window !== this.window)
                        return;

                    global.window_manager.disconnect(this._map_handler);
                    this._map_handler = null;

                    this._update_window_geometry(true);
                });
            } else {
                this._update_window_geometry(true);
            }

            if (this.settings.get_boolean('override-window-animation') && !this.show_animation)
                Main.wm.skipNextEffect(this.window.get_compositor_private());
        } else {
            this._update_window_geometry(true);
        }

        this._display_handlers = [
            global.display.connect('grab-op-begin', this._grab_op_begin.bind(this)),
            global.display.connect('grab-op-end', this.update_size_setting_on_grab_end.bind(this)),
        ];

        this._setup_hide_when_focus_lost();
        this._setup_animation_overrides();

        if (this.window.get_client_type() === Meta.WindowClientType.X11)
            Main.activateWindow(this.window);

        this._set_window_above();
        this._set_window_stick();

        if (this.settings.get_boolean('window-maximize'))
            this.window.maximize(Meta.MaximizeFlags.BOTH);
    }

    _disable_animation_overrides() {
        while (this._animation_handlers?.length)
            global.window_manager.disconnect(this._animation_handlers.pop());
    }

    _setup_animation_overrides() {
        this._disable_animation_overrides();

        if (!this.settings.get_boolean('override-window-animation'))
            return;

        this._animation_handlers = [
            global.window_manager.connect('destroy', this._override_unmap_animation.bind(this)),
            global.window_manager.connect('map', this._override_map_animation.bind(this)),
        ];
    }

    _animation_mode_from_settings(key) {
        const nick = this.settings.get_string(key);
        if (nick === 'disable')
            return null;

        return Clutter.AnimationMode[nick.replace(/-/g, '_').toUpperCase()];
    }

    _update_show_animation() {
        this.show_animation = this._animation_mode_from_settings('show-animation');
    }

    _update_hide_animation() {
        this.hide_animation = this._animation_mode_from_settings('hide-animation');
    }

    _update_show_animation_duration() {
        this.show_animation_duration =
            Math.floor(1000 * this.settings.get_double('show-animation-duration'));
    }

    _update_hide_animation_duration() {
        this.hide_animation_duration =
            Math.floor(1000 * this.settings.get_double('hide-animation-duration'));
    }

    _override_map_animation(wm, actor) {
        if (actor !== this.window.get_compositor_private())
            return;

        if (!this.show_animation)
            return;

        const win = actor.meta_window;

        const func = () => {
            if (actor !== win.get_compositor_private())
                return;

            actor.set_pivot_point(this.animation_pivot_x, this.animation_pivot_y);

            const scale_x_anim = actor.get_transition('scale-x');

            if (scale_x_anim) {
                scale_x_anim.set_from(this.animation_scale_x);
                scale_x_anim.set_to(1.0);
                scale_x_anim.progress_mode = this.show_animation;
                scale_x_anim.duration = this.show_animation_duration;
            }

            const scale_y_anim = actor.get_transition('scale-y');

            if (scale_y_anim) {
                scale_y_anim.set_from(this.animation_scale_y);
                scale_y_anim.set_to(1.0);
                scale_y_anim.progress_mode = this.show_animation;
                scale_y_anim.duration = this.show_animation_duration;
            }

            const opacity_anim = actor.get_transition('opacity');

            if (opacity_anim) {
                opacity_anim.progress_mode = this.show_animation;
                opacity_anim.duration = this.show_animation_duration;
            }
        };

        if (Main.wm._waitForOverviewToHide)
            Main.wm._waitForOverviewToHide().then(func);
        else
            func();
    }

    _override_unmap_animation(wm, actor) {
        if (actor !== this.window.get_compositor_private())
            return;

        if (!this.hide_animation) {
            this.disable();
            return;
        }

        actor.set_pivot_point(this.animation_pivot_x, this.animation_pivot_y);

        const scale_x_anim = actor.get_transition('scale-x');

        if (scale_x_anim) {
            scale_x_anim.set_to(this.animation_scale_x);
            scale_x_anim.progress_mode = this.hide_animation;
            scale_x_anim.duration = this.hide_animation_duration;
        }

        const scale_y_anim = actor.get_transition('scale-y');

        if (scale_y_anim) {
            scale_y_anim.set_to(this.animation_scale_y);
            scale_y_anim.progress_mode = this.hide_animation;
            scale_y_anim.duration = this.hide_animation_duration;
        }

        const opacity_anim = actor.get_transition('opacity');

        if (opacity_anim) {
            opacity_anim.progress_mode = this.hide_animation;
            opacity_anim.duration = this.hide_animation_duration;
        }

        this.disable();
    }

    _hide_when_focus_lost() {
        if (this.window.is_hidden())
            return;

        const win = global.display.focus_window;
        if (this.window === win)
            return;

        if (win && this.window.is_ancestor_of_transient(win))
            return;

        this.emit('hide-request');
    }

    _setup_hide_when_focus_lost() {
        if (this._focus_window_handler) {
            global.display.disconnect(this._focus_window_handler);
            this._focus_window_handler = null;
        }

        if (!this.settings.get_boolean('hide-when-focus-lost'))
            return;

        this._focus_window_handler = global.display.connect(
            'notify::focus-window',
            this._hide_when_focus_lost.bind(this)
        );
    }

    _set_window_above() {
        const should_be_above = this.settings.get_boolean('window-above');
        // Both make_above() and unmake_above() raise the window, so check is necessary
        if (this.window.above === should_be_above)
            return;

        if (should_be_above)
            this.window.make_above();
        else
            this.window.unmake_above();
    }

    _set_window_stick() {
        if (this.settings.get_boolean('window-stick'))
            this.window.stick();
        else
            this.window.unstick();
    }

    _setup_maximized_handlers() {
        if (this._maximized_handler) {
            this.window.disconnect(this._maximized_handler);
            this._maximized_handler = null;
        }

        if (this.geometry.resize_x) {
            this._maximized_handler = this.window.connect(
                'notify::maximized-horizontally',
                this._handle_maximized_horizontally.bind(this)
            );
        } else {
            this._maximized_handler = this.window.connect(
                'notify::maximized-vertically',
                this._handle_maximized_vertically.bind(this)
            );
        }
    }

    _window_mapped() {
        return this.window.get_compositor_private()?.visible ?? false;
    }

    _update_animation_direction() {
        const resizing_direction_pivot = this.geometry.right_or_bottom ? 1.0 : 0.0;
        this.animation_pivot_x = this.geometry.resize_x ? resizing_direction_pivot : 0.5;
        this.animation_pivot_y = !this.geometry.resize_x ? resizing_direction_pivot : 0.5;

        this.animation_scale_x = this.geometry.resize_x ? 0.0 : 1.0;
        this.animation_scale_y = this.geometry.resize_x ? 1.0 : 0.0;
    }

    _cancel_geometry_fixup() {
        while (this._geometry_fixup_handlers?.length)
            this.window.disconnect(this._geometry_fixup_handlers.pop());
    }

    _schedule_geometry_fixup() {
        if (this.window.get_client_type() !== Meta.WindowClientType.WAYLAND)
            return;

        this.debug?.('Scheduling geometry fixup');

        this._cancel_geometry_fixup();

        this._geometry_fixup_handlers = [
            this.window.connect('position-changed', () => this._update_window_geometry()),
            this.window.connect('size-changed', () => this._update_window_geometry()),
        ];
    }

    _unmaximize_done() {
        this.debug?.('Unmaximize done');

        this.settings.set_boolean('window-maximize', false);
        this._update_window_geometry();

        // https://github.com/ddterm/gnome-shell-extension-ddterm/issues/48
        if (this.settings.get_boolean('window-above')) {
            // Without unmake_above(), make_above() won't actually take effect (?!)
            this.window.unmake_above();
            this._set_window_above();
        }

        if (!this._window_mapped()) {
            if (this.settings.get_boolean('override-window-animation') && !this.show_animation)
                Main.wm.skipNextEffect(this.window.get_compositor_private());
        }
    }

    _handle_maximized_vertically(win) {
        if (!win.maximized_vertically) {
            this._unmaximize_done();
            return;
        }

        if (this.settings.get_boolean('window-maximize'))
            return;

        if (this.geometry.target_rect.height < this.geometry.workarea.height) {
            this.debug?.('Unmaximizing window because size expected to be less than full height');
            Main.wm.skipNextEffect(this.window.get_compositor_private());
            win.unmaximize(Meta.MaximizeFlags.VERTICAL);
        } else {
            this.debug?.('Setting window-maximize=true because window is maximized');
            this.settings.set_boolean('window-maximize', true);
        }
    }

    _handle_maximized_horizontally(win) {
        if (!win.maximized_horizontally) {
            this._unmaximize_done();
            return;
        }

        if (this.settings.get_boolean('window-maximize'))
            return;

        if (this.geometry.target_rect.width < this.geometry.workarea.width) {
            this.debug?.('Unmaximizing window because size expected to be less than full width');
            Main.wm.skipNextEffect(this.window.get_compositor_private());
            win.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
        } else {
            this.debug?.('Setting window-maximize=true because window is maximized');
            this.settings.set_boolean('window-maximize', true);
        }
    }

    _move_resize_window(win, target_rect) {
        win.move_resize_frame(
            false,
            target_rect.x,
            target_rect.y,
            target_rect.width,
            target_rect.height
        );

        this.emit('move-resize-requested', target_rect);
    }

    _set_window_maximized() {
        const is_maximized = this.geometry.resize_x
            ? this.window.maximized_horizontally
            : this.window.maximized_vertically;

        const should_maximize = this.settings.get_boolean('window-maximize');
        if (is_maximized === should_maximize)
            return;

        if (should_maximize) {
            this.debug?.('Maximizing window according to settings');
            this.window.maximize(Meta.MaximizeFlags.BOTH);
        } else {
            this.debug?.('Unmaximizing window according to settings');
            this.window.unmaximize(
                this.geometry.resize_x ? Meta.MaximizeFlags.HORIZONTAL : Meta.MaximizeFlags.VERTICAL
            );

            this.debug?.('Sheduling geometry fixup from window-maximize setting change');
            this._schedule_geometry_fixup();
        }
    }

    _disable_window_maximize_setting() {
        if (this.geometry.target_rect.height < this.geometry.workarea.height ||
            this.geometry.target_rect.width < this.geometry.workarea.width) {
            this.debug?.('Unmaximizing window because size expected to be less than workarea');
            this.settings.set_boolean('window-maximize', false);
        }
    }

    _update_window_geometry(force_monitor = false) {
        this._cancel_geometry_fixup();

        this.debug?.('Updating window geometry');

        if (force_monitor || this.window.get_monitor() !== this.geometry.monitor_index) {
            this.debug?.('Scheduling geometry fixup for move to another monitor');
            this._schedule_geometry_fixup();
            this.window.move_to_monitor(this.geometry.monitor_index);
        }

        if (this.settings.get_boolean('window-maximize'))
            return;

        if (this.window.maximized_horizontally &&
            this.geometry.target_rect.width < this.geometry.workarea.width) {
            Main.wm.skipNextEffect(this.window.get_compositor_private());
            this.window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
            return;
        }

        if (this.window.maximized_vertically &&
            this.geometry.target_rect.height < this.geometry.workarea.height) {
            Main.wm.skipNextEffect(this.window.get_compositor_private());
            this.window.unmaximize(Meta.MaximizeFlags.VERTICAL);
            return;
        }

        this._move_resize_window(this.window, this.geometry.target_rect);

        if (this.geometry.resize_x
            ? this.window.maximized_horizontally
            : this.window.maximized_vertically)
            this.settings.set_boolean('window-maximize', true);
    }

    _grab_op_begin(display, win, flags) {
        if (win !== this.window)
            return;

        if (!MOUSE_RESIZE_GRABS.includes(flags))
            return;

        this.unmaximize_for_resize(
            this.geometry.resize_x ? Meta.MaximizeFlags.HORIZONTAL : Meta.MaximizeFlags.VERTICAL
        );
    }

    update_size_setting_on_grab_end(display, win) {
        if (win !== this.window)
            return;

        if (!this.geometry.resize_x && this.window.maximized_vertically)
            return;

        if (this.geometry.resize_x && this.window.maximized_horizontally)
            return;

        this.debug?.('Updating size setting on grab end');

        const frame_rect = win.get_frame_rect();
        const size = this.geometry.resize_x
            ? frame_rect.width / this.geometry.workarea.width
            : frame_rect.height / this.geometry.workarea.height;

        this.settings.set_double('window-size', Math.min(1.0, size));
    }

    unmaximize_for_resize(flags) {
        this._cancel_geometry_fixup();

        if (!(this.window.get_maximized() & flags))
            return;

        this.debug?.('Unmaximizing for resize');

        // There is a _update_window_geometry() call after successful unmaximize.
        // It must set window size to 100%.
        this.settings.set_double('window-size', 1.0);

        Main.wm.skipNextEffect(this.window.get_compositor_private());
        this.window.unmaximize(flags);
    }

    disable() {
        while (this._settings_handlers?.length)
            this.settings.disconnect(this._settings_handlers.pop());

        while (this._geometry_handlers?.length)
            this.geometry.disconnect(this._geometry_handlers.pop());

        while (this._window_handlers?.length)
            this.window.disconnect(this._window_handlers.pop());

        if (this._map_handler) {
            global.window_manager.disconnect(this._map_handler);
            this._map_handler = null;
        }

        while (this._display_handlers?.length)
            global.display.disconnect(this._display_handlers.pop());

        if (this._maximized_handler) {
            this.window.disconnect(this._maximized_handler);
            this._maximized_handler = null;
        }

        this._cancel_geometry_fixup();

        if (this._focus_window_handler) {
            global.display.disconnect(this._focus_window_handler);
            this._focus_window_handler = null;
        }

        this._disable_animation_overrides();
    }
});
