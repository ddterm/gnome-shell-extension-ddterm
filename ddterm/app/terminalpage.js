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

const { GLib, GObject, Gio, Gdk, Gtk, Pango, Vte } = imports.gi;
const { pcre2, search, tablabel, tcgetpgrp, urldetect_patterns } = imports.ddterm.app;
const { translations } = imports.ddterm.util;

function parse_rgba(str) {
    if (str) {
        const rgba = new Gdk.RGBA();

        if (rgba.parse(str))
            return rgba;
    }

    throw Error(`Cannot parse ${JSON.stringify(str)} as color`);
}

function jit_regex(regex) {
    try {
        regex.jit(pcre2.PCRE2_JIT_COMPLETE);
    } catch (ex) {
        logError(ex, `Can't JIT compile ${regex} (PCRE2_JIT_COMPLETE)`);
        return;
    }

    try {
        regex.jit(pcre2.PCRE2_JIT_PARTIAL_SOFT);
    } catch (ex) {
        logError(ex, `Can't JIT compile ${regex} (PCRE2_JIT_PARTIAL_SOFT)`);
    }
}

const BASE_REGEX_FLAGS =
    pcre2.PCRE2_UTF | pcre2.PCRE2_NO_UTF_CHECK | pcre2.PCRE2_UCP | pcre2.PCRE2_MULTILINE;

function compile_regex(regex) {
    const compiled = Vte.Regex.new_for_match(regex, -1, BASE_REGEX_FLAGS);
    jit_regex(compiled);
    return compiled;
}

const URL_REGEX = {
    'detect-urls-as-is': {
        regex: compile_regex(urldetect_patterns.REGEX_URL_AS_IS),
    },
    'detect-urls-file': {
        regex: compile_regex(urldetect_patterns.REGEX_URL_FILE),
    },
    'detect-urls-http': {
        regex: compile_regex(urldetect_patterns.REGEX_URL_HTTP),
        prefix: 'http://',
    },
    'detect-urls-voip': {
        regex: compile_regex(urldetect_patterns.REGEX_URL_VOIP),
    },
    'detect-urls-email': {
        regex: compile_regex(urldetect_patterns.REGEX_EMAIL),
        prefix: 'mailto:',
    },
    'detect-urls-news-man': {
        regex: compile_regex(urldetect_patterns.REGEX_NEWS_MAN),
    },
};

