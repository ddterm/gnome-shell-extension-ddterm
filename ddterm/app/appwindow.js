/*
    Copyright © 2020, 2021 Aleksandr Mezin

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

/* exported AppWindow */

const { GLib, GObject, Gio, Gdk, Gtk } = imports.gi;
const { notebook, resources } = imports.ddterm.app;
const { translations } = imports.ddterm.util;

function make_resizer(orientation) {
    const box = new Gtk.EventBox({ visible: true });

    new Gtk.Separator({
        visible: true,
        orientation,
        parent: box,
        margin_top: orientation === Gtk.Orientation.HORIZONTAL ? 2 : 0,
        margin_bottom: orientation === Gtk.Orientation.HORIZONTAL ? 2 : 0,
        margin_start: orientation === Gtk.Orientation.VERTICAL ? 2 : 0,
        margin_end: orientation === Gtk.Orientation.VERTICAL ? 2 : 0,
    });

    box.connect('realize', () => {
        box.window.cursor = Gdk.Cursor.new_from_name(
            box.get_display(),
            orientation === Gtk.Orientation.VERTICAL ? 'ew-resize' : 'ns-resize'
        );
    });

    return box;
}

var AppWindow = GObject.registerClass(
    {
        GTypeName: 'DDTermAppWindow',
        Properties: {
            'resources': GObject.ParamSpec.object(
                'resources',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                resources.Resources
            ),
            'settings': GObject.ParamSpec.object(
                'settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.Settings
            ),
            'desktop-settings': GObject.ParamSpec.object(
                'desktop-settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.Settings
            ),
            'extension-dbus': GObject.ParamSpec.object(
                'extension-dbus',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.DBusProxy
            ),
            'resize-handle': GObject.ParamSpec.boolean(
                'resize-handle',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                true
            ),
            'resize-edge': GObject.ParamSpec.enum(
                'resize-edge',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                Gdk.WindowEdge,
                Gdk.WindowEdge.SOUTH
            ),
            'tab-label-width': GObject.ParamSpec.double(
                'tab-label-width',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                0.0,
                0.5,
                0.1
            ),
        },
    },
    class AppWindow extends Gtk.ApplicationWindow {
        _init(params) {
            super._init({
                title: translations.gettext('Drop Down Terminal'),
                icon_name: 'utilities-terminal',
                window_position: Gtk.WindowPosition.CENTER,
                ...params,
            });

            const grid = new Gtk.Grid({
                parent: this,
                visible: true,
            });

            this.notebook = new notebook.Notebook({
                resources: this.resources,
                settings: this.settings,
                desktop_settings: this.desktop_settings,
                visible: true,
                hexpand: true,
                vexpand: true,
                scrollable: true,
                dbus_connection: this.application.get_dbus_connection(),
                // eslint-disable-next-line max-len
                dbus_object_path: `${this.application.get_dbus_object_path()}/window/${this.get_id()}/notebook`,
            });
            grid.attach(this.notebook, 1, 2, 1, 1);

            this.connect('notify::tab-label-width', this.update_tab_label_width.bind(this));
            this.connect('configure-event', this.update_tab_label_width.bind(this));
            this.update_tab_label_width();

            this.settings.bind(
                'tab-label-width',
                this,
                'tab-label-width',
                Gio.SettingsBindFlags.GET
            );

            this.banners = new Gtk.Box({
                visible: true,
                orientation: Gtk.Orientation.VERTICAL,
            });
            grid.attach(this.banners, 1, 1, 1, 1);

            const add_resize_box = (edge, x, y, orientation) => {
                const box = make_resizer(orientation);
                box.connect('button-press-event', this.start_resizing.bind(this, edge));
                grid.attach(box, x, y, 1, 1);

                const update_visible = () => {
                    box.visible = this.resize_handle && this.resize_edge === edge;
                };

                this.connect('notify::resize-handle', update_visible);
                this.connect('notify::resize-edge', update_visible);
                update_visible();
            };

            add_resize_box(Gdk.WindowEdge.SOUTH, 1, 3, Gtk.Orientation.HORIZONTAL);
            add_resize_box(Gdk.WindowEdge.NORTH, 1, 0, Gtk.Orientation.HORIZONTAL);
            add_resize_box(Gdk.WindowEdge.EAST, 2, 2, Gtk.Orientation.VERTICAL);
            add_resize_box(Gdk.WindowEdge.WEST, 0, 2, Gtk.Orientation.VERTICAL);

            this.settings.bind(
                'window-resizable',
                this,
                'resize-handle',
                Gio.SettingsBindFlags.GET
            );

            const window_pos_to_resize_edge = {
                top: Gdk.WindowEdge.SOUTH,
                bottom: Gdk.WindowEdge.NORTH,
                left: Gdk.WindowEdge.EAST,
                right: Gdk.WindowEdge.WEST,
            };

            const edge_handler = this.settings.connect('changed::window-position', () => {
                this.resize_edge =
                    window_pos_to_resize_edge[this.settings.get_string('window-position')];
            });
            this.connect('destroy', () => this.settings.disconnect(edge_handler));

            this.resize_edge =
                window_pos_to_resize_edge[this.settings.get_string('window-position')];

            this.connect('notify::screen', () => this.update_visual());
            this.update_visual();

            this.draw_handler = null;
            this.connect('notify::app-paintable', this.setup_draw_handler.bind(this));
            this.setup_draw_handler();

            this.settings.bind(
                'transparent-background',
                this,
                'app-paintable',
                Gio.SettingsBindFlags.GET
            );

            const HEIGHT_MOD = 0.05;
            const OPACITY_MOD = 0.05;

            const actions = {
                'toggle': this.toggle.bind(this),
                'show': () => this.show(),
                'hide': () => this.hide(),
                'window-size-dec': () => {
                    if (this.settings.get_boolean('window-maximize'))
                        this.settings.set_double('window-size', 1.0 - HEIGHT_MOD);
                    else
                        this.adjust_double_setting('window-size', -HEIGHT_MOD);
                },
                'window-size-inc': () => {
                    if (!this.settings.get_boolean('window-maximize'))
                        this.adjust_double_setting('window-size', HEIGHT_MOD);
                },
                'background-opacity-dec': () => {
                    this.adjust_double_setting('background-opacity', -OPACITY_MOD);
                },
                'background-opacity-inc': () => {
                    this.adjust_double_setting('background-opacity', OPACITY_MOD);
                },
            };

            for (const [name, activate] of Object.entries(actions)) {
                const action = new Gio.SimpleAction({ name });
                action.connect('activate', activate);
                this.add_action(action);
            }

            this.settings.bind(
                'window-type-hint',
                this,
                'type-hint',
                Gio.SettingsBindFlags.GET
            );

            this.settings.bind(
                'window-skip-taskbar',
                this,
                'skip-taskbar-hint',
                Gio.SettingsBindFlags.GET
            );

            this.settings.bind(
                'window-skip-taskbar',
                this,
                'skip-pager-hint',
                Gio.SettingsBindFlags.GET
            );

            const suppress_delete_handler = this.connect('delete-event', () => {
                this.hide();
                return true;
            });

            this.notebook.connect('page-removed', () => {
                if (this.notebook.get_n_pages() === 0) {
                    this.disconnect(suppress_delete_handler);
                    this.close();
                }
            });

            const display = this.get_display();

            if (display.constructor.$gtype.name === 'GdkWaylandDisplay') {
                const rect_type = new GLib.VariantType('(iiii)');

                const dbus_handler = this.extension_dbus.connect(
                    'g-properties-changed',
                    (_, changed, invalidated) => {
                        if (this.visible)
                            return;

                        if (invalidated.includes('TargetRect')) {
                            this.sync_size_with_extension();
                            return;
                        }

                        const value = changed.lookup_value('TargetRect', rect_type);

                        if (value)
                            this.sync_size_with_extension(value.deepUnpack());
                    }
                );

                this.connect('destroy', () => this.extension_dbus.disconnect(dbus_handler));

                this.connect('unmap-event', () => {
                    this.sync_size_with_extension();
                });

                this.sync_size_with_extension();
            }

            this.notebook.new_page(0);
        }

        setup_draw_handler() {
            if (this.app_paintable) {
                if (!this.draw_handler)
                    this.draw_handler = this.connect('draw', this.draw.bind(this));
            } else if (this.draw_handler) {
                this.disconnect(this.draw_handler);
                this.draw_handler = null;
            }

            this.queue_draw();
        }

        adjust_double_setting(name, difference, min = 0.0, max = 1.0) {
            const current = this.settings.get_double(name);
            const new_setting = current + difference;
            this.settings.set_double(name, Math.min(Math.max(new_setting, min), max));
        }

        toggle() {
            if (this.visible)
                this.hide();
            else
                this.show();
        }

        start_resizing(edge, source, event) {
            const [button_ok, button] = event.get_button();
            if (!button_ok || button !== Gdk.BUTTON_PRIMARY)
                return;

            const [coords_ok, x_root, y_root] = event.get_root_coords();
            if (!coords_ok)
                return;

            this.window.begin_resize_drag_for_device(
                edge,
                event.get_device(),
                button,
                x_root,
                y_root,
                event.get_time()
            );
        }

        update_visual() {
            const visual = this.screen.get_rgba_visual();

            if (visual)
                this.set_visual(visual);
        }

        draw(_widget, cr) {
            try {
                if (!this.app_paintable)
                    return false;

                if (!Gtk.cairo_should_draw_window(cr, this.window))
                    return false;

                const context = this.get_style_context();
                const allocation = this.get_child().get_allocation();
                Gtk.render_background(
                    context, cr, allocation.x, allocation.y, allocation.width, allocation.height
                );
                Gtk.render_frame(
                    context, cr, allocation.x, allocation.y, allocation.width, allocation.height
                );
            } finally {
                cr.$dispose();
            }

            return false;
        }

        sync_size_with_extension(rect = null) {
            if (this.is_maximized)
                return;

            if (!rect)
                rect = this.extension_dbus.GetTargetRectSync();

            const [target_x, target_y, target_w, target_h] = rect;

            const display = this.get_display();
            const target_monitor = display.get_monitor_at_point(target_x, target_y);

            const w = Math.floor(target_w / target_monitor.scale_factor);
            const h = Math.floor(target_h / target_monitor.scale_factor);

            this.resize(w, h);

            if (this.window)
                this.window.resize(w, h);
        }

        show_version_mismatch_warning() {
            const warning = new Gtk.InfoBar({
                message_type: Gtk.MessageType.WARNING,
                show_close_button: true,
                visible: true,
                revealed: true,
            });

            warning.get_content_area().add(new Gtk.Label({
                visible: true,
                label: translations.gettext(
                    'Warning: ddterm version has changed. ' +
                    'Log out, then log in again to load the updated extension.'
                ),
            }));

            warning.connect('response', widget => widget.destroy());
            this.banners.add(warning);
        }

        update_tab_label_width() {
            const [width] = this.get_size();
            this.notebook.tab_label_width = Math.floor(this.tab_label_width * width);
        }
    }
);
