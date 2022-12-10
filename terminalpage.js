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
const { Handlebars } = imports.handlebars;
const { rxjs } = imports.rxjs;
const { urldetect_patterns, rxutil, settings, tcgetpgrp, translations } = imports;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const GVARIANT_FALSE = GLib.Variant.new_boolean(false);

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
                'settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                settings.Settings
            ),
            'menus': GObject.ParamSpec.object(
                'menus',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gtk.Builder
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

            this.clipboard = Gtk.Clipboard.get_default(Gdk.Display.get_default());
            this.primary_selection = Gtk.Clipboard.get(Gdk.Atom.intern('PRIMARY', true));
            this.child_pid = null;

            this.rx = rxutil.scope(this);

            [
                'scroll-on-output',
                'scroll-on-keystroke',
                'allow-hyperlink',
                'audible-bell',
                'bold-is-bright',
                'pointer-autohide',
                'scrollback-lines',
                'font-desc',
            ].forEach(property => {
                this.rx.subscribe(
                    this.settings.resolved[property] || this.settings[property],
                    rxutil.property(this.terminal, property)
                );
            });

            [
                'text-blink-mode',
                'cursor-blink-mode',
                'cursor-shape',
                'backspace-binding',
                'delete-binding',
            ].forEach(
                property => this.rx.subscribe(
                    this.settings[property].enum,
                    rxutil.property(this.terminal, property)
                )
            );

            this.rx.subscribe(
                this.settings['cjk-utf8-ambiguous-width'].enum,
                rxutil.property(this.terminal, 'cjk-ambiguous-width')
            );

            const style_context = rxutil.signal(this.terminal, 'style-updated').pipe(
                rxjs.startWith([this.terminal]),
                rxjs.map(([widget]) => widget.get_style_context())
            );
            const style_color = property => style_context.pipe(
                rxjs.map(context => context.get_property(property, context.get_state()))
            );

            const foreground = this.settings.resolved_foreground_color(style_color('color'));
            const background =
                this.settings.resolved_background_color(style_color('background-color'));

            this.rx.subscribe(
                rxjs.combineLatest(foreground, background, this.settings.palette),
                args => this.terminal.set_colors(...args)
            );

            this.rx.subscribe(this.settings.resolved['bold-color'], color => {
                this.terminal.set_color_bold(color);
            });

            this.rx.subscribe(this.settings.resolved['cursor-background-color'], color => {
                this.terminal.set_color_cursor(color);
            });

            this.rx.subscribe(this.settings.resolved['cursor-foreground-color'], color => {
                this.terminal.set_color_cursor_foreground(color);
            });

            this.rx.subscribe(this.settings.resolved['highlight-background-color'], color => {
                this.terminal.set_color_highlight(color);
            });

            this.rx.subscribe(this.settings.resolved['highlight-foreground-color'], color => {
                this.terminal.set_color_highlight_foreground(color);
            });

            const url_regex = (enable, regex, prefix) => {
                return enable.pipe(
                    rxjs.map(v => v ? { regex, prefix } : null)
                );
            };

            this.rx.subscribe(
                rxjs.combineLatest(
                    url_regex(this.settings.resolved['detect-urls-as-is'], REGEX_URL_AS_IS),
                    url_regex(this.settings.resolved['detect-urls-file'], REGEX_URL_FILE),
                    // eslint-disable-next-line max-len
                    url_regex(this.settings.resolved['detect-urls-http'], REGEX_URL_HTTP, 'http://'),
                    url_regex(this.settings.resolved['detect-urls-voip'], REGEX_URL_VOIP),
                    url_regex(this.settings.resolved['detect-urls-email'], REGEX_EMAIL, 'mailto:'),
                    url_regex(this.settings.resolved['detect-urls-news-man'], REGEX_NEWS_MAN)
                ),
                configs => {
                    this.terminal.match_remove_all();

                    this.url_prefix = Object.fromEntries(
                        configs.filter(Boolean).map(({ regex, prefix }) => {
                            const tag = this.terminal.match_add_regex(regex, 0);
                            this.terminal.match_set_cursor_name(tag, 'pointer');
                            return [tag, prefix];
                        })
                    );
                }
            );

            const toplevel = rxutil.signal(this, 'hierarchy-changed').pipe(
                rxjs.startWith([this]),
                rxjs.map(([widget]) => widget.get_toplevel())
            );

            const window_width = toplevel.pipe(
                rxjs.switchMap(
                    widget => rxutil.signal(widget, 'configure-event').pipe(
                        rxjs.startWith([widget])
                    )
                ),
                rxjs.map(([widget]) => widget.get_allocated_width())
            );

            const tab_label_width = rxjs.combineLatest(
                window_width,
                this.settings['tab-label-width']
            ).pipe(
                rxjs.map(([a, b]) => Math.floor(a * b))
            );

            this.rx.subscribe(
                tab_label_width,
                rxutil.property(this.tab_label, 'width_request')
            );

            this.rx.subscribe(
                this.settings['tab-label-ellipsize-mode'].enum,
                rxutil.property(this.tab_label_label, 'ellipsize')
            );

            this.rx.subscribe(
                this.settings['show-scrollbar'],
                rxutil.property(this.scrollbar, 'visible')
            );

            this.rx.subscribe(
                this.settings['tab-close-buttons'],
                rxutil.property(this.close_button, 'visible')
            );

            const custom_title_template = rxutil.property(this.custom_tab_title_entry, 'text');
            const custom_title_template_compiled = custom_title_template.pipe(
                rxjs.mergeMap(template => {
                    try {
                        return rxjs.of(Handlebars.compile(template));
                    } catch {
                        return rxjs.EMPTY;
                    }
                }),
                settings.share()
            );

            this.use_custom_title_action = new Gio.SimpleAction({
                'name': 'use-custom-title',
                'state': GVARIANT_FALSE,
                'parameter-type': GVARIANT_FALSE.get_type(),
            });
            const use_custom_title = rxutil.property(this.use_custom_title_action, 'state').pipe(
                rxjs.map(v => v.unpack())
            );
            const title_template_compiled = rxutil.switch_on(use_custom_title, {
                true: custom_title_template_compiled,
                false: this.settings.title_template_compiled,
            });

            const context_entry = name => rxjs.pipe(
                rxjs.distinctUntilChanged(),
                rxjs.map(v => [name, v])
            );

            this.switch_shortcut = this.make_behavior_subject();

            const title_context_entries = TITLE_TERMINAL_PROPERTIES.map(
                prop => rxutil.property(this.terminal, prop).pipe(context_entry(prop))
            ).concat([
                this.switch_shortcut.pipe(context_entry('switch-shortcut')),
            ]);

            const title_context = rxjs.combineLatest(...title_context_entries).pipe(
                rxjs.map(Object.fromEntries),
                settings.share()
            );

            const title = rxjs.combineLatest(
                title_context,
                title_template_compiled
            ).pipe(
                rxjs.mergeMap(([context, template]) => {
                    try {
                        return rxjs.of(template(context));
                    } catch {
                        try {
                            return rxjs.of(this.settings.fallback_title_template(context));
                        } catch {
                            logError("Can't apply template");
                            return rxjs.EMPTY;
                        }
                    }
                })
            );

            this.rx.subscribe(title, value => {
                this.tab_label_label.label = value;
                this.switcher_item.text = value;
                this.switcher_item.use_markup = true;
            });

            this.rx.subscribe(use_custom_title, state => {
                if (state)
                    this.custom_title_popover.popup();
            });

            this.rx.subscribe(
                this.settings['tab-title-template'].pipe(rxutil.disable_if(use_custom_title)),
                rxutil.property(this.custom_tab_title_entry, 'text')
            );

            this.rx.subscribe(
                rxutil.property(this.custom_tab_title_entry, 'text-length'),
                rxutil.property(this.custom_tab_title_entry, 'width-chars')
            );

            // Should be connected before setup_popup_menu() on this.terminal!
            this.rx.connect(
                this.terminal,
                'button-press-event',
                this.terminal_button_press_early.bind(this)
            );

            this.terminal_popup_menu = this.setup_popup_menu(this.terminal, 'terminal-popup');
            this.setup_popup_menu(this.tab_label, 'tab-popup');

            const actions = this.rx.make_simple_actions({
                'close': () => this.close(),
                'new-tab-before': () => this.emit('new-tab-before-request'),
                'new-tab-after': () => this.emit('new-tab-after-request'),
            });

            actions.add_action(this.use_custom_title_action);

            this.insert_action_group('page', actions);
            this.tab_label.insert_action_group('page', actions);

            const terminal_actions = this.rx.make_simple_actions({
                'copy': this.copy.bind(this),
                'copy-html': this.copy_html.bind(this),
                'open-hyperlink': this.open_hyperlink.bind(this),
                'copy-hyperlink': this.copy_hyperlink.bind(this),
                'copy-filename': this.copy_filename.bind(this),
                'paste': this.paste.bind(this),
                'select-all': this.select_all.bind(this),
                'reset': this.reset.bind(this),
                'reset-and-clear': this.reset_and_clear.bind(this),
                'find': this.find.bind(this),
                'stop-search': this.stop_search.bind(this),
                'find-next': this.find_next.bind(this),
                'find-prev': this.find_prev.bind(this),
            });

            this.search_match_case_action = Gio.SimpleAction.new_stateful(
                'search-match-case',
                null,
                GVARIANT_FALSE
            );
            terminal_actions.add_action(this.search_match_case_action);

            this.search_whole_word_action = Gio.SimpleAction.new_stateful(
                'search-whole-word',
                null,
                GVARIANT_FALSE
            );
            terminal_actions.add_action(this.search_whole_word_action);

            this.search_regex_action = Gio.SimpleAction.new_stateful(
                'search-regex',
                null,
                GVARIANT_FALSE
            );
            terminal_actions.add_action(this.search_regex_action);

            const search_wrap_action = Gio.SimpleAction.new_stateful(
                'search-wrap',
                null,
                GVARIANT_FALSE
            );
            terminal_actions.add_action(search_wrap_action);

            this.rx.subscribe(rxutil.property(search_wrap_action, 'state'), state => {
                this.terminal.search_set_wrap_around(state.unpack());
            });

            const has_selection = rxutil.signal(this.terminal, 'selection-changed').pipe(
                rxjs.startWith([this.terminal]),
                rxjs.map(([widget]) => widget.get_has_selection())
            );

            this.clicked_hyperlink = this.make_behavior_subject();
            this.clicked_filename = this.make_behavior_subject();

            const is_nonnull = rxjs.map(value => value !== null);

            const has_clicked_hyperlink = this.clicked_hyperlink.pipe(is_nonnull);
            const has_clicked_filename = this.clicked_filename.pipe(is_nonnull);

            const search_bar_revealed = rxutil.property(this.search_bar, 'reveal-child');

            const terminal_actions_enable = {
                'copy': has_selection,
                'copy-html': has_selection,
                'open-hyperlink': has_clicked_hyperlink,
                'copy-hyperlink': has_clicked_hyperlink,
                'copy-filename': has_clicked_filename,
                'find-next': search_bar_revealed,
                'find-prev': search_bar_revealed,
                'search-match-case': search_bar_revealed,
                'search-whole-word': search_bar_revealed,
                'search-regex': search_bar_revealed,
                'search-wrap': search_bar_revealed,
            };

            for (const [name, observable] of Object.entries(terminal_actions_enable)) {
                const action = terminal_actions.lookup_action(name);
                this.rx.subscribe(observable, rxutil.property(action, 'enabled'));
            }

            this.insert_action_group('terminal', terminal_actions);

            this.rx.connect(this.search_entry, 'stop-search', this.stop_search.bind(this));
            this.rx.connect(this.search_entry, 'previous-match', this.find_prev.bind(this));
            this.rx.connect(this.search_entry, 'next-match', this.find_next.bind(this));
            this.rx.connect(this.search_entry, 'activate', this.find_next.bind(this));

            // These signal handlers return values - can't be handled by rxutil.signal()
            for (const signal_name of ['key-press-event', 'key-release-event']) {
                this.rx.connect(this.search_bar, signal_name, (_, event) => {
                    return this.search_entry.handle_event(event);
                });
            }

            // These widgets aren't children of the TerminalPage, so they must
            // be destroy()ed manually.
            for (const widget of [this.tab_label, this.switcher_item, this.custom_title_popover])
                this.rx.add(() => widget.destroy());

            this.rx.subscribe(
                rxjs.combineLatest(
                    rxutil.signal(this.terminal, 'eof'),
                    rxutil.signal(this.terminal, 'child-exited')
                ),
                () => {
                    this.emit('close-request');
                }
            );
        }

        make_behavior_subject(value) {
            const subject = new rxjs.BehaviorSubject(value);
            this.rx.add(() => subject.complete());
            return subject;
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

            if (this.settings['command'].value === 'custom-command') {
                let _;
                [_, argv] = GLib.shell_parse_argv(this.settings['custom-command'].value);

                spawn_flags = GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP;
            } else {
                const shell = Vte.get_user_shell();
                const name = GLib.path_get_basename(shell);

                if (this.settings['command'].value === 'user-shell-login')
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
                this.clicked_hyperlink.value,
                Gdk.CURRENT_TIME
            );
        }

        copy_hyperlink() {
            this.clipboard.set_text(this.clicked_hyperlink.value, -1);
        }

        copy_filename() {
            this.clipboard.set_text(this.clicked_filename.value, -1);
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

            this.clicked_filename.next(clicked_filename);
            this.clicked_hyperlink.next(clicked_hyperlink);

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

            this.switch_shortcut.next(label);
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

            // Signal handlers that return values can't be implemented with rxutil.signal()
            this.rx.connect_after(widget, 'button-press-event', (_, event) => {
                if (!event.triggers_context_menu())
                    return false;

                menu.popup_at_pointer(event);
                return true;
            });

            // Signal handlers that return values can't be implemented with rxutil.signal()
            this.rx.connect(widget, 'popup-menu', () => {
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
                this.emit('close-request');
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
                    this.emit('close-request');

                message.destroy();
            });

            message.show();
        }
    }
);
