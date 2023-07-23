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

const { GObject, Gtk, Vte } = imports.gi;
const { pcre2 } = imports.ddterm.app;
const { translations } = imports.ddterm.util;

const BASE_REGEX_FLAGS =
    pcre2.PCRE2_UTF | pcre2.PCRE2_NO_UTF_CHECK | pcre2.PCRE2_UCP | pcre2.PCRE2_MULTILINE;

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

function escape_regex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compile_regex(pattern, use_regex, whole_word, case_sensitive) {
    if (!pattern)
        return null;

    if (!use_regex)
        pattern = escape_regex(pattern);

    if (whole_word)
        pattern = `\\b${pattern}\\b`;

    let search_flags = BASE_REGEX_FLAGS;
    if (!case_sensitive)
        search_flags |= pcre2.PCRE2_CASELESS;

    const regex = Vte.Regex.new_for_search(pattern, -1, search_flags);
    jit_regex(regex);
    return regex;
}

const REGEX_OUTDATED = Symbol('regex-outdated');

var SearchPattern = GObject.registerClass(
    {
        Properties: {
            'regex': GObject.ParamSpec.boxed(
                'regex',
                '',
                '',
                GObject.ParamFlags.READABLE,
                Vte.Regex
            ),
            'text': GObject.ParamSpec.string(
                'text',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                ''
            ),
            'use-regex': GObject.ParamSpec.boolean(
                'use-regex',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                false
            ),
            'whole-word': GObject.ParamSpec.boolean(
                'whole-word',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                false
            ),
            'case-sensitive': GObject.ParamSpec.boolean(
                'case-sensitive',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                false
            ),
        },
    },
    class DDTermSearchPattern extends GObject.Object {
        _init(params) {
            super._init(params);

            this._regex = REGEX_OUTDATED;

            this.connect('notify::text', this._discard_regex.bind(this));
            this.connect('notify::use-regex', this._discard_regex.bind(this));
            this.connect('notify::whole-word', this._discard_regex.bind(this));
            this.connect('notify::case-sensitive', this._discard_regex.bind(this));
        }

        get regex() {
            if (this._regex === REGEX_OUTDATED) {
                this._regex = compile_regex(
                    this.text,
                    this.use_regex,
                    this.whole_word,
                    this.case_sensitive
                );
            }

            return this._regex;
        }

        _discard_regex() {
            this._regex = REGEX_OUTDATED;
            this.notify('regex');
        }
    }
);

var SearchBar = GObject.registerClass(
    {
        Properties: {
            'pattern': GObject.ParamSpec.object(
                'pattern',
                '',
                '',
                GObject.ParamFlags.READABLE,
                SearchPattern
            ),
            'wrap': GObject.ParamSpec.boolean(
                'wrap',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                false
            ),
        },
        Signals: {
            'find-next': {},
            'find-prev': {},
        },
    },
    class DDTermSearchBar extends Gtk.Revealer {
        _init(params) {
            super._init(params);

            this._pattern = new SearchPattern();

            const layout = new Gtk.Box({
                visible: true,
                border_width: 5,
                spacing: 5,
                parent: this,
            });

            const case_sensitive_button = new Gtk.ToggleButton({
                label: 'Aa',
                tooltip_text: translations.gettext('Case Sensitive'),
                visible: true,
            });

            layout.pack_start(case_sensitive_button, false, false, 0);

            this.pattern.bind_property(
                'case-sensitive',
                case_sensitive_button,
                'active',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
            );

            const whole_word_button = new Gtk.ToggleButton({
                label: '""',
                tooltip_text: translations.gettext('Match Whole Word'),
                visible: true,
            });

            layout.pack_start(whole_word_button, false, false, 0);

            this.pattern.bind_property(
                'whole-word',
                whole_word_button,
                'active',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
            );

            const wrap_button = new Gtk.ToggleButton({
                image: new Gtk.Image({ icon_name: 'view-wrapped' }),
                tooltip_text: translations.gettext('Wrap Around'),
                visible: true,
            });

            layout.pack_start(wrap_button, false, false, 0);

            this.bind_property(
                'wrap',
                wrap_button,
                'active',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
            );

            const regex_button = new Gtk.ToggleButton({
                label: '.*',
                tooltip_text: translations.gettext('Regular Expression'),
                visible: true,
            });

            layout.pack_start(regex_button, false, false, 0);

            this.pattern.bind_property(
                'use-regex',
                regex_button,
                'active',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
            );

            const entry = new Gtk.SearchEntry({
                primary_icon_name: 'edit-find-symbolic',
                visible: true,
            });

            layout.pack_start(entry, true, true, 0);

            this.pattern.bind_property(
                'text',
                entry,
                'text',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
            );

            entry.connect('activate', this.find_next.bind(this));
            entry.connect('next-match', this.find_next.bind(this));
            entry.connect('previous-match', this.find_prev.bind(this));
            entry.connect('stop-search', this.close.bind(this));

            this.connect('key-press-event', (_, event) => entry.handle_event(event));
            this.connect('key-release-event', (_, event) => entry.handle_event(event));
            this.connect('notify::reveal-child', () => {
                if (this.reveal_child)
                    entry.grab_focus();
            });

            const close_button = new Gtk.Button({
                image: new Gtk.Image({ icon_name: 'window-close' }),
                tooltip_text: translations.gettext('Close Search Bar'),
                visible: true,
            });

            layout.pack_end(close_button, false, false, 0);

            close_button.connect('clicked', this.close.bind(this));

            const find_next_button = new Gtk.Button({
                image: new Gtk.Image({ icon_name: 'go-down' }),
                tooltip_text: translations.gettext('Find Next'),
                visible: true,
            });

            layout.pack_end(find_next_button, false, false, 0);

            find_next_button.connect('clicked', this.find_next.bind(this));

            const find_prev_button = new Gtk.Button({
                image: new Gtk.Image({ icon_name: 'go-up' }),
                tooltip_text: translations.gettext('Find Previous'),
                visible: true,
            });

            layout.pack_end(find_prev_button, false, false, 0);

            find_prev_button.connect('clicked', this.find_prev.bind(this));
        }

        get pattern() {
            return this._pattern;
        }

        close() {
            this.reveal_child = false;
        }

        find_next() {
            this.emit('find-next');
        }

        find_prev() {
            this.emit('find-prev');
        }
    }
);

/* exported SearchBar SearchPattern */
