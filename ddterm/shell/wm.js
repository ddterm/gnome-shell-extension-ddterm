// SPDX-FileCopyrightText: 2021 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Juan M. Cruz-Martinez
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Animation } from './animation.js';
import { WindowGeometry } from './geometry.js';
import { is_wlclipboard, WlClipboardActivator } from './wlclipboard.js';

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

export const WindowManager = GObject.registerClass({
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'window': GObject.ParamSpec.object(
            'window',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Meta.Window
        ),
        'geometry': GObject.ParamSpec.object(
            'geometry',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            WindowGeometry
        ),
        'show-animation': GObject.ParamSpec.object(
            'show-animation',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Animation
        ),
        'hide-animation': GObject.ParamSpec.object(
            'hide-animation',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Animation
        ),
        'logger': GObject.ParamSpec.jsobject(
            'logger',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY
        ),
    },
    Signals: {
        'hide-request': {},
        'move-resize-requested': {
            param_types: [Mtk.Rectangle.$gtype],
        },
    },
}, class DDTermWindowManager extends GObject.Object {
    #mutter_settings;
    #actor;
    #client_type;
    #settings_handlers;
    #geometry_handlers;
    #display_handlers;
    #window_handlers;
    #saved_auto_maximize;
    #map_animation_override_handler;
    #destroy_animation_override_handler;
    #hide_animation_setup_handler;
    #map_handler;
    #maximized_handler;
    #focus_window_handler;
    #geometry_fixup_handlers;
    #wl_clipboard_activator;

    constructor(params) {
        super(params);

        this.#mutter_settings = Gio.Settings.new('org.gnome.mutter');

        try {
            this.#enable();
        } catch (ex) {
            this.disable();
            throw ex;
        }
    }

    #enable() {
        this.#actor = this.window.get_compositor_private();
        this.#client_type = this.window.get_client_type();

        this.#settings_handlers = Object.entries({
            'changed::window-above': this.#set_window_above.bind(this),
            'changed::window-stick': this.#set_window_stick.bind(this),
            'changed::window-size': this.#disable_window_maximize_setting.bind(this),
            'changed::window-maximize': this.#set_window_maximized.bind(this),
            'changed::hide-when-focus-lost': this.#setup_hide_when_focus_lost.bind(this),
        }).map(
            ([signal, callback]) => this.settings.connect(signal, callback)
        );

        this.#geometry_handlers = Object.entries({
            'notify::monitor-index': () => {
                this.window.move_to_monitor(this.geometry.monitor_index);
            },
            'notify::maximize-flag': () => {
                this.#setup_maximized_handlers();
            },
            'notify::target-rect': () => {
                this.#update_window_geometry();
            },
        }).map(
            ([signal, callback]) => this.geometry.connect(signal, callback)
        );

        this.#window_handlers = Object.entries({
            'unmanaged': () => {
                this.disable();
            },
            'unmanaging': () => {
                if (this.hide_animation.should_skip) {
                    Main.wm.skipNextEffect(this.#actor);
                    this.disable();
                }
            },
            'notify::above': () => {
                this.#setup_wl_clipboard_activator();
            },
        }).map(
            ([signal, callback]) => this.window.connect(signal, callback)
        );

        this.#setup_maximized_handlers();
        this.#update_window_geometry();

        const should_maximize = this.settings.get_boolean('window-maximize');

        if (this.window.is_hidden()) {
            const current_auto_maximize = this.#mutter_settings.get_boolean('auto-maximize');

            if (current_auto_maximize !== should_maximize) {
                this.#saved_auto_maximize = current_auto_maximize;
                this.#mutter_settings.set_boolean('auto-maximize', should_maximize);
            }

            this.#window_handlers.push(
                this.window.connect('shown', this.#restore_auto_maximize.bind(this))
            );
        }

        if (!this.#actor.visible) {
            this.#map_handler = global.window_manager.connect('map', (wm, actor) => {
                if (actor !== this.#actor)
                    return;

                global.window_manager.disconnect(this.#map_handler);
                this.#map_handler = null;

                if (this.#client_type === Meta.WindowClientType.WAYLAND) {
                    this.#update_window_geometry();
                    this.#schedule_geometry_fixup();
                }

                Main.activateWindow(this.window);

                this.#set_window_above();
                this.#set_window_stick();
            });

            if (this.show_animation.should_skip) {
                Main.wm.skipNextEffect(this.#actor);
            } else if (this.show_animation.should_override) {
                this.#map_animation_override_handler = global.window_manager.connect(
                    'map',
                    this.#override_map_animation.bind(this)
                );
            }
        }

        this.#display_handlers = [
            global.display.connect('grab-op-begin', this.#grab_op_begin.bind(this)),
            global.display.connect('grab-op-end', this.#update_size_setting_on_grab_end.bind(this)),
        ];

        this.#setup_hide_when_focus_lost();

        this.#hide_animation_setup_handler =
            this.hide_animation.connect('notify::should-override', () => {
                this.#setup_destroy_animation_override(this.hide_animation.should_override);
            });

        this.#setup_destroy_animation_override(this.hide_animation.should_override);

        if (this.#actor.visible) {
            Main.activateWindow(this.window);

            this.#set_window_above();
            this.#set_window_stick();
        }

        if (should_maximize && this.#get_maximize_flags() !== Meta.MaximizeFlags.BOTH) {
            this.#set_maximize_flags(Meta.MaximizeFlags.BOTH);

            if (this.show_animation.should_skip)
                Main.wm.skipNextEffect(this.#actor);
        }

        this.#setup_wl_clipboard_activator();
    }

    #override_map_animation(wm, actor) {
        if (actor !== this.#actor)
            return;

        global.window_manager.disconnect(this.#map_animation_override_handler);
        this.#map_animation_override_handler = null;

        if (!Main.wm._waitForOverviewToHide) {
            this.show_animation.apply_override(actor);
            return;
        }

        Main.wm._waitForOverviewToHide().then(() => {
            if (actor === this.#actor)
                this.show_animation.apply_override(actor);
        });
    }

    #setup_destroy_animation_override(enable) {
        if (enable === Boolean(this.#destroy_animation_override_handler))
            return;

        if (enable) {
            this.#destroy_animation_override_handler = global.window_manager.connect(
                'destroy',
                this.#override_destroy_animation.bind(this)
            );
        } else {
            global.window_manager.disconnect(this.#destroy_animation_override_handler);
            this.#destroy_animation_override_handler = null;
        }
    }

    #override_destroy_animation(wm, actor) {
        if (actor !== this.#actor)
            return;

        this.hide_animation.apply_override(actor);
        this.disable();
    }

    #hide_when_focus_lost() {
        if (this.window.is_hidden())
            return;

        const win = global.display.focus_window;
        if (this.window === win)
            return;

        if (win) {
            if (this.window.is_ancestor_of_transient(win))
                return;

            if (is_wlclipboard(win))
                return;
        }

        this.emit('hide-request');
    }

    #setup_hide_when_focus_lost() {
        if (this.#focus_window_handler) {
            global.display.disconnect(this.#focus_window_handler);
            this.#focus_window_handler = null;
        }

        if (!this.settings.get_boolean('hide-when-focus-lost'))
            return;

        this.#focus_window_handler = global.display.connect(
            'notify::focus-window',
            this.#hide_when_focus_lost.bind(this)
        );
    }

    #setup_wl_clipboard_activator() {
        if (this.window.above) {
            if (!this.#wl_clipboard_activator) {
                this.#wl_clipboard_activator = new WlClipboardActivator({
                    display: global.display,
                });
            }
        } else {
            this.#wl_clipboard_activator?.disable();
            this.#wl_clipboard_activator = null;
        }
    }

    #set_window_above() {
        const should_be_above = this.settings.get_boolean('window-above');

        // Both make_above() and unmake_above() raise the window, so check is necessary
        if (this.window.above === should_be_above)
            return;

        if (should_be_above)
            this.window.make_above();
        else
            this.window.unmake_above();
    }

    #set_window_stick() {
        if (this.settings.get_boolean('window-stick'))
            this.window.stick();
        else
            this.window.unstick();
    }

    #setup_maximized_handlers() {
        if (this.#maximized_handler) {
            this.window.disconnect(this.#maximized_handler);
            this.#maximized_handler = null;
        }

        if (this.geometry.maximize_flag === Meta.MaximizeFlags.HORIZONTAL) {
            this.#maximized_handler = this.window.connect(
                'notify::maximized-horizontally',
                this.#handle_maximized_horizontally.bind(this)
            );
        } else {
            this.#maximized_handler = this.window.connect(
                'notify::maximized-vertically',
                this.#handle_maximized_vertically.bind(this)
            );
        }
    }

    #cancel_geometry_fixup() {
        while (this.#geometry_fixup_handlers?.length)
            this.window.disconnect(this.#geometry_fixup_handlers.pop());
    }

    #schedule_geometry_fixup() {
        if (this.#client_type !== Meta.WindowClientType.WAYLAND) {
            this.logger?.log('Not scheduling geometry fixup because not Wayland');
            return;
        }

        if (this.#geometry_fixup_handlers?.length) {
            this.logger?.log('Not scheduling geometry fixup because scheduled already');
            return;
        }

        this.logger?.log('Scheduling geometry fixup');

        this.#geometry_fixup_handlers = [
            this.window.connect('position-changed', () => this.#update_window_geometry()),
            this.window.connect('size-changed', () => this.#update_window_geometry()),
        ];
    }

    #unmaximize_done() {
        this.logger?.log('Unmaximize done');

        this.settings.set_boolean('window-maximize', false);
        this.#update_window_geometry();

        // https://github.com/ddterm/gnome-shell-extension-ddterm/issues/48
        if (this.settings.get_boolean('window-above') && !this.window.is_above()) {
            // Without unmake_above(), make_above() won't actually take effect (?!)
            this.window.unmake_above();
            this.window.make_above();
        }

        if (!this.#actor.visible && this.show_animation.should_skip)
            Main.wm.skipNextEffect(this.#actor);
    }

    #handle_maximized_vertically() {
        if (!this.window.maximized_vertically) {
            this.#unmaximize_done();
            return;
        }

        if (this.settings.get_boolean('window-maximize'))
            return;

        if (this.geometry.target_rect.height < this.geometry.workarea.height) {
            this.logger?.log(
                'Unmaximizing window because size expected to be less than full height'
            );

            Main.wm.skipNextEffect(this.#actor);
            this.#set_unmaximize_flags(Meta.MaximizeFlags.VERTICAL);
        } else {
            this.logger?.log('Setting window-maximize=true because window is maximized');
            this.settings.set_boolean('window-maximize', true);
        }
    }

    #handle_maximized_horizontally() {
        if (!this.window.maximized_horizontally) {
            this.#unmaximize_done();
            return;
        }

        if (this.settings.get_boolean('window-maximize'))
            return;

        if (this.geometry.target_rect.width < this.geometry.workarea.width) {
            this.logger?.log(
                'Unmaximizing window because size expected to be less than full width'
            );

            Main.wm.skipNextEffect(this.#actor);
            this.#set_unmaximize_flags(Meta.MaximizeFlags.HORIZONTAL);
        } else {
            this.logger?.log('Setting window-maximize=true because window is maximized');
            this.settings.set_boolean('window-maximize', true);
        }
    }

    #move_resize_window(target_rect) {
        this.window.move_resize_frame(
            false,
            target_rect.x,
            target_rect.y,
            target_rect.width,
            target_rect.height
        );

        this.emit('move-resize-requested', target_rect);
    }

    #get_maximize_flags() {
        if (this.window.get_maximize_flags)
            return this.window.get_maximize_flags();

        return this.window.get_maximized();
    }

    #set_maximize_flags(flags) {
        if (this.window.set_maximize_flags)
            return this.window.set_maximize_flags(flags);

        return this.window.maximize(flags);
    }

    #set_unmaximize_flags(flags) {
        if (this.window.set_maximize_flags)
            return this.window.set_unmaximize_flags(flags);

        return this.window.unmaximize(flags);
    }

    #is_maximized() {
        return Boolean(this.#get_maximize_flags() & this.geometry.maximize_flag);
    }

    #set_window_maximized() {
        const is_maximized = Boolean(this.#is_maximized());
        const should_maximize = this.settings.get_boolean('window-maximize');

        if (is_maximized === should_maximize)
            return;

        if (should_maximize) {
            this.logger?.log('Maximizing window according to settings');
            this.#set_maximize_flags(Meta.MaximizeFlags.BOTH);
        } else {
            this.logger?.log('Unmaximizing window according to settings');
            this.#set_unmaximize_flags(this.geometry.maximize_flag);

            this.logger?.log('Sheduling geometry fixup from window-maximize setting change');
            this.#schedule_geometry_fixup();
        }
    }

    #disable_window_maximize_setting() {
        const { target_rect, workarea } = this.geometry;

        if (target_rect.height < workarea.height || target_rect.width < workarea.width) {
            this.logger?.log('Unmaximizing window because size expected to be less than workarea');
            this.settings.set_boolean('window-maximize', false);
        }
    }

    #update_window_geometry() {
        this.#cancel_geometry_fixup();

        this.logger?.log('Updating window geometry');

        const { target_rect, workarea } = this.geometry;

        if (this.settings.get_boolean('window-maximize')) {
            if (this.#client_type === Meta.WindowClientType.WAYLAND)
                this.window.move_frame(true, workarea.x, workarea.y);

            this.#move_resize_window(workarea);

            if (!this.#actor.visible && this.show_animation.should_skip)
                Main.wm.skipNextEffect(this.#actor);

            if (!this.window.get_frame_rect().equal(workarea)) {
                this.logger?.log('Scheduling geometry fixup because of workarea mismatch');
                this.#schedule_geometry_fixup();
            }

            return;
        }

        if (this.#client_type === Meta.WindowClientType.WAYLAND)
            this.window.move_frame(true, target_rect.x, target_rect.y);

        if (this.window.maximized_horizontally && target_rect.width < workarea.width) {
            Main.wm.skipNextEffect(this.#actor);
            this.#set_unmaximize_flags(Meta.MaximizeFlags.HORIZONTAL);
            return;
        }

        if (this.window.maximized_vertically && target_rect.height < workarea.height) {
            Main.wm.skipNextEffect(this.#actor);
            this.#set_unmaximize_flags(Meta.MaximizeFlags.VERTICAL);
            return;
        }

        this.#move_resize_window(target_rect);

        if (!this.#actor.visible && this.show_animation.should_skip)
            Main.wm.skipNextEffect(this.#actor);

        if (!this.window.get_frame_rect().equal(target_rect)) {
            this.logger?.log('Scheduling geometry fixup because of geometry mismatch');
            this.#schedule_geometry_fixup();
        }

        if (this.#is_maximized())
            this.settings.set_boolean('window-maximize', true);
    }

    #grab_op_begin(display, win, flags) {
        if (win !== this.window)
            return;

        if (MOUSE_RESIZE_GRABS.includes(flags))
            this.#unmaximize_for_resize(this.geometry.maximize_flag);
    }

    #update_size_setting_on_grab_end(display, win) {
        if (win !== this.window)
            return;

        if (this.#is_maximized())
            return;

        this.logger?.log('Updating size setting on grab end');

        const frame_rect = win.get_frame_rect();
        const size = this.geometry.orientation === Clutter.Orientation.HORIZONTAL
            ? frame_rect.width / this.geometry.workarea.width
            : frame_rect.height / this.geometry.workarea.height;

        this.settings.set_double('window-size', Math.min(1.0, size));
    }

    #unmaximize_for_resize(flags) {
        this.#cancel_geometry_fixup();

        if (!(this.#get_maximize_flags() & flags))
            return;

        this.logger?.log('Unmaximizing for resize');

        // There is a _update_window_geometry() call after successful unmaximize.
        // It must set window size to 100%.
        this.settings.set_double('window-size', 1.0);

        Main.wm.skipNextEffect(this.#actor);
        this.#set_unmaximize_flags(flags);
    }

    #restore_auto_maximize() {
        if (this.#saved_auto_maximize === undefined)
            return;

        this.#mutter_settings.set_boolean('auto-maximize', this.#saved_auto_maximize);
        this.#saved_auto_maximize = undefined;
    }

    disable() {
        while (this.#settings_handlers?.length)
            this.settings.disconnect(this.#settings_handlers.pop());

        while (this.#geometry_handlers?.length)
            this.geometry.disconnect(this.#geometry_handlers.pop());

        while (this.#window_handlers?.length)
            this.window.disconnect(this.#window_handlers.pop());

        if (this.#map_handler) {
            global.window_manager.disconnect(this.#map_handler);
            this.#map_handler = null;
        }

        while (this.#display_handlers?.length)
            global.display.disconnect(this.#display_handlers.pop());

        if (this.#maximized_handler) {
            this.window.disconnect(this.#maximized_handler);
            this.#maximized_handler = null;
        }

        this.#cancel_geometry_fixup();

        if (this.#focus_window_handler) {
            global.display.disconnect(this.#focus_window_handler);
            this.#focus_window_handler = null;
        }

        if (this.#map_animation_override_handler) {
            global.window_manager.disconnect(this.#map_animation_override_handler);
            this.#map_animation_override_handler = null;
        }

        if (this.#hide_animation_setup_handler) {
            this.hide_animation.disconnect(this.#hide_animation_setup_handler);
            this.#hide_animation_setup_handler = null;
        }

        this.#setup_destroy_animation_override(false);

        this.#wl_clipboard_activator?.disable();

        this.#restore_auto_maximize();
    }
});
