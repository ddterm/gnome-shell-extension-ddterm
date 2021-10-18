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

'use strict';

const { Clutter, GObject, Gio, Meta } = imports.gi;
const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { ConnectionSet } = Me.imports.connectionset;

/* exported WindowManager */

var WindowManager = GObject.registerClass(
    {
        Properties: {
            'settings': GObject.ParamSpec.object(
                'settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings
            ),
            'current-window': GObject.ParamSpec.object(
                'current-window', '', '', GObject.ParamFlags.READABLE | GObject.ParamFlags.EXPLICIT_NOTIFY, Meta.Window
            ),
        },
        Signals: {
            'hide-request': {},
            'move-resize-requested': {
                param_types: [Meta.Rectangle.$gtype],
            },
        },
    },
    class DDTermWindowManager extends GObject.Object {
        _init(params) {
            super._init(params);

            this._current_window = null;
            this.current_workarea = null;
            this.current_monitor_scale = 1;
            this.current_target_rect = null;
            this.current_monitor_index = 0;
            this.current_window_mapped = false;

            this.show_animation = Clutter.AnimationMode.LINEAR;
            this.hide_animation = Clutter.AnimationMode.LINEAR;

            this.resize_x = false;
            this.right_or_bottom = false;
            this.animation_pivot_x = 0.5;
            this.animation_pivot_y = 0;
            this.animation_scale_x = 1.0;
            this.animation_scale_y = 0.0;

            this.connections = new ConnectionSet();
            this.current_window_connections = new ConnectionSet();
            this.current_window_maximized_connections = new ConnectionSet();
            this.animation_overrides_connections = new ConnectionSet();
            this.hide_when_focus_lost_connections = new ConnectionSet();
            this.update_size_setting_on_grab_end_connections = new ConnectionSet();
            this.geometry_fixup_connections = new ConnectionSet();

            this.connections.connect(global.display, 'workareas-changed', this.update_workarea.bind(this));
            this.connections.connect(this.settings, 'changed::window-above', this.set_window_above.bind(this));
            this.connections.connect(this.settings, 'changed::window-stick', this.set_window_stick.bind(this));
            this.connections.connect(this.settings, 'changed::window-size', this.update_target_rect.bind(this));
            this.connections.connect(this.settings, 'changed::window-size', this.disable_window_maximize_setting.bind(this));
            this.connections.connect(this.settings, 'changed::window-position', this.update_window_position.bind(this));
            this.connections.connect(this.settings, 'changed::window-maximize', this.set_window_maximized.bind(this));
            this.connections.connect(this.settings, 'changed::window-monitor', this.update_monitor_index.bind(this));
            this.connections.connect(this.settings, 'changed::window-monitor-connector', this.update_monitor_index.bind(this));
            this.connections.connect(this.settings, 'changed::override-window-animation', this.setup_animation_overrides.bind(this));
            this.connections.connect(this.settings, 'changed::show-animation', this.update_show_animation.bind(this));
            this.connections.connect(this.settings, 'changed::hide-animation', this.update_hide_animation.bind(this));
            this.connections.connect(this.settings, 'changed::hide-when-focus-lost', this.setup_hide_when_focus_lost.bind(this));

            this.update_workarea();
            this.update_window_position();
            this.update_show_animation();
            this.update_hide_animation();
            this.setup_animation_overrides();
            this.setup_hide_when_focus_lost();

            this.setup_update_size_setting_on_grab_end();
        }

        check_current_window(match = null) {
            if (this.current_window === null) {
                logError(new Error('current_window should be non-null'));
                return false;
            }

            if (match !== null && this.current_window !== match) {
                logError(new Error(`current_window should be ${match}, but it is ${this.current_window}`));
                return false;
            }

            return true;
        }

        setup_animation_overrides() {
            this.animation_overrides_connections.disconnect();

            if (!this.current_window)
                return;

            if (!this.settings.get_boolean('override-window-animation'))
                return;

            if (this.current_window_mapped)
                this.animation_overrides_connections.connect(global.window_manager, 'destroy', this.override_unmap_animation.bind(this));
            else
                this.animation_overrides_connections.connect(global.window_manager, 'map', this.override_map_animation.bind(this));
        }

        animation_mode_from_settings(key) {
            const nick = this.settings.get_string(key);
            if (nick === 'disable')
                return null;

            return Clutter.AnimationMode[nick.replace(/-/g, '_').toUpperCase()];
        }

        update_show_animation() {
            this.show_animation = this.animation_mode_from_settings('show-animation');
        }

        update_hide_animation() {
            this.hide_animation = this.animation_mode_from_settings('hide-animation');
        }

        override_map_animation(wm, actor) {
            if (!this.check_current_window() || actor !== this.current_window.get_compositor_private())
                return;

            if (!this.show_animation)
                return;

            const func = () => {
                actor.set_pivot_point(this.animation_pivot_x, this.animation_pivot_y);

                const scale_x_anim = actor.get_transition('scale-x');

                if (scale_x_anim) {
                    scale_x_anim.set_from(this.animation_scale_x);
                    scale_x_anim.set_to(1.0);
                    scale_x_anim.progress_mode = this.show_animation;
                }

                const scale_y_anim = actor.get_transition('scale-y');

                if (scale_y_anim) {
                    scale_y_anim.set_from(this.animation_scale_y);
                    scale_y_anim.set_to(1.0);
                    scale_y_anim.progress_mode = this.show_animation;
                }
            };

            if (Main.wm._waitForOverviewToHide)
                Main.wm._waitForOverviewToHide().then(func);
            else
                func();
        }

        override_unmap_animation(wm, actor) {
            if (!this.check_current_window() || actor !== this.current_window.get_compositor_private())
                return;

            if (!this.hide_animation)
                return;

            actor.set_pivot_point(this.animation_pivot_x, this.animation_pivot_y);

            const scale_x_anim = actor.get_transition('scale-x');

            if (scale_x_anim) {
                scale_x_anim.set_to(this.animation_scale_x);
                scale_x_anim.progress_mode = this.hide_animation;
            }

            const scale_y_anim = actor.get_transition('scale-y');

            if (scale_y_anim) {
                scale_y_anim.set_to(this.animation_scale_y);
                scale_y_anim.progress_mode = this.hide_animation;
            }
        }

        hide_when_focus_lost() {
            if (!this.check_current_window() || this.current_window.is_hidden())
                return;

            const win = global.display.focus_window;
            if (win !== null) {
                if (this.current_window === win || this.current_window.is_ancestor_of_transient(win))
                    return;
            }

            this.emit('hide-request');
        }

        setup_hide_when_focus_lost() {
            this.hide_when_focus_lost_connections.disconnect();

            if (this.current_window && this.settings.get_boolean('hide-when-focus-lost'))
                this.hide_when_focus_lost_connections.connect(global.display, 'notify::focus-window', this.hide_when_focus_lost.bind(this));
        }

        set_window_above() {
            if (this.current_window === null)
                return;

            const should_be_above = this.settings.get_boolean('window-above');
            // Both make_above() and unmake_above() raise the window, so check is necessary
            if (this.current_window.above === should_be_above)
                return;

            if (should_be_above)
                this.current_window.make_above();
            else
                this.current_window.unmake_above();
        }

        set_window_stick() {
            if (this.current_window === null)
                return;

            if (this.settings.get_boolean('window-stick'))
                this.current_window.stick();
            else
                this.current_window.unstick();
        }

        update_workarea() {
            if (this.current_monitor_index >= global.display.get_n_monitors()) {
                this.update_monitor_index();
                return;
            }

            this.current_workarea = Main.layoutManager.getWorkAreaForMonitor(this.current_monitor_index);
            this.current_monitor_scale = global.display.get_monitor_scale(this.current_monitor_index);

            this.update_target_rect();
        }

        get_monitor_index() {
            if (this.settings.get_string('window-monitor') === 'primary') {
                if (Main.layoutManager.primaryIndex >= 0)
                    return Main.layoutManager.primaryIndex;
            }

            if (this.settings.get_string('window-monitor') === 'focus') {
                if (Main.layoutManager.focusIndex >= 0)
                    return Main.layoutManager.focusIndex;
            }

            if (this.settings.get_string('window-monitor') === 'connector') {
                const monitor_manager = Meta.MonitorManager.get();
                if (monitor_manager) {
                    const index = monitor_manager.get_monitor_for_connector(this.settings.get_string('window-monitor-connector'));
                    if (index >= 0)
                        return index;
                }
            }

            return global.display.get_current_monitor();
        }

        update_monitor_index() {
            this.current_monitor_index = this.get_monitor_index();

            if (this.current_window)
                this.current_window.move_to_monitor(this.current_monitor_index);

            this.update_workarea();
        }

        setup_maximized_handlers() {
            this.current_window_maximized_connections.disconnect();

            if (!this.current_window)
                return;

            if (this.resize_x)
                this.current_window_maximized_connections.connect(this.current_window, 'notify::maximized-horizontally', this.handle_maximized_horizontally.bind(this));
            else
                this.current_window_maximized_connections.connect(this.current_window, 'notify::maximized-vertically', this.handle_maximized_vertically.bind(this));
        }

        manage_window(win) {
            if (win === this.current_window)
                return;

            this.release_window(this.current_window);

            this._current_window = win;
            this.notify('current-window');

            this.current_window_connections.connect(win, 'unmanaged', this.release_window.bind(this));
            this.current_window_connections.connect(win, 'unmanaging', () => {
                if (this.settings.get_boolean('override-window-animation') && !this.hide_animation)
                    Main.wm.skipNextEffect(this.current_window.get_compositor_private());
            });

            this.setup_maximized_handlers();

            this.update_monitor_index();

            this.current_window_mapped = win.get_compositor_private().visible;

            this.setup_animation_overrides();

            if (!this.current_window_mapped) {
                const map_handler_id = this.current_window_connections.connect(global.window_manager, 'map', (wm, actor) => {
                    if (this.check_current_window() && actor === this.current_window.get_compositor_private()) {
                        this.current_window_mapped = true;
                        this.current_window_connections.disconnect(global.window_manager, map_handler_id);
                        this.setup_animation_overrides();

                        if (win.get_client_type() === Meta.WindowClientType.WAYLAND) {
                            this.current_window.move_to_monitor(this.current_monitor_index);
                            this.update_window_geometry();
                        }
                    }
                });

                if (this.settings.get_boolean('override-window-animation') && !this.show_animation)
                    Main.wm.skipNextEffect(this.current_window.get_compositor_private());
            }

            this.setup_update_size_setting_on_grab_end();
            this.setup_hide_when_focus_lost();

            if (!this.current_window_mapped)
                Main.activateWindow(win);

            this.set_window_above();
            this.set_window_stick();

            if (this.settings.get_boolean('window-maximize'))
                win.maximize(Meta.MaximizeFlags.BOTH);
        }

        update_window_position() {
            const position = this.settings.get_string('window-position');

            this.resize_x = position === 'left' || position === 'right';
            this.right_or_bottom = position === 'right' || position === 'bottom';

            const resizing_direction_pivot = this.right_or_bottom ? 1.0 : 0.0;
            this.animation_pivot_x = this.resize_x ? resizing_direction_pivot : 0.5;
            this.animation_pivot_y = !this.resize_x ? resizing_direction_pivot : 0.5;

            this.animation_scale_x = this.resize_x ? 0.0 : 1.0;
            this.animation_scale_y = this.resize_x ? 1.0 : 0.0;

            this.setup_maximized_handlers();
            this.update_target_rect();
        }

        target_rect_for_workarea_size(workarea, monitor_scale, size) {
            const target_rect = workarea.copy();

            if (this.resize_x) {
                target_rect.width *= size;
                target_rect.width -= target_rect.width % monitor_scale;

                if (this.right_or_bottom)
                    target_rect.x += workarea.width - target_rect.width;
            } else {
                target_rect.height *= size;
                target_rect.height -= target_rect.height % monitor_scale;

                if (this.right_or_bottom)
                    target_rect.y += workarea.height - target_rect.height;
            }

            return target_rect;
        }

        update_target_rect() {
            if (!this.current_workarea)
                return;

            this.current_target_rect = this.target_rect_for_workarea_size(
                this.current_workarea,
                this.current_monitor_scale,
                this.settings.get_double('window-size')
            );

            this.update_window_geometry();
        }

        schedule_geometry_fixup(win) {
            if (!this.check_current_window(win) || win.get_client_type() !== Meta.WindowClientType.WAYLAND)
                return;

            this.geometry_fixup_connections.disconnect();
            this.geometry_fixup_connections.connect(win, 'position-changed', this.update_window_geometry.bind(this));
            this.geometry_fixup_connections.connect(win, 'size-changed', this.update_window_geometry.bind(this));
        }

        unmaximize_done() {
            this.settings.set_boolean('window-maximize', false);
            this.update_window_geometry();

            // https://github.com/amezin/gnome-shell-extension-ddterm/issues/48
            if (this.settings.get_boolean('window-above')) {
                // Without unmake_above(), make_above() won't actually take effect (?!)
                this.current_window.unmake_above();
                this.set_window_above();
            }

            if (!this.current_window_mapped) {
                if (this.settings.get_boolean('override-window-animation') && !this.show_animation)
                    Main.wm.skipNextEffect(this.current_window.get_compositor_private());
            }
        }

        handle_maximized_vertically(win) {
            if (!this.check_current_window(win))
                return;

            if (!win.maximized_vertically) {
                this.unmaximize_done();
                return;
            }

            if (this.settings.get_boolean('window-maximize'))
                return;

            if (this.current_target_rect.height < this.current_workarea.height) {
                Main.wm.skipNextEffect(this.current_window.get_compositor_private());
                win.unmaximize(Meta.MaximizeFlags.VERTICAL);
            } else {
                this.settings.set_boolean('window-maximize', true);
            }
        }

        handle_maximized_horizontally(win) {
            if (!this.check_current_window(win))
                return;

            if (!win.maximized_horizontally) {
                this.unmaximize_done();
                return;
            }

            if (this.settings.get_boolean('window-maximize'))
                return;

            if (this.current_target_rect.width < this.current_workarea.width) {
                Main.wm.skipNextEffect(this.current_window.get_compositor_private());
                win.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
            } else {
                this.settings.set_boolean('window-maximize', true);
            }
        }

        move_resize_window(win, target_rect) {
            win.move_resize_frame(false, target_rect.x, target_rect.y, target_rect.width, target_rect.height);
            this.emit('move-resize-requested', target_rect);
        }

        set_window_maximized() {
            if (!this.current_window)
                return;

            const is_maximized = this.resize_x ? this.current_window.maximized_horizontally : this.current_window.maximized_vertically;
            const should_maximize = this.settings.get_boolean('window-maximize');
            if (is_maximized === should_maximize)
                return;

            if (should_maximize) {
                this.current_window.maximize(Meta.MaximizeFlags.BOTH);
            } else {
                this.current_window.unmaximize(this.resize_x ? Meta.MaximizeFlags.HORIZONTAL : Meta.MaximizeFlags.VERTICAL);
                this.schedule_geometry_fixup(this.current_window);
            }
        }

        disable_window_maximize_setting() {
            if (this.current_target_rect.height < this.current_workarea.height || this.current_target_rect.width < this.current_workarea.width)
                this.settings.set_boolean('window-maximize', false);
        }

        update_window_geometry() {
            this.geometry_fixup_connections.disconnect();

            if (!this.current_window)
                return;

            if (this.settings.get_boolean('window-maximize'))
                return;

            if (this.current_window.maximized_horizontally && this.current_target_rect.width < this.current_workarea.width) {
                Main.wm.skipNextEffect(this.current_window.get_compositor_private());
                this.current_window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                return;
            }

            if (this.current_window.maximized_vertically && this.current_target_rect.height < this.current_workarea.height) {
                Main.wm.skipNextEffect(this.current_window.get_compositor_private());
                this.current_window.unmaximize(Meta.MaximizeFlags.VERTICAL);
                return;
            }

            this.move_resize_window(this.current_window, this.current_target_rect);

            if (this.resize_x ? this.current_window.maximized_horizontally : this.current_window.maximized_vertically)
                this.settings.set_boolean('window-maximize', true);
        }

        update_size_setting_on_grab_end(display, p0, p1) {
            // On Mutter <=3.38 p0 is display too. On 40 p0 is the window.
            const win = p0 instanceof Meta.Window ? p0 : p1;

            if (win !== this.current_window)
                return;

            if (!this.resize_x && this.current_window.maximized_vertically)
                return;

            if (this.resize_x && this.current_window.maximized_horizontally)
                return;

            const frame_rect = win.get_frame_rect();
            const size = this.resize_x ? frame_rect.width / this.current_workarea.width : frame_rect.height / this.current_workarea.height;
            this.settings.set_double('window-size', Math.min(1.0, size));
        }

        setup_update_size_setting_on_grab_end() {
            this.update_size_setting_on_grab_end_connections.disconnect();

            if (this.current_window)
                this.update_size_setting_on_grab_end_connections.connect(global.display, 'grab-op-end', this.update_size_setting_on_grab_end.bind(this));
        }

        unmaximize_for_resize(flags) {
            this.geometry_fixup_connections.disconnect();

            if (!this.current_window || !(this.current_window.get_maximized() & flags))
                return;

            // There is a update_window_geometry() call after successful unmaximize.
            // It must set window size to 100%.
            this.settings.set_double('window-size', 1.0);

            Main.wm.skipNextEffect(this.current_window.get_compositor_private());
            this.current_window.unmaximize(flags);
            this.schedule_geometry_fixup(this.current_window);
        }

        release_window(win) {
            if (!win || win !== this.current_window)
                return;

            this.current_window_connections.disconnect();
            this.current_window_maximized_connections.disconnect();
            this.geometry_fixup_connections.disconnect();

            this._current_window = null;
            this.current_window_mapped = false;
            this.notify('current-window');

            this.update_size_setting_on_grab_end_connections.disconnect();
            this.hide_when_focus_lost_connections.disconnect();
            this.animation_overrides_connections.disconnect();
        }

        disable() {
            this.release_window(this.current_window);
            this.connections.disconnect();
        }

        get current_window() {
            return this._current_window;
        }
    }
);
