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
const { Handlebars } = imports.ddterm.app.thirdparty.handlebars;
const { urldetect_patterns, tcgetpgrp } = imports.ddterm.app;
const { translations } = imports.ddterm.util;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const APP_DIR = Me.dir.get_child('ddterm').get_child('app');

const GVARIANT_FALSE = GLib.Variant.new_boolean(false);

function parse_rgba(str) {
    if (str) {
        const rgba = new Gdk.RGBA();

        if (rgba.parse(str))
            return rgba;
    }

    throw Error(`Cannot parse ${JSON.stringify(str)} as color`);
}

const TITLE_TERMINAL_PROPERTIES = [
    'window-title',
    'icon-title',
    'current-directory-uri',
    'current-file-uri',
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
    const compiled = Vte.Regex.new_for_match(
        regex,
        -1,
        PCRE2_UTF | PCRE2_NO_UTF_CHECK | PCRE2_UCP | PCRE2_MULTILINE
    );

    jit_regex(compiled);
    return compiled;
}

function escape_regex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

GObject.type_ensure(Vte.Terminal);
GObject.type_ensure(Gio.ThemedIcon);

var TerminalPage = GObject.registerClass(
    {
        Template: APP_DIR.get_child('ui').get_child('terminalpage.ui').get_uri(),
        Children: [
            'terminal',
            'tab_label',
            'tab_label_label',
            'scrollbar',
            'close_button',
            'custom_title_popover',
            'custom_tab_title_entry',
            'search_bar',
            'search_entry',
        ],
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
            'switch-shortcut': GObject.ParamSpec.string(
                'switch-shortcut',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                ''
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
            'title-template': GObject.ParamSpec.string(
                'title-template',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                null
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
    class TerminalPage extends Gtk.Box {
        _init(params) {
            super._init(params);

            this.clipboard = Gtk.Clipboard.get_default(Gdk.Display.get_default());
            this.primary_selection = Gtk.Clipboard.get(Gdk.Atom.intern('PRIMARY', true));
            this.child_pid = null;

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

            let toplevel_handler = null;
            this.connect('hierarchy-changed', (_, prev_toplevel) => {
                if (toplevel_handler)
                    prev_toplevel.disconnect(toplevel_handler);

                toplevel_handler = this.get_toplevel().connect(
                    'configure-event',
                    this.update_tab_label_width.bind(this)
                );

                this.update_tab_label_width();
            });
            this.connect('destroy', () => this.get_toplevel().disconnect(toplevel_handler));
            this.map_settings(['tab-label-width'], this.update_tab_label_width.bind(this));

            this.settings.bind(
                'tab-label-ellipsize-mode',
                this.tab_label_label,
                'ellipsize',
                Gio.SettingsBindFlags.GET
            );

            this.settings.bind(
                'show-scrollbar',
                this.scrollbar,
                'visible',
                Gio.SettingsBindFlags.GET
            );

            this.settings.bind(
                'tab-close-buttons',
                this.close_button,
                'visible',
                Gio.SettingsBindFlags.GET
            );

            this.connect('notify::title-template', () => {
                this.title_template_compiled = Handlebars.compile(this.title_template);
                this.update_title();
            });

            for (const prop of TITLE_TERMINAL_PROPERTIES)
                this.terminal.connect(`notify::${prop}`, this.update_title.bind(this));

            this.connect('notify::switch-shortcut', this.update_title.bind(this));

            this.bind_property(
                'title',
                this.tab_label_label,
                'label',
                GObject.BindingFlags.SYNC_CREATE
            );

            this.switcher_item = new Gtk.ModelButton({
                visible: true,
                action_name: 'notebook.switch-to-tab',
            });

            this.switcher_item.connect('notify::text', source => {
                source.use_markup = true;
            });

            this.bind_property(
                'title',
                this.switcher_item,
                'text',
                GObject.BindingFlags.SYNC_CREATE
            );

            this.use_custom_title_action = new Gio.SimpleAction({
                'name': 'use-custom-title',
                'state': GVARIANT_FALSE,
                'parameter-type': GVARIANT_FALSE.get_type(),
            });

            this.use_custom_title_action.connect('notify::state', () => {
                const use_custom_title = this.use_custom_title_action.state.get_boolean();

                if (use_custom_title) {
                    Gio.Settings.unbind(this, 'title-template');
                    this.custom_title_popover.popup();
                } else {
                    this.settings.bind(
                        'tab-title-template',
                        this,
                        'title-template',
                        Gio.SettingsBindFlags.GET
                    );
                }
            });

            this.settings.bind(
                'tab-title-template',
                this,
                'title-template',
                Gio.SettingsBindFlags.GET
            );

            this.bind_property(
                'title-template',
                this.custom_tab_title_entry,
                'text',
                GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
            );

            this.custom_tab_title_entry.bind_property(
                'text-length',
                this.custom_tab_title_entry,
                'width-chars',
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

            const stop_search_action = new Gio.SimpleAction({ name: 'stop-search' });
            stop_search_action.connect('activate', this.stop_search.bind(this));
            terminal_actions.add_action(stop_search_action);

            const find_next_action = new Gio.SimpleAction({ name: 'find-next' });
            find_next_action.connect('activate', this.find_next.bind(this));
            terminal_actions.add_action(find_next_action);

            const find_prev_action = new Gio.SimpleAction({ name: 'find-prev' });
            find_prev_action.connect('activate', this.find_prev.bind(this));
            terminal_actions.add_action(find_prev_action);

            this.search_match_case_action = new Gio.SimpleAction({
                name: 'search-match-case',
                state: GVARIANT_FALSE,
            });
            terminal_actions.add_action(this.search_match_case_action);

            this.search_whole_word_action = new Gio.SimpleAction({
                name: 'search-whole-word',
                state: GVARIANT_FALSE,
            });
            terminal_actions.add_action(this.search_whole_word_action);

            this.search_regex_action = new Gio.SimpleAction({
                name: 'search-regex',
                state: GVARIANT_FALSE,
            });
            terminal_actions.add_action(this.search_regex_action);

            const search_wrap_action = new Gio.SimpleAction({
                name: 'search-wrap',
                state: GVARIANT_FALSE,
            });
            terminal_actions.add_action(search_wrap_action);

            search_wrap_action.connect('notify::state', () => {
                this.terminal.search_set_wrap_around(search_wrap_action.state.unpack());
            });

            [
                find_next_action,
                find_prev_action,
                this.search_match_case_action,
                this.search_whole_word_action,
                this.search_regex_action,
                search_wrap_action,
                stop_search_action,
            ].forEach(action => this.search_bar.bind_property(
                'reveal-child',
                action,
                'enabled',
                GObject.BindingFlags.SYNC_CREATE
            ));

            this.insert_action_group('terminal', terminal_actions);

            this.search_entry.connect('stop-search', this.stop_search.bind(this));
            this.search_entry.connect('previous-match', this.find_prev.bind(this));
            this.search_entry.connect('next-match', this.find_next.bind(this));
            this.search_entry.connect('activate', this.find_next.bind(this));

            for (const signal_name of ['key-press-event', 'key-release-event']) {
                this.search_bar.connect(signal_name, (_, event) => {
                    return this.search_entry.handle_event(event);
                });
            }

            // These widgets aren't children of the TerminalPage, so they must
            // be destroy()ed manually.
            for (const widget of [this.tab_label, this.switcher_item, this.custom_title_popover])
                this.connect('destroy', () => widget.destroy());

            this.terminal.connect('child-exited', () => this.destroy());
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

        update_tab_label_width() {
            this.tab_label.width_request = Math.floor(
                this.settings.get_double('tab-label-width') *
                this.get_toplevel().get_allocated_width()
            );
        }

        update_title() {
            const context = Object.fromEntries(
                TITLE_TERMINAL_PROPERTIES.map(
                    prop => [prop, this.terminal[prop]]
                ).concat([
                    ['switch-shortcut', this['switch-shortcut']],
                ])
            );

            this.title = this.title_template_compiled(context);
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

        set_switch_shortcut(value) {
            let label = '';
            if (value) {
                const [key, mods] = Gtk.accelerator_parse(value);
                if (key)
                    label = Gtk.accelerator_get_label(key, mods);
            }

            this.switch_shortcut = label;
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
