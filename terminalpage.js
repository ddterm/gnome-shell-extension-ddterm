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

/* exported TerminalPage */

const { GLib, GObject, Gio, Pango, Gdk, Gtk, Vte } = imports.gi;
const { Handlebars } = imports.handlebars;
const { util, urldetect_patterns } = imports;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const TITLE_TERMINAL_PROPERTIES = [
    'window-title',
    'icon-title',
    'current-directory-uri',
    'current-file-uri',
    'current-container-name',
    'current-container-runtime',
];

Handlebars.registerHelper('filename-from-uri', uri => {
    if (uri)
        return GLib.filename_from_uri(uri)[0];

    return '';
});

Handlebars.registerHelper('hostname-from-uri', uri => {
    if (uri)
        return GLib.filename_from_uri(uri)[1];

    return '';
});

function ellipsize(str, length) {
    if (str.length > length)
        return `${str.slice(0, length)}…`;

    return str;
}

Handlebars.registerHelper('truncate-chars', ellipsize);
Handlebars.registerHelper('ellipsize', ellipsize);

const PCRE2_UTF = 0x00080000;
const PCRE2_NO_UTF_CHECK = 0x40000000;
const PCRE2_UCP = 0x00020000;
const PCRE2_MULTILINE = 0x00000400;
const PCRE2_JIT_COMPLETE = 0x00000001;
const PCRE2_JIT_PARTIAL_SOFT = 0x00000002;
const PCRE2_CASELESS = 0x00000008;

function jit_regex(regex) {
    try {
        regex.jit(PCRE2_JIT_COMPLETE);
    } catch (ex) {
        logError(ex, `Can't JIT compile ${regex} (PCRE2_JIT_COMPLETE)`);
        return;
    }

    try {
        regex.jit(PCRE2_JIT_PARTIAL_SOFT);
    } catch (ex) {
        logError(ex, `Can't JIT compile ${regex} (PCRE2_JIT_PARTIAL_SOFT)`);
    }
}

function compile_regex(regex) {
    const compiled = Vte.Regex.new_for_match(regex, -1, PCRE2_UTF | PCRE2_NO_UTF_CHECK | PCRE2_UCP | PCRE2_MULTILINE);
    jit_regex(compiled);
    return compiled;
}

function escape_regex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const REGEX_URL_AS_IS = compile_regex(urldetect_patterns.REGEX_URL_AS_IS);
const REGEX_URL_FILE = compile_regex(urldetect_patterns.REGEX_URL_FILE);
const REGEX_URL_HTTP = compile_regex(urldetect_patterns.REGEX_URL_HTTP);
const REGEX_URL_VOIP = compile_regex(urldetect_patterns.REGEX_URL_VOIP);
const REGEX_EMAIL = compile_regex(urldetect_patterns.REGEX_EMAIL);
const REGEX_NEWS_MAN = compile_regex(urldetect_patterns.REGEX_NEWS_MAN);

GObject.type_ensure(Vte.Terminal);
GObject.type_ensure(Gio.ThemedIcon);

