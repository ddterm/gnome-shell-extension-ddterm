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
const { metadata, terminalpage } = imports.ddterm.app;
const { translations } = imports.ddterm.util;

const Me = imports.misc.extensionUtils.getCurrentExtension();

const DDTERM_DIR = Me.dir.get_child('ddterm');

var Notebook = GObject.registerClass(
    {
        Template: DDTERM_DIR.get_child('app').get_child('ui').get_child('notebook.ui').get_uri(),
        GTypeName: 'DDTermNotebook',
        Children: [
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
        },
    },
    class Notebook extends Gtk.Notebook {
        _init(params) {
            super._init(params);

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
                    page.emit('close-request');
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

            const tab_policy_handler = this.settings.connect(
                'changed::tab-policy',
                this.update_tabs_visible.bind(this)
            );
            this.connect('destroy', () => this.settings.disconnect(tab_policy_handler));
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
                'notebook-border',
                this,
                'show-border',
                Gio.SettingsBindFlags.GET
            );

            this.connect('page-added', this.tab_switcher_add.bind(this));
            this.connect('page-removed', this.tab_switcher_remove.bind(this));
            this.connect('page-reordered', this.tab_switcher_reorder.bind(this));

            this.connect('page-added', this.update_tab_switch_shortcuts.bind(this));
            this.connect('page-removed', this.update_tab_switch_shortcuts.bind(this));
            this.connect('page-reordered', this.update_tab_switch_shortcuts.bind(this));

            this.disconnect_toplevel = Function();
            this.connect('hierarchy-changed', this.update_toplevel.bind(this));
            this.connect('destroy', () => this.disconnect_toplevel());
            this.update_toplevel();
        }

        get_cwd() {
            const current_page = this.get_nth_page(this.get_current_page());

            return current_page ? current_page.get_cwd() : null;
        }

        new_page(position) {
            const cwd =
                this.settings.get_boolean('preserve-working-directory') ? this.get_cwd() : null;

            const page = new terminalpage.TerminalPage({
                settings: this.settings,
                menus: this.menus,
                desktop_settings: this.desktop_settings,
            });

            const index = this.insert_page(page, page.tab_label, position);
            this.set_current_page(index);
            this.set_tab_reorderable(page, true);
            this.set_can_focus(false);

            const update_tab_expand = () => {
                this.child_set_property(
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
                this.remove(page);
                page.destroy();
            });

            page.connect('new-tab-before-request', () => {
                this.new_page(this.page_num(page));
            });

            page.connect('new-tab-after-request', () => {
                this.new_page(this.page_num(page) + 1);
            });

            if (this.extension_dbus.Version !== `${metadata.version}`) {
                const message = translations.gettext(
                    'Warning: ddterm version has changed. ' +
                    'Log out, then log in again to load the updated extension.'
                );

                page.terminal.feed(`\u001b[1;31m${message}\u001b[0m\r\n`);
            }

            page.spawn(cwd);

            page.terminal.grab_focus();
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
            const application = this.get_toplevel().application;
            let i = 0;

            this.foreach(page => {
                const shortcuts = application.get_accels_for_action(`notebook.switch-to-tab(${i})`);

                page.set_switch_shortcut(
                    shortcuts && shortcuts.length > 0 ? shortcuts[0] : null
                );

                i += 1;
            });
        }

        update_tabs_visible() {
            switch (this.settings.get_string('tab-policy')) {
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

        update_toplevel() {
            this.disconnect_toplevel();

            const toplevel = this.get_toplevel();

            if (!(toplevel instanceof Gtk.Window))
                return;

            const toplevel_handler = toplevel.connect(
                'keys-changed',
                this.update_tab_switch_shortcuts.bind(this)
            );

            this.disconnect_toplevel = () => {
                toplevel.disconnect(toplevel_handler);
                this.disconnect_toplevel = Function();
            };

            this.update_tab_switch_shortcuts();
        }
    }
);
