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
const { extensiondbus, terminalpage } = imports.ddterm.app;
const { translations } = imports.ddterm.util;
const ByteArray = imports.byteArray;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const DDTERM_DIR = Me.dir.get_child('ddterm');

const APP_VERSION = JSON.parse(ByteArray.toString(
    Me.dir.get_child('metadata.json').load_contents(null)[1]
)).version;

var AppWindow = GObject.registerClass(
    {
        Template: DDTERM_DIR.get_child('app').get_child('ui').get_child('appwindow.ui').get_uri(),
        Children: [
            'notebook',
            'top_resize_box',
            'bottom_resize_box',
            'left_resize_box',
            'right_resize_box',
            'tab_switch_button',
            'new_tab_button',
            'new_tab_front_button',
            'tab_switch_menu_box',
        ],
        Properties: {
            'menus': GObject.ParamSpec.object(
                'menus',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gtk.Builder
            ),
            'settings': GObject.ParamSpec.object(
                'settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.Settings
            ),
        },
    },
    class AppWindow extends Gtk.ApplicationWindow {
        _init(params) {
            super._init(params);

            this.extension_dbus = extensiondbus.get();

            this.connect('notify::screen', () => this.update_visual());
            this.update_visual();

            let draw_handler = null;
            this.map_settings(['transparent-background'], () => {
                if (draw_handler) {
                    this.disconnect(draw_handler);
                    draw_handler = null;
                }

                if (this.settings.get_boolean('transparent-background'))
                    draw_handler = this.connect('draw', this.draw.bind(this));

                this.queue_draw();
            });

            const HEIGHT_MOD = 0.05;
            const OPACITY_MOD = 0.05;

            const actions = {
                'toggle': this.toggle.bind(this),
                'show': () => this.show(),
                'hide': () => this.hide(),
                'new-tab': this.insert_page.bind(this, -1),
                'new-tab-front': this.insert_page.bind(this, 0),
                'new-tab-before-current': () => {
                    this.insert_page(this.notebook.get_current_page());
                },
                'new-tab-after-current': () => {
                    this.insert_page(this.notebook.get_current_page() + 1);
                },
                'close-current-tab': () => {
                    const page = this.notebook.get_nth_page(this.notebook.page);
                    page.emit('close-request');
                },
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
                'next-tab': () => {
                    const current = this.notebook.get_current_page();

                    if (current === this.notebook.get_n_pages() - 1)
                        this.notebook.set_current_page(0);
                    else
                        this.notebook.set_current_page(current + 1);
                },
                'prev-tab': () => {
                    const current = this.notebook.get_current_page();

                    if (current === 0)
                        this.notebook.set_current_page(this.notebook.get_n_pages() - 1);
                    else
                        this.notebook.set_current_page(current - 1);
                },
                'move-tab-prev': () => {
                    const current = this.notebook.get_current_page();

                    if (current === 0) {
                        this.notebook.reorder_child(
                            this.notebook.get_nth_page(current),
                            this.notebook.get_n_pages() - 1
                        );
                    } else {
                        this.notebook.reorder_child(
                            this.notebook.get_nth_page(current),
                            current - 1
                        );
                    }
                },
                'move-tab-next': () => {
                    const current = this.notebook.get_current_page();

                    if (current === this.notebook.get_n_pages() - 1) {
                        this.notebook.reorder_child(
                            this.notebook.get_nth_page(current),
                            0
                        );
                    } else {
                        this.notebook.reorder_child(
                            this.notebook.get_nth_page(current),
                            current + 1
                        );
                    }
                },
            };

            for (const [name, activate] of Object.entries(actions)) {
                const action = new Gio.SimpleAction({ name });
                action.connect('activate', activate);
                this.add_action(action);
            }

            this.tab_select_action = new Gio.PropertyAction({
                name: 'switch-to-tab',
                object: this.notebook,
                property_name: 'page',
            });
            this.add_action(this.tab_select_action);

            const vertical_resize_boxes = [this.top_resize_box, this.bottom_resize_box];
            const horizontal_resize_boxes = [this.left_resize_box, this.right_resize_box];
            const resize_boxes = horizontal_resize_boxes.concat(vertical_resize_boxes);

            for (let widget of resize_boxes) {
                const cursor_name =
                    vertical_resize_boxes.includes(widget) ? 'ns-resize' : 'ew-resize';

                widget.connect('realize', source => {
                    source.window.cursor = Gdk.Cursor.new_from_name(
                        source.get_display(),
                        cursor_name
                    );
                });

                widget.connect('button-press-event', this.start_resizing.bind(this));
            }

            const resize_box_for_window_pos = {
                'top': this.bottom_resize_box,
                'bottom': this.top_resize_box,
                'left': this.right_resize_box,
                'right': this.left_resize_box,
            };

            this.map_settings(['window-resizable', 'window-position'], () => {
                const resizable = this.settings.get_boolean('window-resizable');
                const window_pos = this.settings.get_string('window-position');

                for (const [pos, widget] of Object.entries(resize_box_for_window_pos))
                    widget.visible = resizable && window_pos === pos;
            });

            const visibility_settings = {
                'new-tab-button': this.new_tab_button,
                'new-tab-front-button': this.new_tab_front_button,
                'tab-switcher-popup': this.tab_switch_button,
            };

            Object.entries(visibility_settings).forEach(([setting, widget]) => {
                this.map_settings([setting], () => {
                    widget.visible = this.settings.get_boolean(setting);
                });
            });

            this.map_settings(['tab-policy'], this.update_tabs_visible.bind(this));
            this.notebook.connect('page-added', this.update_tabs_visible.bind(this));
            this.notebook.connect('page-removed', this.update_tabs_visible.bind(this));

            const tab_pos = {
                'top': Gtk.PositionType.TOP,
                'bottom': Gtk.PositionType.BOTTOM,
                'left': Gtk.PositionType.LEFT,
                'right': Gtk.PositionType.RIGHT,
            };

            const switch_arrow_direction_for_tab_pos = {
                'top': Gtk.ArrowType.DOWN,
                'bottom': Gtk.ArrowType.UP,
                'left': Gtk.ArrowType.RIGHT,
                'right': Gtk.ArrowType.LEFT,
            };

            this.map_settings(['tab-position'], () => {
                const position = this.settings.get_string('tab-position');
                this.notebook.tab_pos = tab_pos[position];
                this.tab_switch_button.direction = switch_arrow_direction_for_tab_pos[position];
            });

            this.map_settings(['notebook-border'], () => {
                this.notebook.show_border = this.settings.get_boolean('notebook-border');
            });

            this.notebook.connect('page-added', this.tab_switcher_add.bind(this));
            this.notebook.connect('page-removed', this.tab_switcher_remove.bind(this));
            this.notebook.connect('page-reordered', this.tab_switcher_reorder.bind(this));

            this.notebook.connect('page-added', this.update_tab_switch_shortcuts.bind(this));
            this.notebook.connect('page-removed', this.update_tab_switch_shortcuts.bind(this));
            this.notebook.connect('page-reordered', this.update_tab_switch_shortcuts.bind(this));
            this.connect('keys-changed', this.update_tab_switch_shortcuts.bind(this));

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

            this.map_settings(['window-type-hint'], () => {
                this.type_hint = this.settings.get_enum('window-type-hint');
            });

            this.map_settings(['window-skip-taskbar'], () => {
                const value = this.settings.get_boolean('window-skip-taskbar');
                this.skip_taskbar_hint = value;
                this.skip_pager_hint = value;
            });

            const extension_version = this.extension_dbus.Version;
            this.extension_version_mismatch = extension_version !== `${APP_VERSION}`;

            if (this.extension_version_mismatch) {
                printerr(
                    'ddterm extension version mismatch! ' +
                    `app: ${APP_VERSION} extension: ${extension_version}`
                );
            }

            this.desktop_settings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.interface',
            });

            this.insert_page(0);

            const display = Gdk.Display.get_default();

            if (display.constructor.$gtype.name === 'GdkWaylandDisplay') {
                const dbus_handler = this.extension_dbus.connect('g-properties-changed', () => {
                    if (!this.visible)
                        this.sync_size_with_extension();
                });
                this.connect('destroy', () => this.extension_dbus.disconnect(dbus_handler));
                this.connect('unmap-event', () => {
                    this.sync_size_with_extension();
                });
                this.sync_size_with_extension();
            }
        }

        map_settings(keys, func) {
            keys.forEach(key => {
                const handler = this.settings.connect(`changed::${key}`, func);
                this.connect('destroy', () => this.settings.disconnect(handler));
            });

            func();
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

        get_cwd() {
            const current_page = this.notebook.get_nth_page(this.notebook.get_current_page());

            return current_page ? current_page.get_cwd() : null;
        }

        insert_page(position) {
            const cwd =
                this.settings.get_boolean('preserve-working-directory') ? this.get_cwd() : null;

            const page = new terminalpage.TerminalPage({
                settings: this.settings,
                menus: this.menus,
                desktop_settings: this.desktop_settings,
            });

            const index = this.notebook.insert_page(page, page.tab_label, position);
            this.notebook.set_current_page(index);
            this.notebook.set_tab_reorderable(page, true);
            this.notebook.set_can_focus(false);

            const update_tab_expand = () => {
                this.notebook.child_set_property(
                    page,
                    'tab-expand',
                    this.settings.get_boolean('tab-expand')
                );
            };

            const tab_expand_handler = this.settings.connect(
                'changed::tab-expand',
                update_tab_expand
            );
            page.connect('destroy', () => this.settings.disconnect(tab_expand_handler));

            update_tab_expand();

            page.connect('close-request', () => {
                this.notebook.remove(page);
                page.destroy();
            });

            page.connect('new-tab-before-request', () => {
                this.insert_page(this.notebook.page_num(page));
            });

            page.connect('new-tab-after-request', () => {
                this.insert_page(this.notebook.page_num(page) + 1);
            });

            if (this.extension_version_mismatch) {
                const message = translations.gettext(
                    'Warning: ddterm version has changed. ' +
                    'Log out, then log in again to load the updated extension.'
                );

                page.terminal.feed(`\u001b[1;31m${message}\u001b[0m\r\n`);
            }

            page.spawn(cwd);

            page.terminal.grab_focus();
        }

        start_resizing(source, event) {
            const [button_ok, button] = event.get_button();
            if (!button_ok || button !== Gdk.BUTTON_PRIMARY)
                return;

            let edge;

            if (source === this.bottom_resize_box)
                edge = Gdk.WindowEdge.SOUTH;

            else if (source === this.top_resize_box)
                edge = Gdk.WindowEdge.NORTH;

            else if (source === this.right_resize_box)
                edge = Gdk.WindowEdge.EAST;

            else if (source === this.left_resize_box)
                edge = Gdk.WindowEdge.WEST;

            else
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

        tab_switcher_add(_notebook, child, page_num) {
            child.switcher_item.action_target = GLib.Variant.new_int32(page_num);
            this.tab_switch_menu_box.add(child.switcher_item);
            this.tab_switch_menu_box.reorder_child(child.switcher_item, page_num);
            this.tab_switcher_update_actions();
        }

        tab_switcher_remove(_notebook, child, _page_num) {
            this.tab_switch_menu_box.remove(child.switcher_item);
            this.tab_switcher_update_actions();
        }

        tab_switcher_reorder(_notebook, child, page_num) {
            this.tab_switch_menu_box.reorder_child(child.switcher_item, page_num);
            this.tab_switcher_update_actions();
        }

        tab_switcher_update_actions() {
            const counter = { value: 0 };

            this.tab_switch_menu_box.foreach(item => {
                item.action_target = GLib.Variant.new_int32(counter.value++);
            });
        }

        update_tab_switch_shortcuts() {
            let i = 0;

            this.notebook.foreach(page => {
                const shortcuts =
                    this.application.get_accels_for_action(`win.switch-to-tab(${i})`);

                page.set_switch_shortcut(
                    shortcuts && shortcuts.length > 0 ? shortcuts[0] : null
                );

                i += 1;
            });
        }

        update_tabs_visible() {
            switch (this.settings.get_string('tab-policy')) {
            case 'always':
                this.notebook.show_tabs = true;
                break;

            case 'never':
                this.notebook.show_tabs = false;
                break;

            case 'automatic':
                this.notebook.show_tabs = this.notebook.get_n_pages() > 1;
            }
        }

        sync_size_with_extension() {
            if (this.is_maximized)
                return;

            const display = this.get_display();

            const [target_x, target_y, target_w, target_h] =
                this.extension_dbus.GetTargetRectSync();
            const target_monitor = display.get_monitor_at_point(target_x, target_y);

            const w = Math.floor(target_w / target_monitor.scale_factor);
            const h = Math.floor(target_h / target_monitor.scale_factor);

            this.resize(w, h);

            if (this.window)
                this.window.resize(w, h);
        }
    }
);
