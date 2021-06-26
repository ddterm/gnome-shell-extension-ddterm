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
const { util } = imports;
const ByteArray = imports.byteArray;

const EXTENSION_DBUS_XML = ByteArray.toString(
    util.APP_DATA_DIR.get_child('com.github.amezin.ddterm.Extension.xml').load_contents(null)[1]
);

var ExtensionDBusProxy = Gio.DBusProxy.makeProxyWrapper(EXTENSION_DBUS_XML);

var AppWindow = GObject.registerClass(
    {
        Template: util.APP_DATA_DIR.get_child('appwindow.ui').get_uri(),
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
                'menus', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gtk.Builder
            ),
            'settings': GObject.ParamSpec.object(
                'settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings
            ),
            'desktop-settings': GObject.ParamSpec.object(
                'desktop-settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings
            ),
        },
    },
    class AppWindow extends Gtk.ApplicationWindow {
        _init(params) {
            super._init(params);

            this.extension_dbus = new ExtensionDBusProxy(
                Gio.DBus.session, 'org.gnome.Shell', '/org/gnome/Shell/Extensions/ddterm'
            );

            this.method_handler(this, 'screen-changed', this.setup_rgba_visual);
            this.setup_rgba_visual();

            this.draw_handler_id = null;
            this.run_on_destroy(() => {
                if (this.draw_handler_id)
                    this.disconnect(this.draw_handler_id);
            });

            this.method_handler(this.settings, 'changed::background-opacity', this.update_app_paintable);
            this.method_handler(this.settings, 'changed::transparent-background', this.update_app_paintable);
            this.update_app_paintable();

            this.method_handler(this.notebook, 'page-removed', this.close_if_no_pages);

            this.toggle_action = this.simple_action('toggle', this.toggle.bind(this));
            this.hide_action = this.simple_action('hide', () => this.hide());

            this.simple_action('new-tab', this.insert_page.bind(this, -1));
            this.simple_action('new-tab-front', this.insert_page.bind(this, 0));

            this.simple_action('new-tab-before-current', () => {
                this.insert_page(this.notebook.get_current_page());
            });
            this.simple_action('new-tab-after-current', () => {
                this.insert_page(this.notebook.get_current_page() + 1);
            });

            this.method_handler(this.top_resize_box, 'realize', this.set_resize_cursor_ns);
            this.method_handler(this.bottom_resize_box, 'realize', this.set_resize_cursor_ns);
            this.method_handler(this.left_resize_box, 'realize', this.set_resize_cursor_ew);
            this.method_handler(this.right_resize_box, 'realize', this.set_resize_cursor_ew);

            this.method_handler(this.top_resize_box, 'button-press-event', this.start_resizing);
            this.method_handler(this.bottom_resize_box, 'button-press-event', this.start_resizing);
            this.method_handler(this.left_resize_box, 'button-press-event', this.start_resizing);
            this.method_handler(this.right_resize_box, 'button-press-event', this.start_resizing);

            this.method_handler(this.settings, 'changed::window-resizable', this.update_resize_boxes);
            this.method_handler(this.settings, 'changed::window-position', this.update_resize_boxes);
            this.update_resize_boxes();

            this.tab_select_action = new Gio.PropertyAction({
                name: 'switch-to-tab',
                object: this.notebook,
                property_name: 'page',
            });
            this.add_action(this.tab_select_action);

            this.simple_action('next-tab', () => {
                const current = this.notebook.get_current_page();

                if (current === this.notebook.get_n_pages() - 1)
                    this.notebook.set_current_page(0);
                else
                    this.notebook.set_current_page(current + 1);
            });
            this.simple_action('prev-tab', () => {
                const current = this.notebook.get_current_page();

                if (current === 0)
                    this.notebook.set_current_page(this.notebook.get_n_pages() - 1);
                else
                    this.notebook.set_current_page(current - 1);
            });

            this.bind_settings_ro('new-tab-button', this.new_tab_button, 'visible');
            this.bind_settings_ro('new-tab-front-button', this.new_tab_front_button, 'visible');
            this.bind_settings_ro('tab-switcher-popup', this.tab_switch_button, 'visible');

            this.method_handler(this.settings, 'changed::tab-policy', this.update_tab_bar_visibility);
            this.method_handler(this.notebook, 'page-added', this.update_tab_bar_visibility);
            this.method_handler(this.notebook, 'page-removed', this.update_tab_bar_visibility);

            this.method_handler(this.settings, 'changed::tab-position', this.update_tab_bar_position);
            this.update_tab_bar_position();

            this.method_handler(this.notebook, 'page-added', this.update_tab_shortcut_labels);
            this.method_handler(this.notebook, 'page-removed', this.update_tab_shortcut_labels);
            this.method_handler(this.notebook, 'page-reordered', this.update_tab_shortcut_labels);
            this.method_handler(this, 'keys-changed', this.update_tab_shortcut_labels);

            this.method_handler(this.settings, 'changed::tab-expand', this.update_tab_expand);

            this.method_handler(this.notebook, 'page-added', this.tab_switcher_add);
            this.method_handler(this.notebook, 'page-removed', this.tab_switcher_remove);
            this.method_handler(this.notebook, 'page-reordered', this.tab_switcher_reorder);

            this.method_handler(this.settings, 'changed::window-type-hint', this.update_hints);
            this.method_handler(this.settings, 'changed::window-skip-taskbar', this.update_hints);
            this.update_hints();

            this.suppress_delete_id = this.connect('delete-event', () => {
                this.hide();
                return true;
            });
            this.run_on_destroy(() => {
                if (this.suppress_delete_id) {
                    this.disconnect(this.suppress_delete_id);
                    this.suppress_delete_id = null;
                }
            });

            this.insert_page(0);
        }

        simple_action(name, func) {
            const action = new Gio.SimpleAction({
                name,
            });
            this.signal_connect(action, 'activate', func);
            this.add_action(action);
            return action;
        }

        update_tab_bar_visibility() {
            const policy = this.settings.get_string('tab-policy');
            if (policy === 'always')
                this.notebook.show_tabs = true;
            else if (policy === 'never')
                this.notebook.show_tabs = false;
            else if (policy === 'automatic')
                this.notebook.show_tabs = this.notebook.get_n_pages() > 1;
        }

        update_tab_bar_position() {
            const position = this.settings.get_string('tab-position');
            if (position === 'top') {
                this.notebook.tab_pos = Gtk.PositionType.TOP;
                this.tab_switch_button.direction = Gtk.ArrowType.DOWN;
            } else if (position === 'bottom') {
                this.notebook.tab_pos = Gtk.PositionType.BOTTOM;
                this.tab_switch_button.direction = Gtk.ArrowType.UP;
            } else if (position === 'left') {
                this.notebook.tab_pos = Gtk.PositionType.LEFT;
                this.tab_switch_button.direction = Gtk.ArrowType.RIGHT;
            } else if (position === 'right') {
                this.notebook.tab_pos = Gtk.PositionType.RIGHT;
                this.tab_switch_button.direction = Gtk.ArrowType.LEFT;
            }
        }

        update_tab_expand() {
            for (let i = 0; i < this.notebook.get_n_pages(); i++)
                this.notebook.child_set_property(this.notebook.get_nth_page(i), 'tab-expand', this.settings.get_boolean('tab-expand'));
        }

        update_tab_shortcut_labels(_source, _child = null, start_page = 0) {
            for (let i = start_page; i < this.notebook.get_n_pages(); i++) {
                const shortcuts = this.application.get_accels_for_action(`win.switch-to-tab(${i})`);
                const shortcut = shortcuts && shortcuts.length > 0 ? shortcuts[0] : null;
                this.notebook.get_nth_page(i).switch_shortcut = shortcut;
            }
        }

        toggle() {
            if (this.visible)
                this.hide();
            else
                this.show();
        }

        insert_page(position) {
            const current_page = this.notebook.get_nth_page(this.notebook.get_current_page());
            const cwd = current_page === null ? null : current_page.get_cwd();

            const page = new imports.terminalpage.TerminalPage({
                settings: this.settings,
                menus: this.menus,
                desktop_settings: this.desktop_settings,
            });

            const index = this.notebook.insert_page(page, page.tab_label, position);
            this.notebook.set_current_page(index);
            this.notebook.set_tab_reorderable(page, true);
            this.notebook.child_set_property(page, 'tab-expand', this.settings.get_boolean('tab-expand'));

            this.method_handler(page, 'close-request', this.remove_page);
            this.method_handler(page, 'new-tab-before-request', this.new_tab_before);
            this.method_handler(page, 'new-tab-after-request', this.new_tab_after);
            page.spawn(this.settings.get_boolean('preserve-working-directory') ? cwd : null);

            page.terminal.grab_focus();
        }

        setup_rgba_visual() {
            const visual = this.screen.get_rgba_visual();
            if (visual)
                this.set_visual(visual);
        }

        update_app_paintable() {
            this.app_paintable = this.settings.get_boolean('transparent-background') &&
                                 this.settings.get_double('background-opacity') < 1.0;

            if (this.app_paintable) {
                if (this.draw_handler_id === null)
                    this.draw_handler_id = this.connect('draw', this.draw.bind(this));
            } else if (this.draw_handler_id !== null) {
                this.disconnect(this.draw_handler_id);
                this.draw_handler_id = null;
            }
        }

        remove_page(page) {
            this.notebook.remove(page);
            page.destroy();
        }

        close() {
            if (this.suppress_delete_id) {
                this.disconnect(this.suppress_delete_id);
                this.suppress_delete_id = null;
            }

            super.close();
        }

        close_if_no_pages() {
            if (this.notebook.get_n_pages() === 0)
                this.close();
        }

        set_resize_cursor_ns(widget) {
            widget.window.cursor = Gdk.Cursor.new_from_name(widget.get_display(), 'ns-resize');
        }

        set_resize_cursor_ew(widget) {
            widget.window.cursor = Gdk.Cursor.new_from_name(widget.get_display(), 'ew-resize');
        }

        update_resize_boxes() {
            const resizable = this.settings.get_boolean('window-resizable');
            const position = this.settings.get_string('window-position');

            this.bottom_resize_box.visible = resizable && (position === 'top');
            this.top_resize_box.visible = resizable && (position === 'bottom');
            this.right_resize_box.visible = resizable && (position === 'left');
            this.left_resize_box.visible = resizable && (position === 'right');
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

            if (edge === Gdk.WindowEdge.NORTH || edge === Gdk.WindowEdge.SOUTH)
                this.extension_dbus.BeginResizeVerticalSync();

            else if (edge === Gdk.WindowEdge.EAST || edge === Gdk.WindowEdge.WEST)
                this.extension_dbus.BeginResizeHorizontalSync();

            const [coords_ok, x_root, y_root] = event.get_root_coords();
            if (!coords_ok)
                return;

            this.window.begin_resize_drag_for_device(edge, event.get_device(), button, x_root, y_root, event.get_time());
        }

        draw(_widget, cr) {
            try {
                if (!this.app_paintable)
                    return false;

                if (!Gtk.cairo_should_draw_window(cr, this.window))
                    return false;

                const context = this.get_style_context();
                const allocation = this.get_child().get_allocation();
                Gtk.render_background(context, cr, allocation.x, allocation.y, allocation.width, allocation.height);
                Gtk.render_frame(context, cr, allocation.x, allocation.y, allocation.width, allocation.height);
            } finally {
                cr.$dispose();
            }

            return false;
        }

        tab_switcher_add(_notebook, child, page_num) {
            child.switcher_item.action_target = GLib.Variant.new_int32(page_num);
            this.tab_switch_menu_box.add(child.switcher_item);
            this.tab_switch_menu_box.reorder_child(child.switcher_item, page_num);
            this.tab_switcher_update_actions(page_num + 1);
        }

        tab_switcher_remove(_notebook, child, page_num) {
            this.tab_switch_menu_box.remove(child.switcher_item);
            this.tab_switcher_update_actions(page_num);
        }

        tab_switcher_reorder(_notebook, child, page_num) {
            this.tab_switch_menu_box.reorder_child(child.switcher_item, page_num);
            this.tab_switcher_update_actions(page_num);
        }

        tab_switcher_update_actions(start_page_num) {
            const items = this.tab_switch_menu_box.get_children();
            for (let i = start_page_num; i < items.length; i++)
                items[i].action_target = GLib.Variant.new_int32(i);
        }

        update_hints() {
            this.type_hint = util.enum_from_settings(
                this.settings.get_string('window-type-hint'),
                Gdk.WindowTypeHint
            );
            // skip_taskbar_hint only works with type_hint == Gdk.WindowTypeHint.Normal
            this.skip_taskbar_hint = this.settings.get_boolean('window-skip-taskbar');
            this.skip_pager_hint = this.settings.get_boolean('window-skip-taskbar');
        }

        new_tab_before(page) {
            const index = this.notebook.page_num(page);
            this.insert_page(index);
        }

        new_tab_after(page) {
            const index = this.notebook.page_num(page);
            this.insert_page(index + 1);
        }
    }
);

Object.assign(AppWindow.prototype, util.UtilMixin);
