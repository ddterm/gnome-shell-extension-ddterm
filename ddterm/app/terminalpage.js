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

/* exported TerminalPage TerminalSettings */

const { GLib, GObject, Gio, Gdk, Gtk, Vte } = imports.gi;
const { resources, search, tablabel, terminal, terminalsettings } = imports.ddterm.app;
const { translations } = imports.ddterm.util;

var TerminalPage = GObject.registerClass(
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
            'title': GObject.ParamSpec.string(
                'title',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                ''
            ),
        },
        Signals: {
            'new-tab-before-request': {},
            'new-tab-after-request': {},
        },
    },
    class DDTermTerminalPage extends Gtk.Box {
        _init(params) {
            super._init(params);

            this.clipboard = Gtk.Clipboard.get_default(Gdk.Display.get_default());
            this.primary_selection = Gtk.Clipboard.get(Gdk.Atom.intern('PRIMARY', true));

            const terminal_with_scrollbar = new Gtk.Box({
                visible: true,
                orientation: Gtk.Orientation.HORIZONTAL,
            });

            this.terminal = new terminal.Terminal({ visible: true });
            terminal_with_scrollbar.pack_start(this.terminal, true, true, 0);

            this.terminal_settings.bind_terminal(this.terminal);

            this.scrollbar = new Gtk.Scrollbar({
                orientation: Gtk.Orientation.VERTICAL,
                adjustment: this.terminal.vadjustment,
                visible: true,
            });

            terminal_with_scrollbar.pack_end(this.scrollbar, false, false, 0);

            this.orientation = Gtk.Orientation.VERTICAL;
            this.pack_start(terminal_with_scrollbar, true, true, 0);

            this.search_bar = new search.SearchBar({
                visible: true,
            });

            this.pack_end(this.search_bar, false, false, 0);

            this.search_bar.connect('find-next', this.find_next.bind(this));
            this.search_bar.connect('find-prev', this.find_prev.bind(this));

            this.search_bar.connect('notify::wrap', () => {
                this.terminal.search_set_wrap_around(this.search_bar.wrap);
            });

            this.terminal.search_set_wrap_around(this.search_bar.wrap);

            this.search_bar.connect('notify::reveal-child', () => {
                if (!this.search_bar.reveal_child)
                    this.terminal.grab_focus();
            });

            this.tab_label = new tablabel.TabLabel({ visible_window: false });
            this.tab_label.connect('close', () => this.close());

            this.bind_property(
                'title',
                this.tab_label,
                'label',
                GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
            );

            this.menu_label = new Gtk.ModelButton({ visible: true });

            this.terminal.bind_property(
                'window-title',
                this.menu_label,
                'text',
                GObject.BindingFlags.SYNC_CREATE
            );

            this.terminal_settings.bind_property(
                'show-scrollbar',
                this.scrollbar,
                'visible',
                GObject.BindingFlags.SYNC_CREATE
            );

            // Should be connected before setup_popup_menu() on this.terminal!
            this.terminal.connect(
                'button-press-event',
                this.terminal_button_press_early.bind(this)
            );

            this.terminal_popup_menu = this.setup_popup_menu(this.terminal, 'terminal-popup');
            this.setup_popup_menu(this.tab_label, 'tab-popup');

            const page_actions = new Gio.SimpleActionGroup();

            const close_action = new Gio.SimpleAction({ name: 'close' });
            close_action.connect('activate', () => this.close());
            page_actions.add_action(close_action);

            const new_tab_before_action = new Gio.SimpleAction({ name: 'new-tab-before' });
            new_tab_before_action.connect('activate', () => this.emit('new-tab-before-request'));
            page_actions.add_action(new_tab_before_action);

            const new_tab_after_action = new Gio.SimpleAction({ name: 'new-tab-after' });
            new_tab_after_action.connect('activate', () => this.emit('new-tab-after-request'));
            page_actions.add_action(new_tab_after_action);

            this.use_custom_title_action = new Gio.SimpleAction({
                'name': 'use-custom-title',
                'state': GLib.Variant.new_boolean(false),
                'parameter-type': GLib.VariantType.new('b'),
            });
            this.use_custom_title_action.connect('activate', (_, param) => {
                this.use_custom_title_action.change_state(param);

                if (param.get_boolean())
                    this.tab_label.edit();
            });
            this._title_binding = null;
            this.use_custom_title_action.connect('notify::state', () => {
                this.update_title_binding();
            });
            this.update_title_binding();
            page_actions.add_action(this.use_custom_title_action);

            this.insert_action_group('page', page_actions);
            this.tab_label.insert_action_group('page', page_actions);

            const terminal_actions = new Gio.SimpleActionGroup();

            const copy_action = new Gio.SimpleAction({
                name: 'copy',
                enabled: this.terminal.get_has_selection(),
            });
            copy_action.connect('activate', this.copy.bind(this));
            terminal_actions.add_action(copy_action);

            const copy_html_action = new Gio.SimpleAction({
                name: 'copy-html',
                enabled: this.terminal.get_has_selection(),
            });
            copy_html_action.connect('activate', this.copy_html.bind(this));
            terminal_actions.add_action(copy_html_action);

            this.terminal.connect('selection-changed', () => {
                copy_action.enabled = this.terminal.get_has_selection();
                copy_html_action.enabled = this.terminal.get_has_selection();
            });

            const open_hyperlink_action = new Gio.SimpleAction({
                name: 'open-hyperlink',
                enabled: this.terminal.last_clicked_hyperlink !== null,
            });
            open_hyperlink_action.connect('activate', this.open_hyperlink.bind(this));
            terminal_actions.add_action(open_hyperlink_action);

            const copy_hyperlink_action = new Gio.SimpleAction({
                name: 'copy-hyperlink',
                enabled: this.terminal.last_clicked_hyperlink !== null,
            });
            copy_hyperlink_action.connect('activate', this.copy_hyperlink.bind(this));
            terminal_actions.add_action(copy_hyperlink_action);

            this.terminal.connect('notify::last-clicked-hyperlink', () => {
                const enable = this.terminal.last_clicked_hyperlink !== null;
                open_hyperlink_action.enabled = enable;
                copy_hyperlink_action.enabled = enable;
            });

            const copy_filename_action = new Gio.SimpleAction({
                name: 'copy-filename',
                enabled: this.terminal.last_clicked_filename !== null,
            });
            copy_filename_action.connect('activate', this.copy_filename.bind(this));
            terminal_actions.add_action(copy_filename_action);

            this.terminal.connect('notify::last-clicked-filename', () => {
                const enable = this.terminal.last_clicked_filename !== null;
                copy_filename_action.enabled = enable;
            });

            const paste_action = new Gio.SimpleAction({ name: 'paste' });
            paste_action.connect('activate', this.paste.bind(this));
            terminal_actions.add_action(paste_action);

            const select_all_action = new Gio.SimpleAction({ name: 'select-all' });
            select_all_action.connect('activate', this.select_all.bind(this));
            terminal_actions.add_action(select_all_action);

            const reset_action = new Gio.SimpleAction({ name: 'reset' });
            reset_action.connect('activate', this.reset.bind(this));
            terminal_actions.add_action(reset_action);

            const reset_and_clear_action = new Gio.SimpleAction({ name: 'reset-and-clear' });
            reset_and_clear_action.connect('activate', this.reset_and_clear.bind(this));
            terminal_actions.add_action(reset_and_clear_action);

            const find_action = new Gio.SimpleAction({ name: 'find' });
            find_action.connect('activate', this.find.bind(this));
            terminal_actions.add_action(find_action);

            const find_next_action = new Gio.SimpleAction({ name: 'find-next' });
            find_next_action.connect('activate', this.find_next.bind(this));
            terminal_actions.add_action(find_next_action);

            const find_prev_action = new Gio.SimpleAction({ name: 'find-prev' });
            find_prev_action.connect('activate', this.find_prev.bind(this));
            terminal_actions.add_action(find_prev_action);

            [
                find_next_action,
                find_prev_action,
            ].forEach(action => this.search_bar.bind_property(
                'reveal-child',
                action,
                'enabled',
                GObject.BindingFlags.SYNC_CREATE
            ));

            this.insert_action_group('terminal', terminal_actions);

            this.terminal.connect('child-exited', () => this.destroy());

            this.connect('destroy', () => this.tab_label.destroy());
        }

        get_cwd() {
            return this.terminal.get_cwd();
        }

        copy() {
            this.terminal.copy_clipboard_format(Vte.Format.TEXT);
        }

        copy_html() {
            this.terminal.copy_clipboard_format(Vte.Format.HTML);
        }

        paste() {
            this.terminal.paste_clipboard();
        }

        select_all() {
            this.terminal.select_all();
        }

        reset() {
            this.terminal.reset(true, false);
        }

        reset_and_clear() {
            this.terminal.reset(true, true);
        }

        open_hyperlink() {
            Gtk.show_uri_on_window(
                this.get_ancestor(Gtk.Window),
                this.terminal.last_clicked_hyperlink,
                Gdk.CURRENT_TIME
            );
        }

        copy_hyperlink() {
            this.clipboard.set_text(this.terminal.last_clicked_hyperlink, -1);
        }

        copy_filename() {
            this.clipboard.set_text(this.terminal.last_clicked_filename, -1);
        }

        terminal_button_press_early(_terminal, event) {
            const state = event.get_state()[1];

            if (state & Gdk.ModifierType.CONTROL_MASK) {
                const button = event.get_button()[1];

                if ([Gdk.BUTTON_PRIMARY, Gdk.BUTTON_MIDDLE].includes(button)) {
                    this.open_hyperlink();
                    return true;
                }
            }

            if (event.triggers_context_menu()) {
                if (state & Gdk.ModifierType.SHIFT_MASK) {
                    if (!(state & (Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.MOD1_MASK))) {
                        this.terminal_popup_menu.popup_at_pointer(event);
                        return true;
                    }
                }
            }

            return false;
        }

        setup_popup_menu(
            widget,
            menu_name,
            widget_anchor = Gdk.Gravity.SOUTH,
            menu_anchor = Gdk.Gravity.SOUTH
        ) {
            const menu = Gtk.Menu.new_from_model(this.resources.menus.get_object(menu_name));
            menu.attach_widget = widget;

            // https://github.com/ddterm/gnome-shell-extension-ddterm/issues/116
            menu.get_style_context().add_class(Gtk.STYLE_CLASS_CONTEXT_MENU);

            widget.connect_after('button-press-event', (_, event) => {
                if (!event.triggers_context_menu())
                    return false;

                menu.popup_at_pointer(event);
                return true;
            });

            widget.connect('popup-menu', () => {
                menu.popup_at_widget(widget, widget_anchor, menu_anchor, null);
                return true;
            });

            return menu;
        }

        find_next() {
            this.terminal.search_set_regex(this.search_bar.pattern.regex, 0);
            this.terminal.search_find_next();
        }

        find_prev() {
            this.terminal.search_set_regex(this.search_bar.pattern.regex, 0);
            this.terminal.search_find_previous();
        }

        find() {
            if (this.terminal.get_has_selection()) {
                this.terminal.copy_primary();

                this.primary_selection.request_text((_, text) => {
                    if (text)
                        this.search_bar.text = text;
                });
            }

            this.search_bar.reveal_child = true;
        }

        close() {
            if (!this.terminal.has_foreground_process()) {
                this.destroy();
                return;
            }

            const message = new Gtk.MessageDialog({
                transient_for: this.get_toplevel(),
                modal: true,
                buttons: Gtk.ButtonsType.YES_NO,
                message_type: Gtk.MessageType.QUESTION,
                text: translations.gettext('Close this terminal?'),
                secondary_text: translations.gettext(
                    // eslint-disable-next-line max-len
                    'There is still a process running in this terminal. Closing the terminal will kill it.'
                ),
            });

            message.connect('response', (_, response_id) => {
                if (response_id === Gtk.ResponseType.YES)
                    this.destroy();

                message.destroy();
            });

            message.show();
        }

        update_title_binding() {
            const state = this.use_custom_title_action.state.get_boolean();

            if (state === !this._title_binding)
                return;

            if (state) {
                this._title_binding?.unbind();
                this._title_binding = null;
            } else {
                this._title_binding = this.terminal.bind_property(
                    'window-title',
                    this,
                    'title',
                    GObject.BindingFlags.SYNC_CREATE
                );
            }
        }
    }
);