var TerminalPage = GObject.registerClass(
    {
        Template: Me.dir.get_child('terminalpage.ui').get_uri(),
        Children: [
            'terminal',
            'tab_label',
            'tab_label_label',
            'scrollbar',
            'close_button',
            'switcher_item',
            'custom_title_popover',
            'custom_tab_title_entry',
            'search_bar',
            'search_entry',
        ],
        Properties: {
            'settings': GObject.ParamSpec.object(
                'settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings
            ),
            'desktop-settings': GObject.ParamSpec.object(
                'desktop-settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings
            ),
            'menus': GObject.ParamSpec.object(
                'menus', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gtk.Builder
            ),
            'has-selection': GObject.ParamSpec.boolean(
                'has-selection', '', '', GObject.ParamFlags.READABLE | GObject.ParamFlags.EXPLICIT_NOTIFY, false
            ),
            'has-clicked-hyperlink': GObject.ParamSpec.boolean(
                'has-clicked-hyperlink', '', '', GObject.ParamFlags.READABLE | GObject.ParamFlags.EXPLICIT_NOTIFY, false
            ),
            'has-clicked-filename': GObject.ParamSpec.boolean(
                'has-clicked-filename', '', '', GObject.ParamFlags.READABLE | GObject.ParamFlags.EXPLICIT_NOTIFY, false
            ),
            'switch-shortcut': GObject.ParamSpec.string(
                'switch-shortcut', '', '', GObject.ParamFlags.WRITABLE, null
            ),
        },
        Signals: {
            'close-request': {},
            'new-tab-before-request': {},
            'new-tab-after-request': {},
        },
    },
    class TerminalPage extends Gtk.Box {
        _init(params) {
            super._init(params);

            this.clicked_filename = null;
            this.clicked_hyperlink = null;
            this.url_prefix = {};
            this.clipboard = Gtk.Clipboard.get_default(Gdk.Display.get_default());
            this.primary_selection = Gtk.Clipboard.get(Gdk.Atom.intern('PRIMARY', true));
            this.child_pid = null;

            this._switch_shortcut = null;

            this.bind_settings_ro('show-scrollbar', this.scrollbar, 'visible');
            this.bind_settings_ro('scroll-on-output', this.terminal);
            this.bind_settings_ro('scroll-on-keystroke', this.terminal);
            this.bind_settings_ro('text-blink-mode', this.terminal);
            this.bind_settings_ro('cursor-blink-mode', this.terminal);
            this.bind_settings_ro('cursor-shape', this.terminal);
            this.bind_settings_ro('allow-hyperlink', this.terminal);
            this.bind_settings_ro('audible-bell', this.terminal);
            this.bind_settings_ro('bold-is-bright', this.terminal);
            this.bind_settings_ro('backspace-binding', this.terminal);
            this.bind_settings_ro('delete-binding', this.terminal);
            this.bind_settings_ro('pointer-autohide', this.terminal);
            this.bind_settings_ro('tab-close-buttons', this.close_button, 'visible');

            // These widgets aren't children of the TerminalPage, so it's necessary to call
            // .destroy() on them manually.
            // Widgets should be destroyed after all settings are unbound.
            this.run_on_destroy(() => this.tab_label.destroy(), this.tab_label);
            this.run_on_destroy(() => this.switcher_item.destroy(), this.switcher_item);
            this.run_on_destroy(() => this.custom_title_popover.destroy(), this.custom_title_popover);

            this.method_handler(this.settings, 'changed::scrollback-lines', this.update_scrollback);
            this.method_handler(this.settings, 'changed::scrollback-unlimited', this.update_scrollback);
            this.update_scrollback();

            this.method_handler(this.settings, 'changed::custom-font', this.update_font);
            this.method_handler(this.settings, 'changed::use-system-font', this.update_font);
            this.method_handler(this.desktop_settings, 'changed::monospace-font-name', this.update_font);
            this.update_font();

            this.method_handler(this.settings, 'changed::cjk-utf8-ambiguous-width', this.update_ambiguous_width);
            this.update_ambiguous_width();

            this.method_handler(this.settings, 'changed::foreground-color', this.update_color_foreground);
            this.method_handler(this.terminal, 'style-updated', this.update_color_foreground);

            this.method_handler(this.settings, 'changed::background-color', this.update_color_background);
            this.method_handler(this.settings, 'changed::background-opacity', this.update_color_background);
            this.method_handler(this.settings, 'changed::transparent-background', this.update_color_background);
            this.method_handler(this.terminal, 'style-updated', this.update_color_background);

            this.method_handler(this.settings, 'changed::bold-color', this.update_color_bold);
            this.method_handler(this.settings, 'changed::bold-color-same-as-fg', this.update_color_bold);

            this.method_handler(this.settings, 'changed::cursor-background-color', this.update_color_cursor);
            this.method_handler(this.settings, 'changed::cursor-colors-set', this.update_color_cursor);

            this.method_handler(this.settings, 'changed::cursor-foreground-color', this.update_color_cursor_foreground);
            this.method_handler(this.settings, 'changed::cursor-colors-set', this.update_color_cursor_foreground);

            this.method_handler(this.settings, 'changed::highlight-background-color', this.update_color_highlight);
            this.method_handler(this.settings, 'changed::highlight-colors-set', this.update_color_highlight);

            this.method_handler(this.settings, 'changed::highlight-foreground-color', this.update_color_highlight_foreground);
            this.method_handler(this.settings, 'changed::highlight-colors-set', this.update_color_highlight_foreground);

            this.method_handler(this.settings, 'changed::palette', this.update_palette);

            this.method_handler(this.settings, 'changed::use-theme-colors', this.update_all_colors);
            this.update_all_colors();

            this.method_handler(this.settings, 'changed::tab-label-ellipsize-mode', this.update_label_ellipsize);
            this.update_label_ellipsize();

            this.method_handler(this.settings, 'changed::tab-label-width', this.update_label_width);

            this.toplevel = this.get_toplevel();
            this.configure_connection_id = null;
            this.method_handler(this, 'hierarchy-changed', this.hierarchy_changed);
            this.hierarchy_changed();

            this.run_on_destroy(() => {
                if (this.configure_connection_id && this.toplevel)
                    this.toplevel.disconnect(this.configure_connection_id);
            });

            this.method_handler(this.settings, 'changed::detect-urls', this.setup_url_detect);
            this.method_handler(this.settings, 'changed::detect-urls-as-is', this.setup_url_detect);
            this.method_handler(this.settings, 'changed::detect-urls-file', this.setup_url_detect);
            this.method_handler(this.settings, 'changed::detect-urls-http', this.setup_url_detect);
            this.method_handler(this.settings, 'changed::detect-urls-voip', this.setup_url_detect);
            this.method_handler(this.settings, 'changed::detect-urls-email', this.setup_url_detect);
            this.method_handler(this.settings, 'changed::detect-urls-news-man', this.setup_url_detect);
            this.setup_url_detect();

            this._child_exited = false;
            this._eof = false;

            this.signal_connect(this.terminal, 'eof', () => {
                this._eof = true;
                if (this._child_exited)
                    this.close_request();
            });
            this.signal_connect(this.terminal, 'child-exited', () => {
                this._child_exited = true;
                if (this._eof)
                    this.close_request();
            });
            this.signal_connect(this.terminal, 'selection-changed', () => {
                this.notify('has-selection');
            });

            this.default_title_template = Handlebars.compile(this.settings.settings_schema.get_key('tab-title-template').get_default_value().unpack());
            this.title_template = this.default_title_template;

            const gvariant_false = GLib.Variant.new_boolean(false);
            this.use_custom_title_action = new Gio.SimpleAction({
                'name': 'use-custom-title',
                'state': gvariant_false,
                'parameter-type': gvariant_false.get_type(),
            });
            this.method_handler(this.use_custom_title_action, 'activate', this.toggle_custom_title);
            this.method_handler(this.settings, 'changed::tab-title-template', this.update_tab_title_template);
            this.method_handler(this.custom_tab_title_entry, 'changed', this.update_tab_title_template);

            TITLE_TERMINAL_PROPERTIES.forEach(prop => {
                this.method_handler(this.terminal, `notify::${prop}`, this.update_tab_title);
            });

            this.update_tab_title_template();

            this.terminal_popup_menu = Gtk.Menu.new_from_model(this.menus.get_object('terminal-popup'));
            this.setup_popup_menu(this.terminal, this.terminal_popup_menu);
            this.method_handler(this.terminal, 'button-press-event', this.terminal_button_press_early);
            // https://github.com/amezin/gnome-shell-extension-ddterm/issues/116
            this.terminal_popup_menu.get_style_context().add_class(Gtk.STYLE_CLASS_CONTEXT_MENU);

            const tab_popup_menu = Gtk.Menu.new_from_model(this.menus.get_object('tab-popup'));
            this.setup_popup_menu(this.tab_label, tab_popup_menu);

            const actions = new Gio.SimpleActionGroup();
            this.insert_action_group('page', actions);
            this.tab_label.insert_action_group('page', actions);

            this.method_action(actions, 'close', this.close_request);
            actions.add_action(this.use_custom_title_action);

            this.method_action(actions, 'new-tab-before', this.new_tab_before);
            this.method_action(actions, 'new-tab-after', this.new_tab_after);

            const terminal_actions = new Gio.SimpleActionGroup();
            this.insert_action_group('terminal', terminal_actions);

            const copy_action = this.method_action(terminal_actions, 'copy', this.copy);
            this.bind_property('has-selection', copy_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            const copy_html_action = this.method_action(terminal_actions, 'copy-html', this.copy_html);
            this.bind_property('has-selection', copy_html_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            const open_hyperlink_action = this.method_action(terminal_actions, 'open-hyperlink', this.open_hyperlink);
            this.bind_property('has-clicked-hyperlink', open_hyperlink_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            const copy_hyperlink_action = this.method_action(terminal_actions, 'copy-hyperlink', this.copy_hyperlink);
            this.bind_property('has-clicked-hyperlink', copy_hyperlink_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            const copy_filename_action = this.method_action(terminal_actions, 'copy-filename', this.copy_filename);
            this.bind_property('has-clicked-filename', copy_filename_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            this.method_action(terminal_actions, 'paste', this.paste);
            this.method_action(terminal_actions, 'select-all', this.select_all);
            this.method_action(terminal_actions, 'reset', this.reset);
            this.method_action(terminal_actions, 'reset-and-clear', this.reset_and_clear);

            this.method_action(terminal_actions, 'find', this.find);
            this.method_action(terminal_actions, 'stop-search', this.stop_search);
            this.method_handler(this.search_entry, 'stop-search', this.stop_search);

            this.search_match_case_action = Gio.SimpleAction.new_stateful('search-match-case', null, gvariant_false);
            terminal_actions.add_action(this.search_match_case_action);

            this.search_whole_word_action = Gio.SimpleAction.new_stateful('search-whole-word', null, gvariant_false);
            terminal_actions.add_action(this.search_whole_word_action);

            this.search_regex_action = Gio.SimpleAction.new_stateful('search-regex', null, gvariant_false);
            terminal_actions.add_action(this.search_regex_action);

            this.search_wrap_action = Gio.SimpleAction.new_stateful('search-wrap', null, gvariant_false);
            terminal_actions.add_action(this.search_wrap_action);
            this.method_handler(this.search_wrap_action, 'notify::state', this.update_search_wrap);
            this.update_search_wrap();

            this.find_next_action = this.method_action(terminal_actions, 'find-next', this.find_next);
            this.method_handler(this.search_entry, 'next-match', this.find_next);
            this.method_handler(this.search_entry, 'activate', this.find_next);
            this.search_bar.bind_property('reveal-child', this.find_next_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            this.find_prev_action = this.method_action(terminal_actions, 'find-prev', this.find_prev);
            this.method_handler(this.search_entry, 'previous-match', this.find_prev);
            this.search_bar.bind_property('reveal-child', this.find_prev_action, 'enabled', GObject.BindingFlags.SYNC_CREATE);

            this.signal_connect(this.search_bar, 'key-press-event', (_, event) => {
                return this.search_entry.handle_event(event);
            });
            this.signal_connect(this.search_bar, 'key-release-event', (_, event) => {
                return this.search_entry.handle_event(event);
            });
        }

        get has_clicked_filename() {
            return this.clicked_filename !== null;
        }

        get has_clicked_hyperlink() {
            return this.clicked_hyperlink !== null;
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

            const mode = this.settings.get_string('command');
            if (mode === 'custom-command') {
                const command = this.settings.get_string('custom-command');

                let _;
                [_, argv] = GLib.shell_parse_argv(command);

                spawn_flags = GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP;
            } else if (mode === 'user-shell' || mode === 'user-shell-login') {
                const shell = Vte.get_user_shell();
                const name = GLib.path_get_basename(shell);

                if (mode === 'user-shell-login')
                    argv = [shell, `-${name}`];
                else
                    argv = [shell, name];

                spawn_flags = GLib.SpawnFlags.FILE_AND_ARGV_ZERO;

                if (name !== shell)
                    spawn_flags |= GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP;
            } else {
                this.terminal.feed(`Invalid command: ${mode}`);
                return;
            }

            this.terminal.spawn_async(Vte.PtyFlags.DEFAULT, cwd, argv, null, spawn_flags, null, -1, null, (terminal, pid, error) => {
                if (error)
                    terminal.feed(error.message);

                if (pid)
                    this.child_pid = pid;
            });
        }

        close_request() {
            this.emit('close-request');
        }

        get_font_settings() {
            if (this.settings.get_boolean('use-system-font'))
                return this.desktop_settings.get_string('monospace-font-name');
            else
                return this.settings.get_string('custom-font');
        }

        update_font() {
            this.terminal.font_desc = Pango.FontDescription.from_string(this.get_font_settings());
        }

        update_ambiguous_width() {
            this.terminal.cjk_ambiguous_width = this.settings.get_enum('cjk-utf8-ambiguous-width');
        }

        get_style_color_settings(key, style_property) {
            if (!this.settings.get_boolean('use-theme-colors')) {
                const result = util.parse_rgba(this.settings.get_string(key));
                if (result !== null)
                    return result;
            }

            const context = this.terminal.get_style_context();
            return context.get_property(style_property, context.get_state());
        }

        get_override_color_settings(key, enable_key, enable_reverse = false) {
            if (this.settings.get_boolean('use-theme-colors'))
                return null;

            if (this.settings.get_boolean(enable_key) === enable_reverse)
                return null;

            return util.parse_rgba(this.settings.get_string(key));
        }

        get_color_foreground() {
            return this.get_style_color_settings('foreground-color', 'color');
        }

        get_color_background() {
            const background = this.get_style_color_settings('background-color', 'background-color');

            if (this.settings.get_boolean('transparent-background'))
                background.alpha = this.settings.get_double('background-opacity');

            return background;
        }

        update_color_foreground() {
            this.terminal.set_color_foreground(this.get_color_foreground());
        }

        update_color_background() {
            this.terminal.set_color_background(this.get_color_background());
        }

        update_palette() {
            this.terminal.set_colors(
                this.get_color_foreground(),
                this.get_color_background(),
                this.settings.get_strv('palette').map(util.parse_rgba)
            );
        }

        update_color_bold() {
            this.terminal.set_color_bold(
                this.get_override_color_settings('bold-color', 'bold-color-same-as-fg', true)
            );
        }

        update_color_cursor() {
            this.terminal.set_color_cursor(
                this.get_override_color_settings('cursor-background-color', 'cursor-colors-set')
            );
        }

        update_color_cursor_foreground() {
            this.terminal.set_color_cursor_foreground(
                this.get_override_color_settings('cursor-foreground-color', 'cursor-colors-set')
            );
        }

        update_color_highlight() {
            this.terminal.set_color_highlight(
                this.get_override_color_settings('highlight-background-color', 'highlight-colors-set')
            );
        }

        update_color_highlight_foreground() {
            this.terminal.set_color_highlight_foreground(
                this.get_override_color_settings('highlight-foreground-color', 'highlight-colors-set')
            );
        }

        update_all_colors() {
            this.update_palette();
            this.update_color_bold();
            this.update_color_cursor();
            this.update_color_cursor_foreground();
            this.update_color_highlight();
            this.update_color_highlight_foreground();
        }

        update_scrollback() {
            if (this.settings.get_boolean('scrollback-unlimited'))
                this.terminal.scrollback_lines = -1;
            else
                this.terminal.scrollback_lines = this.settings.get_int('scrollback-lines');
        }

        get has_selection() {
            return this.terminal.get_has_selection();
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

        terminal_button_press_early(_terminal, event) {
            const state = event.get_state()[1];
            const button = event.get_button()[1];

            this.clicked_hyperlink = this.terminal.hyperlink_check_event(event);

            if (!this.clicked_hyperlink) {
                const [url, tag] = this.terminal.match_check_event(event);
                if (url && tag !== null) {
                    const prefix = this.url_prefix[tag];
                    if (prefix && !url.toLowerCase().startsWith(prefix))
                        this.clicked_hyperlink = prefix + url;
                    else
                        this.clicked_hyperlink = url;
                }
            }

            if (this.clicked_hyperlink) {
                try {
                    this.clicked_filename = GLib.filename_from_uri(this.clicked_hyperlink)[0];
                } catch {
                    this.clicked_filename = null;
                }
            } else {
                this.clicked_filename = null;
            }

            this.notify('has-clicked-filename');
            this.notify('has-clicked-hyperlink');

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

        open_hyperlink() {
            Gtk.show_uri_on_window(this.get_ancestor(Gtk.Window), this.clicked_hyperlink, Gdk.CURRENT_TIME);
        }

        copy_hyperlink() {
            this.clipboard.set_text(this.clicked_hyperlink, -1);
        }

        copy_filename() {
            this.clipboard.set_text(this.clicked_filename, -1);
        }

        get switch_shortcut() {
            return this._switch_shortcut;
        }

        set switch_shortcut(value) {
            let label = '';
            if (value) {
                const [key, mods] = Gtk.accelerator_parse(value);
                if (key)
                    label = Gtk.accelerator_get_label(key, mods);
            }

            this._switch_shortcut = label;
            this.update_tab_title();
        }

        method_action(group, name, method) {
            const action = new Gio.SimpleAction({
                name,
            });
            this.method_handler(action, 'activate', method);
            group.add_action(action);
            return action;
        }

        setup_popup_menu(widget, menu, widget_anchor = Gdk.Gravity.SOUTH, menu_anchor = Gdk.Gravity.SOUTH) {
            menu.attach_widget = widget;

            const press_event_id = widget.connect_after('button-press-event', (_, event) => {
                if (!event.triggers_context_menu())
                    return false;

                menu.popup_at_pointer(event);
                return true;
            });
            this.disconnect_on_destroy(widget, press_event_id);

            const popup_menu_id = widget.connect('popup-menu', () => {
                menu.popup_at_widget(widget, widget_anchor, menu_anchor, null);
                return true;
            });
            this.disconnect_on_destroy(widget, popup_menu_id);
        }

        update_tab_title_template() {
            if (!this.use_custom_title_action.state.unpack())
                this.custom_tab_title_entry.text = this.settings.get_string('tab-title-template');

            this.custom_tab_title_entry.width_chars = this.custom_tab_title_entry.text_length;

            try {
                this.title_template = Handlebars.compile(this.custom_tab_title_entry.text);
            } catch {}

            this.update_tab_title();
        }

        update_tab_title() {
            const context = {
                'switch-shortcut': this.switch_shortcut,
            };

            TITLE_TERMINAL_PROPERTIES.forEach(prop => {
                context[prop] = this.terminal[prop];
            });

            let title;
            try {
                title = this.title_template(context);
            } catch {
                title = this.default_title_template(context);
            }

            this.tab_label_label.label = title;
            this.switcher_item.text = title;

            // For whatever reason, 'use-markup' in .ui file has no effect
            this.switcher_item.use_markup = true;
        }

        toggle_custom_title(_, state) {
            this.use_custom_title_action.set_state(state);
            this.update_tab_title_template();

            if (state.unpack())
                this.custom_title_popover.popup();
        }

        update_label_ellipsize() {
            this.tab_label_label.ellipsize = this.settings.get_enum('tab-label-ellipsize-mode');
        }

        update_label_width() {
            if (!this.toplevel)
                return;

            this.tab_label.width_request = Math.floor(this.settings.get_double('tab-label-width') * this.toplevel.get_allocated_width());
        }

        hierarchy_changed() {
            if (this.configure_connection_id && this.toplevel)
                this.toplevel.disconnect(this.configure_connection_id);

            this.toplevel = this.get_toplevel();
            this.configure_connection_id = this.toplevel.connect('configure-event', this.update_label_width.bind(this));
            this.update_label_width();
        }

        new_tab_before() {
            this.emit('new-tab-before-request');
        }

        new_tab_after() {
            this.emit('new-tab-after-request');
        }

        setup_url_detect() {
            this.terminal.match_remove_all();
            this.url_prefix = {};

            if (!this.settings.get_boolean('detect-urls'))
                return;

            const add_regex = regex => {
                const tag = this.terminal.match_add_regex(regex, 0);
                this.terminal.match_set_cursor_name(tag, 'pointer');
                return tag;
            };

            if (this.settings.get_boolean('detect-urls-as-is'))
                add_regex(REGEX_URL_AS_IS);

            if (this.settings.get_boolean('detect-urls-file'))
                add_regex(REGEX_URL_FILE);

            if (this.settings.get_boolean('detect-urls-http')) {
                const http_tag = add_regex(REGEX_URL_HTTP);
                this.url_prefix[http_tag] = 'http://';
            }

            if (this.settings.get_boolean('detect-urls-voip'))
                add_regex(REGEX_URL_VOIP);

            if (this.settings.get_boolean('detect-urls-email')) {
                const email_tag = add_regex(REGEX_EMAIL);
                this.url_prefix[email_tag] = 'mailto:';
            }

            if (this.settings.get_boolean('detect-urls-news-man'))
                add_regex(REGEX_NEWS_MAN);
        }

        update_search_regex() {
            let pattern = this.search_entry.text;
            if (!pattern) {
                this.terminal.search_set_regex(null, 0);
                return;
            }

            if (!this.search_regex_action.state.unpack())
                pattern = escape_regex(pattern);

            if (this.search_whole_word_action.state.unpack())
                pattern = `\\b${pattern}\\b`;

            let search_flags = PCRE2_UTF | PCRE2_NO_UTF_CHECK | PCRE2_UCP | PCRE2_MULTILINE;
            if (!this.search_match_case_action.state.unpack())
                search_flags |= PCRE2_CASELESS;

            const search_regex = Vte.Regex.new_for_search(pattern, -1, search_flags);
            jit_regex(search_regex);
            this.terminal.search_set_regex(search_regex, 0);
        }

        update_search_wrap() {
            this.terminal.search_set_wrap_around(this.search_wrap_action.state.unpack());
        }

        find_next() {
            this.update_search_regex();
            this.terminal.search_find_next();
        }

        find_prev() {
            this.update_search_regex();
            this.terminal.search_find_previous();
        }

        find() {
            this.search_bar.reveal_child = true;

            if (!this.terminal.get_has_selection()) {
                this.search_entry.grab_focus();
                return;
            }

            this.terminal.copy_primary();
            this.primary_selection.request_text((_, text) => {
                if (text)
                    this.search_entry.text = text;

                this.search_entry.grab_focus();
            });
        }

        stop_search() {
            this.search_bar.reveal_child = false;
            this.terminal.grab_focus();
        }
    }
);

Object.assign(TerminalPage.prototype, util.UtilMixin);
