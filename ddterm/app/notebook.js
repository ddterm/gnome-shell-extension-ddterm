/*
    Copyright © 2023 Aleksandr Mezin

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

/* exported Notebook */

const { GLib, GObject, Gio, Gtk } = imports.gi;
const { terminalpage } = imports.ddterm.app;
const { translations } = imports.ddterm.util;

var SwitchButton = GObject.registerClass(
    {
        Properties: {
            'page': GObject.ParamSpec.object(
                'page',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                terminalpage.TerminalPage
            ),
        },
    },
    class DDTermTabSwitchButton extends Gtk.ModelButton {
        _init(params) {
            super._init(params);

            this.page?.terminal.bind_property(
                'window-title',
                this,
                'text',
                GObject.BindingFlags.SYNC_CREATE
            );
        }
    }
);

var Notebook = GObject.registerClass(
    {
        GTypeName: 'DDTermNotebook',
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
            'desktop-settings': GObject.ParamSpec.object(
                'desktop-settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.Settings
            ),
            'dbus-connection': GObject.ParamSpec.object(
                'dbus-connection',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.DBusConnection
            ),
            'dbus-object-path': GObject.ParamSpec.string(
                'dbus-object-path',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                ''
            ),
            'tab-expand': GObject.ParamSpec.boolean(
                'tab-expand',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                true
            ),
            'tab-label-width': GObject.ParamSpec.int(
                'tab-label-width',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                -1,
                GLib.MAXINT32,
                -1
            ),
            'tab-policy': GObject.ParamSpec.string(
                'tab-policy',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                'always'
            ),
            'preserve-working-directory': GObject.ParamSpec.boolean(
                'preserve-working-directory',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                true
            ),
        },
    },
    class Notebook extends Gtk.Notebook {
        _init(params) {
            super._init(params);

            const button_box = new Gtk.Box({ visible: true });

            this.new_tab_button = new Gtk.Button({
                image: Gtk.Image.new_from_icon_name('list-add', Gtk.IconSize.MENU),
                tooltip_text: translations.gettext('New Tab (Last)'),
                action_name: 'notebook.new-tab',
                relief: Gtk.ReliefStyle.NONE,
                visible: true,
            });
            button_box.add(this.new_tab_button);

            this.tab_switch_menu_box = new Gtk.Box({
                visible: true,
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 10,
                border_width: 10,
            });

            this.tab_switch_button = new Gtk.MenuButton({
                popover: new Gtk.Popover({
                    child: this.tab_switch_menu_box,
                }),
                focus_on_click: false,
                relief: Gtk.ReliefStyle.NONE,
                visible: true,
            });
            button_box.add(this.tab_switch_button);

            this.set_action_widget(button_box, Gtk.PackType.END);

            this.new_tab_front_button = new Gtk.Button({
                image: Gtk.Image.new_from_icon_name('list-add', Gtk.IconSize.MENU),
                tooltip_text: translations.gettext('New Tab (First)'),
                action_name: 'notebook.new-tab-front',
                relief: Gtk.ReliefStyle.NONE,
                visible: true,
            });
            this.set_action_widget(this.new_tab_front_button, Gtk.PackType.START);

            const actions = {
                'new-tab': this.new_page.bind(this, -1),
                'new-tab-front': this.new_page.bind(this, 0),
                'new-tab-before-current': () => {
                    this.new_page(this.get_current_page());
                },
                'new-tab-after-current': () => {
                    this.new_page(this.get_current_page() + 1);
                },
                'close-current-tab': () => {
                    const page = this.get_nth_page(this.page);
                    page.destroy();
                },
                'next-tab': () => {
                    const current = this.get_current_page();

                    if (current === this.get_n_pages() - 1)
                        this.set_current_page(0);
                    else
                        this.set_current_page(current + 1);
                },
                'prev-tab': () => {
                    const current = this.get_current_page();

                    if (current === 0)
                        this.set_current_page(this.get_n_pages() - 1);
                    else
                        this.set_current_page(current - 1);
                },
                'move-tab-prev': () => {
                    const current = this.get_current_page();

                    if (current === 0) {
                        this.reorder_child(
                            this.get_nth_page(current),
                            this.get_n_pages() - 1
                        );
                    } else {
                        this.reorder_child(
                            this.get_nth_page(current),
                            current - 1
                        );
                    }
                },
                'move-tab-next': () => {
                    const current = this.get_current_page();

                    if (current === this.get_n_pages() - 1) {
                        this.reorder_child(
                            this.get_nth_page(current),
                            0
                        );
                    } else {
                        this.reorder_child(
                            this.get_nth_page(current),
                            current + 1
                        );
                    }
                },
            };

            this.actions = new Gio.SimpleActionGroup();
            this.insert_action_group('notebook', this.actions);

            for (const [name, activate] of Object.entries(actions)) {
                const action = new Gio.SimpleAction({ name });
                action.connect('activate', activate);
                this.actions.add_action(action);
            }

            this.tab_select_action = new Gio.PropertyAction({
                name: 'switch-to-tab',
                object: this,
                property_name: 'page',
            });
            this.actions.add_action(this.tab_select_action);

            this.settings.bind(
                'new-tab-button',
                this.new_tab_button,
                'visible',
                Gio.SettingsBindFlags.GET
            );

            this.settings.bind(
                'new-tab-front-button',
                this.new_tab_front_button,
                'visible',
                Gio.SettingsBindFlags.GET
            );

            this.settings.bind(
                'tab-switcher-popup',
                this.tab_switch_button,
                'visible',
                Gio.SettingsBindFlags.GET
            );

            this.connect('page-added', this.update_tabs_visible.bind(this));
            this.connect('page-removed', this.update_tabs_visible.bind(this));

            this.settings.bind(
                'tab-policy',
                this,
                'tab-policy',
                Gio.SettingsBindFlags.GET
            );

            this.connect('notify::tab-policy', this.update_tabs_visible.bind(this));
            this.update_tabs_visible();

            this.settings.bind(
                'tab-position',
                this,
                'tab-pos',
                Gio.SettingsBindFlags.GET
            );

            this.connect('notify::tab-pos', this.update_tab_pos.bind(this));
            this.update_tab_pos();

            this.settings.bind(
                'tab-expand',
                this,
                'tab-expand',
                Gio.SettingsBindFlags.GET
            );

            this.connect('notify::tab-expand', this.update_tab_expand.bind(this));
            this.update_tab_expand();

            this.settings.bind(
                'notebook-border',
                this,
                'show-border',
                Gio.SettingsBindFlags.GET
            );

            this.settings.bind(
                'preserve-working-directory',
                this,
                'preserve-working-directory',
                Gio.SettingsBindFlags.GET
            );

            this.page_disconnect = new Map();

            if (this.dbus_connection && this.dbus_object_path) {
                const action_group_id = this.dbus_connection.export_action_group(
                    this.dbus_object_path,
                    this.actions
                );

                this.connect('destroy', () => {
                    Gio.DBus.session.unexport_action_group(action_group_id);
                });
            }
        }

        on_page_added(child, page_num) {
            this.set_tab_reorderable(child, true);
            this.child_set_property(child, 'tab-expand', this.tab_expand);

            const new_tab_before_handler = child.connect('new-tab-before-request', () => {
                this.new_page(this.page_num(child));
            });

            const new_tab_after_handler = child.connect('new-tab-after-request', () => {
                this.new_page(this.page_num(child) + 1);
            });

            const label = this.get_tab_label(child);

            const label_width_binding = this.bind_property(
                'tab-label-width',
                label,
                'width-request',
                GObject.BindingFlags.SYNC_CREATE
            );

            this.page_disconnect.set(child, () => {
                child.disconnect(new_tab_before_handler);
                child.disconnect(new_tab_after_handler);
                label_width_binding.unbind();
            });

            const switch_button = new SwitchButton({
                page: child,
                visible: true,
                action_name: 'notebook.switch-to-tab',
                action_target: GLib.Variant.new_int32(page_num),
            });

            label.action_name = switch_button.action_name;
            label.action_target = switch_button.action_target;

            this.tab_switch_menu_box.add(switch_button);
            this.tab_switch_menu_box.reorder_child(switch_button, page_num);
            this.tab_switcher_update_actions();
        }

        on_page_removed(child, page_num) {
            const disconnect = this.page_disconnect.get(child);
            this.page_disconnect.delete(child);

            if (disconnect)
                disconnect();

            this.tab_switch_menu_box.remove(this.tab_switch_menu_box.get_children()[page_num]);
            this.tab_switcher_update_actions();
        }

        on_page_reordered(child, page_num) {
            this.tab_switch_menu_box.foreach(item => {
                if (item.page === child)
                    this.tab_switch_menu_box.reorder_child(item, page_num);
            });

            this.tab_switcher_update_actions();
        }

        get_cwd() {
            const current_page = this.get_nth_page(this.get_current_page());

            return current_page ? current_page.get_cwd() : null;
        }

        new_page(position) {
            const cwd = this.preserve_working_directory ? this.get_cwd() : null;

            const page = new terminalpage.TerminalPage({
                settings: this.settings,
                menus: this.menus,
                desktop_settings: this.desktop_settings,
                visible: true,
            });

            const index = this.insert_page(page, page.tab_label, position);
            page.spawn(cwd);
            this.set_current_page(index);
            page.terminal.grab_focus();
        }

        tab_switcher_update_actions() {
            let i = 0;

            this.tab_switch_menu_box.foreach(item => {
                const value = GLib.Variant.new_int32(i++);
                item.action_target = value;
                this.get_tab_label(item.page).action_target = value;
            });
        }

        update_tab_expand() {
            this.foreach(page => {
                this.child_set_property(page, 'tab-expand', this.tab_expand);
            });
        }

        update_tabs_visible() {
            switch (this.tab_policy) {
            case 'always':
                this.show_tabs = true;
                break;

            case 'never':
                this.show_tabs = false;
                break;

            case 'automatic':
                this.show_tabs = this.get_n_pages() > 1;
            }
        }

        update_tab_pos() {
            switch (this.tab_pos) {
            case Gtk.PositionType.TOP:
                this.tab_switch_button.direction = Gtk.ArrowType.DOWN;
                break;

            case Gtk.PositionType.BOTTOM:
                this.tab_switch_button.direction = Gtk.ArrowType.UP;
                break;

            case Gtk.PositionType.LEFT:
                this.tab_switch_button.direction = Gtk.ArrowType.RIGHT;
                break;

            case Gtk.PositionType.RIGHT:
                this.tab_switch_button.direction = Gtk.ArrowType.LEFT;
                break;
            }
        }

        vfunc_grab_focus() {
            const current_page = this.get_nth_page(this.get_current_page());

            current_page.grab_focus();
        }
    }
);
