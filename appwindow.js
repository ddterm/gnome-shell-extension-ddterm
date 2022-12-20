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
const { rxjs } = imports.rxjs;
const { rxutil, settings, terminalpage, translations } = imports;
const ByteArray = imports.byteArray;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const EXTENSION_DBUS_XML = ByteArray.toString(
    Me.dir.get_child('com.github.amezin.ddterm.Extension.xml').load_contents(null)[1]
);

const APP_VERSION = JSON.parse(ByteArray.toString(
    Me.dir.get_child('metadata.json').load_contents(null)[1]
)).version;

var ExtensionDBusProxy = Gio.DBusProxy.makeProxyWrapper(EXTENSION_DBUS_XML);

var AppWindow = GObject.registerClass(
    {
        Template: Me.dir.get_child('appwindow.ui').get_uri(),
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
                settings.Settings
            ),
        },
    },
    class AppWindow extends Gtk.ApplicationWindow {
        _init(params) {
            super._init(params);

            this.rx = rxutil.scope(this);

            this.extension_dbus = new ExtensionDBusProxy(
                Gio.DBus.session,
                'org.gnome.Shell',
                '/org/gnome/Shell/Extensions/ddterm',
                undefined,
                undefined,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START
            );

            this.rx.subscribe(
                rxutil.property(this, 'screen'),
                screen => {
                    const visual = screen.get_rgba_visual();

                    if (visual)
                        this.set_visual(visual);
                }
            );

            this.draw_subscription = new rxjs.Subscription();

            this.rx.subscribe(
                this.settings['transparent-background'],
                transparent => {
                    this.app_paintable = transparent;

                    this.draw_subscription.unsubscribe();

                    if (transparent) {
                        this.draw_subscription = this.rx.connect(
                            this, 'draw', this.draw.bind(this)
                        );
                    }

                    this.queue_draw();
                }
            );

            const page_added = rxutil.signal(this.notebook, 'page-added');
            const page_removed = rxutil.signal(this.notebook, 'page-removed');
            const page_reordered = rxutil.signal(this.notebook, 'page-reordered');

            const n_pages = rxjs.merge(page_added, page_removed).pipe(
                rxjs.startWith([this.notebook]),
                rxjs.map(([notebook]) => notebook.get_n_pages())
            );

            this.rx.subscribe(
                n_pages.pipe(rxjs.skip(1)),
                n => {
                    if (n === 0)
                        this.close();
                }
            );

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
                    if (this.settings['window-maximize'].value)
                        this.settings['window-size'].value = 1.0 - HEIGHT_MOD;
                    else
                        this.adjust_double_setting('window-size', -HEIGHT_MOD);
                },
                'window-size-inc': () => {
                    if (!this.settings['window-maximize'].value)
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

            for (const [name, func] of Object.entries(actions))
                this.add_action(this.rx.make_simple_action(name, func));

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

                this.rx.connect(widget, 'realize', source => {
                    source.window.cursor = Gdk.Cursor.new_from_name(
                        source.get_display(),
                        cursor_name
                    );
                });

                this.rx.connect(widget, 'button-press-event', this.start_resizing.bind(this));
            }

            const resizable = this.settings['window-resizable'];
            const window_pos = this.settings['window-position'];

            const resize_box_for_window_pos = {
                'top': this.bottom_resize_box,
                'bottom': this.top_resize_box,
                'left': this.right_resize_box,
                'right': this.left_resize_box,
            };

            for (const pos of Object.keys(resize_box_for_window_pos)) {
                this.rx.subscribe(
                    resizable.pipe(
                        rxutil.enable_if(
                            window_pos.pipe(rxjs.map(p => p === pos)),
                            rxjs.of(false)
                        )
                    ),
                    rxutil.property(resize_box_for_window_pos[pos], 'visible')
                );
            }

            const visibility_settings = {
                'new-tab-button': this.new_tab_button,
                'new-tab-front-button': this.new_tab_front_button,
                'tab-switcher-popup': this.tab_switch_button,
            };

            for (const [setting, widget] of Object.entries(visibility_settings)) {
                this.rx.subscribe(
                    this.settings[setting],
                    rxutil.property(widget, 'visible')
                );
            }

            this.rx.subscribe(
                rxutil.switch_on(this.settings['tab-policy'], {
                    'always': rxjs.of(true),
                    'never': rxjs.of(false),
                    'automatic': n_pages.pipe(rxjs.map(n => n > 1)),
                }),
                rxutil.property(this.notebook, 'show-tabs')
            );

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

            this.rx.subscribe(
                this.settings['tab-position'],
                position => {
                    this.notebook.tab_pos = tab_pos[position];
                    this.tab_switch_button.direction = switch_arrow_direction_for_tab_pos[position];
                }
            );

            const keys_changed = rxutil.signal(this, 'keys-changed');

            this.rx.subscribe(
                rxjs.merge(page_added, page_removed, page_reordered, keys_changed),
                () => {
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
            );

            this.rx.subscribe(
                this.settings['notebook-border'],
                rxutil.property(this.notebook, 'show-border')
            );

            this.rx.connect(this.notebook, 'page-added', this.tab_switcher_add.bind(this));
            this.rx.connect(this.notebook, 'page-removed', this.tab_switcher_remove.bind(this));
            this.rx.connect(this.notebook, 'page-reordered', this.tab_switcher_reorder.bind(this));

            this.rx.subscribe(
                this.settings['window-type-hint'],
                rxutil.property(this, 'type-hint')
            );

            this.rx.subscribe(
                this.settings['window-skip-taskbar'],
                value => {
                    this.skip_taskbar_hint = value;
                    this.skip_pager_hint = value;
                }
            );

            this.suppress_delete_subscription = this.rx.connect(this, 'delete-event', () => {
                this.hide();
                return true;
            });

            const extension_version = this.extension_dbus.Version;
            this.extension_version_mismatch = extension_version !== `${APP_VERSION}`;

            if (this.extension_version_mismatch) {
                printerr(
                    'ddterm extension version mismatch! ' +
                    `app: ${APP_VERSION} extension: ${extension_version}`
                );
            }

            this.insert_page(0);

            const display = Gdk.Display.get_default();

            if (display.constructor.$gtype.name === 'GdkWaylandDisplay') {
                this.rx.connect(this.extension_dbus, 'g-properties-changed', () => {
                    if (!this.visible)
                        this.sync_size_with_extension();
                });
                this.rx.connect(this, 'unmap-event', () => {
                    this.sync_size_with_extension();
                });
                this.sync_size_with_extension();
            }
        }

        adjust_double_setting(name, difference, min = 0.0, max = 1.0) {
            const current = this.settings[name].value;
            const new_setting = current + difference;
            this.settings[name].value = Math.min(Math.max(new_setting, min), max);
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
            const cwd = this.settings['preserve-working-directory'].value ? this.get_cwd() : null;

            const page = new terminalpage.TerminalPage({
                settings: this.settings,
                menus: this.menus,
            });

            const index = this.notebook.insert_page(page, page.tab_label, position);
            this.notebook.set_current_page(index);
            this.notebook.set_tab_reorderable(page, true);

            const page_scope = rxutil.scope(page, rxutil.signal(page, 'destroy'));
            this.rx.add(page_scope);

            page_scope.subscribe(
                this.settings['tab-expand'],
                expand => {
                    this.notebook.child_set_property(page, 'tab-expand', expand);
                }
            );

            page_scope.connect(page, 'close-request', sender => {
                this.notebook.remove(sender);
                sender.destroy();
            });

            page_scope.connect(page, 'new-tab-before-request', sender => {
                this.insert_page(this.notebook.page_num(sender));
            });

            page_scope.connect(page, 'new-tab-after-request', sender => {
                this.insert_page(this.notebook.page_num(sender) + 1);
            });

            if (this.extension_version_mismatch) {
                const message = translations.gettext(
                    'Warning: ddterm version has changed. ' +
                    'Log out, then log in again to load the updated extension.'
                );

                page.terminal.feed(`\u001b[1;31m${message}\u001b[0m\n`);
            }

            page.spawn(cwd);

            page.terminal.grab_focus();
        }

        close() {
            this.suppress_delete_subscription.unsubscribe();
            super.close();
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
