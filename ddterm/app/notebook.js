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

const { GLib, GObject, Gio, Gtk, Pango, Vte } = imports.gi;
const { resources, terminalpage, terminalsettings } = imports.ddterm.app;
const { translations } = imports.ddterm.util;

var Notebook = GObject.registerClass(
    {
        Properties: {
            'resources': GObject.ParamSpec.object(
                'resources',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                resources.Resources
            ),
            'terminal-settings': GObject.ParamSpec.object(
                'terminal-settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                terminalsettings.TerminalSettings
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
            'current-child': GObject.ParamSpec.object(
                'current-child',
                '',
                '',
                GObject.ParamFlags.READABLE,
                Gtk.Widget
            ),
            'current-title': GObject.ParamSpec.string(
                'current-title',
                '',
                '',
                GObject.ParamFlags.READABLE,
                null
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
            'tab-close-buttons': GObject.ParamSpec.boolean(
                'tab-close-buttons',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                true
            ),
            'tab-show-shortcuts': GObject.ParamSpec.boolean(
                'tab-show-shortcuts',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                true
            ),
            'tab-label-ellipsize-mode': GObject.ParamSpec.enum(
                'tab-label-ellipsize-mode',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                Pango.EllipsizeMode,
                Pango.EllipsizeMode.NONE
            ),
            'new-page-command-type': GObject.ParamSpec.string(
                'new-page-command-type',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                'user-shell'
            ),
            'new-page-custom-command': GObject.ParamSpec.string(
                'new-page-custom-command',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                ''
            ),
            'preserve-working-directory': GObject.ParamSpec.boolean(
                'preserve-working-directory',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                true
            ),
            'show-new-tab-button': GObject.ParamSpec.boolean(
                'show-new-tab-button',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                true
            ),
            'show-new-tab-front-button': GObject.ParamSpec.boolean(
                'show-new-tab-front-button',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                true
            ),
            'show-tab-switch-popup': GObject.ParamSpec.boolean(
                'show-tab-switch-popup',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                true
            ),
        },
    },
    class DDTermNotebook extends Gtk.Notebook {
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

            this.bind_property(
                'show-new-tab-button',
                this.new_tab_button,
                'visible',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
            );

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

            this.bind_property(
                'show-tab-switch-popup',
                this.tab_switch_button,
                'visible',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
            );

            this.set_action_widget(button_box, Gtk.PackType.END);

            this.new_tab_front_button = new Gtk.Button({
                image: Gtk.Image.new_from_icon_name('list-add', Gtk.IconSize.MENU),
                tooltip_text: translations.gettext('New Tab (First)'),
                action_name: 'notebook.new-tab-front',
                relief: Gtk.ReliefStyle.NONE,
                visible: true,
            });
            this.set_action_widget(this.new_tab_front_button, Gtk.PackType.START);

            this.bind_property(
                'show-new-tab-front-button',
                this.new_tab_front_button,
                'visible',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
            );

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
                    this.current_child?.destroy();
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

                    if (current === 0)
                        this.reorder_child(this.current_child, this.get_n_pages() - 1);
                    else
                        this.reorder_child(this.current_child, current - 1);
                },
                'move-tab-next': () => {
                    const current = this.get_current_page();

                    if (current === this.get_n_pages() - 1)
                        this.reorder_child(this.current_child, 0);
                    else
                        this.reorder_child(this.current_child, current + 1);
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

            this.connect('page-added', this.update_tabs_visible.bind(this));
            this.connect('page-removed', this.update_tabs_visible.bind(this));

            this.connect('notify::tab-policy', this.update_tabs_visible.bind(this));
            this.update_tabs_visible();

            this.connect('notify::tab-pos', this.update_tab_pos.bind(this));
            this.update_tab_pos();

            this.connect('notify::tab-expand', this.update_tab_expand.bind(this));
            this.update_tab_expand();

            this._current_child = null;

            this.connect('switch-page', (notebook, page) => {
                this._current_child = page;
                this.notify('current-child');
            });

            this.connect('notify::current-child', () => {
                const child = this.current_child;

                const title_handler = child?.connect('notify::title', () => {
                    this.notify('current-title');
                });

                const disconnect_handler = this.connect('notify::current-child', () => {
                    child.disconnect(title_handler);
                    this.disconnect(disconnect_handler);
                });

                this.notify('current-title');
            });

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

            const bindings = [];

            this.page_disconnect.set(child, () => {
                child.disconnect(new_tab_before_handler);
                child.disconnect(new_tab_after_handler);

                while (bindings.length > 0)
                    bindings.pop().unbind();
            });

            const label = this.get_tab_label(child);

            bindings.push(this.bind_property(
                'tab-label-width',
                label,
                'width-request',
                GObject.BindingFlags.SYNC_CREATE
            ));

            bindings.push(this.bind_property(
                'tab-label-ellipsize-mode',
                label,
                'ellipsize',
                GObject.BindingFlags.SYNC_CREATE
            ));

            bindings.push(this.bind_property(
                'tab-close-buttons',
                label,
                'close-button',
                GObject.BindingFlags.SYNC_CREATE
            ));

            bindings.push(this.bind_property(
                'tab-show-shortcuts',
                label,
                'show-shortcut',
                GObject.BindingFlags.SYNC_CREATE
            ));

            this.update_tab_switch_actions();

            const menu_label = this.get_menu_label(child);
            this.tab_switch_menu_box.add(menu_label);
            this.tab_switch_menu_box.reorder_child(menu_label, page_num);
        }

        on_page_removed(child, page_num) {
            const disconnect = this.page_disconnect.get(child);
            this.page_disconnect.delete(child);

            if (disconnect)
                disconnect();

            this.tab_switch_menu_box.remove(this.tab_switch_menu_box.get_children()[page_num]);
            this.update_tab_switch_actions();
        }

        on_page_reordered(child, page_num) {
            const menu_label = this.get_menu_label(child);
            this.tab_switch_menu_box.reorder_child(menu_label, page_num);
            this.update_tab_switch_actions();
        }

        get_cwd() {
            return this.current_child?.get_cwd() ?? null;
        }

        new_page(position) {
            const cwd = this.preserve_working_directory ? this.get_cwd() : null;

            const page = new terminalpage.TerminalPage({
                resources: this.resources,
                terminal_settings: this.terminal_settings,
                visible: true,
            });

            const index = this.insert_page_menu(page, page.tab_label, page.menu_label, position);
            this.set_current_page(index);
            page.terminal.grab_focus();

            let argv;
            let spawn_flags;

            if (this.new_page_command_type === 'custom-command') {
                let _;
                [_, argv] = GLib.shell_parse_argv(this.new_page_custom_command);

                spawn_flags = GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP;
            } else {
                const shell = Vte.get_user_shell();
                const name = GLib.path_get_basename(shell);

                if (this.new_page_command_type === 'user-shell-login')
                    argv = [shell, `-${name}`];
                else
                    argv = [shell, name];

                spawn_flags = GLib.SpawnFlags.FILE_AND_ARGV_ZERO;

                if (name !== shell)
                    spawn_flags |= GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP;
            }

            page.terminal.spawn_async(
                Vte.PtyFlags.DEFAULT,
                cwd,
                argv,
                null,
                spawn_flags,
                null,
                -1,
                null,
                (terminal_, pid, error) => {
                    if (error)
                        page.terminal.feed(error.message);
                }
            );
        }

        update_tab_switch_actions() {
            let i = 0;

            this.foreach(child => {
                const label = this.get_tab_label(child);
                const menu_label = this.get_menu_label(child);
                const value = GLib.Variant.new_int32(i++);

                menu_label.action_target = label.action_target = value;
                menu_label.action_name = label.action_name = 'notebook.switch-to-tab';
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
            this.current_child?.grab_focus();
        }

        get current_child() {
            return this._current_child;
        }

        get current_title() {
            return this.current_child?.title ?? null;
        }
    }
);