var TerminalPage = GObject.registerClass(
    {
        Properties: {
            'settings': GObject.ParamSpec.object(
                'settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.Settings
            ),
            'menus': GObject.ParamSpec.object(
                'menus',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gtk.Builder
            ),
            'desktop-settings': GObject.ParamSpec.object(
                'desktop-settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.Settings
            ),
            'clicked-hyperlink': GObject.ParamSpec.string(
                'clicked-hyperlink',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                null
            ),
            'clicked-filename': GObject.ParamSpec.string(
                'clicked-filename',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                null
            ),
        },
        Signals: {
            'new-tab-before-request': {},
            'new-tab-after-request': {},
        },
    },
    class TerminalPage extends Gtk.Box {
        _init(params) {
            super._init(params);

            this.clipboard = Gtk.Clipboard.get_default(Gdk.Display.get_default());
            this.primary_selection = Gtk.Clipboard.get(Gdk.Atom.intern('PRIMARY', true));
            this.child_pid = null;

            const terminal_with_scrollbar = new Gtk.Box({
                visible: true,
                orientation: Gtk.Orientation.HORIZONTAL,
            });

            this.terminal = new Vte.Terminal({ visible: true });
            terminal_with_scrollbar.pack_start(this.terminal, true, true, 0);

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

            this.terminal.bind_property(
                'window-title',
                this.tab_label,
                'label',
                GObject.BindingFlags.SYNC_CREATE
            );

            this.settings.bind(
                'tab-label-ellipsize-mode',
                this.tab_label,
                'ellipsize',
                Gio.SettingsBindFlags.GET
            );

            this.settings.bind(
                'tab-close-buttons',
                this.tab_label,
                'close-button',
                Gio.SettingsBindFlags.GET
            );

            this.settings.bind(
                'tab-show-shortcuts',
                this.tab_label,
                'show-shortcut',
                Gio.SettingsBindFlags.GET
            );

            [
                'scroll-on-output',
                'scroll-on-keystroke',
                'allow-hyperlink',
                'audible-bell',
                'bold-is-bright',
                'pointer-autohide',
                'text-blink-mode',
                'cursor-blink-mode',
                'cursor-shape',
                'backspace-binding',
                'delete-binding',
            ].forEach(key => {
                this.settings.bind(key, this.terminal, key, Gio.SettingsBindFlags.GET);
            });

            this.map_settings(['cjk-utf8-ambiguous-width'], () => {
                this.terminal.cjk_ambiguous_width =
                    this.settings.get_enum('cjk-utf8-ambiguous-width');
            });

            this.map_settings(['scrollback-lines', 'scrollback-unlimited'], () => {
                this.terminal.scrollback_lines =
                    this.settings.get_boolean('scrollback-unlimited')
                        ? -1 : this.settings.get_int('scrollback-lines');
            });

            this.map_settings(['custom-font', 'use-system-font'], this.update_font.bind(this));
            const system_font_handler = this.desktop_settings.connect(
                'changed::monospace-font-name',
                this.update_font.bind(this)
            );
            this.connect('destroy', () => this.desktop_settings.disconnect(system_font_handler));

            this.map_settings(
                [
                    'use-theme-colors',
                    'foreground-color',
                    'background-color',
                    'transparent-background',
                    'background-opacity',
                    'palette',
                ],
                this.update_colors.bind(this)
            );
            this.terminal.connect('style-updated', this.update_colors.bind(this));

            this.map_settings(['use-theme-colors', 'bold-color-same-as-fg', 'bold-color'], () => {
                if (this.settings.get_boolean('use-theme-colors') ||
                    this.settings.get_boolean('bold-color-same-as-fg')) {
                    this.terminal.set_color_bold(null);
                } else {
                    this.terminal.set_color_bold(
                        parse_rgba(this.settings.get_string('bold-color'))
                    );
                }
            });

            this.map_color(
                'cursor-colors-set',
                'cursor-background-color',
                color => this.terminal.set_color_cursor(color)
            );

            this.map_color(
                'cursor-colors-set',
                'cursor-foreground-color',
                color => this.terminal.set_color_cursor_foreground(color)
            );

            this.map_color(
                'highlight-colors-set',
                'highlight-background-color',
                color => this.terminal.set_color_highlight(color)
            );

            this.map_color(
                'highlight-colors-set',
                'highlight-foreground-color',
                color => this.terminal.set_color_highlight_foreground(color)
            );

            this.map_settings(
                [
                    'detect-urls',
                    ...Object.keys(URL_REGEX),
                ],
                this.update_url_regex.bind(this)
            );

            this.settings.bind(
                'show-scrollbar',
                this.scrollbar,
                'visible',
                Gio.SettingsBindFlags.GET
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
                enabled: this.clicked_hyperlink !== null,
            });
            open_hyperlink_action.connect('activate', this.open_hyperlink.bind(this));
            terminal_actions.add_action(open_hyperlink_action);

            const copy_hyperlink_action = new Gio.SimpleAction({
                name: 'copy-hyperlink',
                enabled: this.clicked_hyperlink !== null,
            });
            copy_hyperlink_action.connect('activate', this.copy_hyperlink.bind(this));
            terminal_actions.add_action(copy_hyperlink_action);

            this.connect('notify::clicked-hyperlink', () => {
                open_hyperlink_action.enabled = this.clicked_hyperlink !== null;
                copy_hyperlink_action.enabled = this.clicked_hyperlink !== null;
            });

            const copy_filename_action = new Gio.SimpleAction({
                name: 'copy-filename',
                enabled: this.clicked_filename !== null,
            });
            copy_filename_action.connect('activate', this.copy_filename.bind(this));
            terminal_actions.add_action(copy_filename_action);

            this.connect('notify::clicked-filename', () => {
                copy_filename_action.enabled = this.clicked_filename !== null;
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

        map_settings(keys, func) {
            keys.forEach(key => {
                const handler = this.settings.connect(`changed::${key}`, func);
                this.connect('destroy', () => this.settings.disconnect(handler));
            });

            func();
        }

        map_color(enable_key, key, func) {
            this.map_settings(['use-theme-colors', enable_key, key], () => {
                if (this.settings.get_boolean('use-theme-colors') ||
                    !this.settings.get_boolean(enable_key))
                    func(null);

                else
                    func(parse_rgba(this.settings.get_string(key)));
            });
        }

        update_font() {
            this.terminal.font_desc = Pango.FontDescription.from_string(
                this.settings.get_boolean('use-system-font')
                    ? this.desktop_settings.get_string('monospace-font-name')
                    : this.settings.get_string('custom-font')
            );
        }

        update_colors() {
            let foreground, background;

            if (this.settings.get_boolean('use-theme-colors')) {
                const style = this.terminal.get_style_context();
                const state = style.get_state();

                foreground = style.get_property('color', state);
                background = style.get_property('background-color', state);
            } else {
                foreground = parse_rgba(this.settings.get_string('foreground-color'));
                background = parse_rgba(this.settings.get_string('background-color'));
            }

            if (this.settings.get_boolean('transparent-background'))
                background.alpha *= this.settings.get_double('background-opacity');

            const palette = this.settings.get_strv('palette').map(parse_rgba);
            this.terminal.set_colors(foreground, background, palette);
        }

        update_url_regex() {
            this.terminal.match_remove_all();
            this.url_prefix = [];

            if (!this.settings.get_boolean('detect-urls'))
                return;

            for (const [key, { regex, prefix }] of Object.entries(URL_REGEX)) {
                if (!this.settings.get_boolean(key))
                    continue;

                const tag = this.terminal.match_add_regex(regex, 0);
                this.terminal.match_set_cursor_name(tag, 'pointer');
                this.url_prefix[tag] = prefix;
            }
        }

        get_cwd() {
            const uri = this.terminal.current_directory_uri;
            if (uri)
                return GLib.filename_from_uri(uri)[0];

            try {
                return GLib.file_read_link(`/proc/${this.child_pid}/cwd`);
            } catch {
                return null;
            }
        }

        spawn(cwd = null) {
            let argv;
            let spawn_flags;
            const command_type = this.settings.get_string('command');

            if (command_type === 'custom-command') {
                const command = this.settings.get_string('custom-command');

                let _;
                [_, argv] = GLib.shell_parse_argv(command);

                spawn_flags = GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP;
            } else {
                const shell = Vte.get_user_shell();
                const name = GLib.path_get_basename(shell);

                if (command_type === 'user-shell-login')
                    argv = [shell, `-${name}`];
                else
                    argv = [shell, name];

                spawn_flags = GLib.SpawnFlags.FILE_AND_ARGV_ZERO;

                if (name !== shell)
                    spawn_flags |= GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP;
            }

            this.terminal.spawn_async(
                Vte.PtyFlags.DEFAULT,
                cwd,
                argv,
                null,
                spawn_flags,
                null,
                -1,
                null,
                (terminal, pid, error) => {
                    if (error)
                        terminal.feed(error.message);

                    if (pid)
                        this.child_pid = pid;
                }
            );
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
                this.clicked_hyperlink,
                Gdk.CURRENT_TIME
            );
        }

        copy_hyperlink() {
            this.clipboard.set_text(this.clicked_hyperlink, -1);
        }

        copy_filename() {
            this.clipboard.set_text(this.clicked_filename, -1);
        }

        terminal_button_press_early(_terminal, event) {
            const state = event.get_state()[1];
            const button = event.get_button()[1];

            let clicked_hyperlink = this.terminal.hyperlink_check_event(event);

            if (!clicked_hyperlink) {
                const [url, tag] = this.terminal.match_check_event(event);
                if (url && tag !== null) {
                    const prefix = this.url_prefix[tag];
                    if (prefix && !url.toLowerCase().startsWith(prefix))
                        clicked_hyperlink = prefix + url;
                    else
                        clicked_hyperlink = url;
                }
            }

            let clicked_filename = null;

            if (clicked_hyperlink) {
                try {
                    clicked_filename = GLib.filename_from_uri(clicked_hyperlink)[0];
                } catch {
                }
            }

            this.clicked_filename = clicked_filename;
            this.clicked_hyperlink = clicked_hyperlink;

            if (state & Gdk.ModifierType.CONTROL_MASK) {
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
            const menu = Gtk.Menu.new_from_model(this.menus.get_object(menu_name));
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

        has_foreground_process() {
            const pty = this.terminal.get_pty();

            if (!pty)
                return false;

            try {
                return tcgetpgrp.tcgetpgrp(pty.get_fd()) !== this.child_pid;
            } catch (ex) {
                if (!(ex instanceof tcgetpgrp.InterpreterNotFoundError))
                    logError(ex, "Can't check foreground process group");

                return false;
            }
        }

        close() {
            if (!this.has_foreground_process()) {
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
    }
);
