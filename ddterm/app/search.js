// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Vte from 'gi://Vte';

import Gettext from 'gettext';

import {
    PCRE2_UTF,
    PCRE2_NO_UTF_CHECK,
    PCRE2_UCP,
    PCRE2_MULTILINE,
    PCRE2_JIT_COMPLETE,
    PCRE2_JIT_PARTIAL_SOFT,
    PCRE2_CASELESS,
} from './pcre2.js';

const BASE_REGEX_FLAGS = PCRE2_UTF | PCRE2_NO_UTF_CHECK | PCRE2_UCP | PCRE2_MULTILINE;

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
        search_flags |= PCRE2_CASELESS;

    const regex = Vte.Regex.new_for_search(pattern, -1, search_flags);
    jit_regex(regex);
    return regex;
}

const REGEX_OUTDATED = Symbol('regex-outdated');

export const SearchPattern = GObject.registerClass({
    Properties: {
        'regex': GObject.ParamSpec.boxed(
            'regex',
            null,
            null,
            GObject.ParamFlags.READABLE,
            Vte.Regex
        ),
        'text': GObject.ParamSpec.string(
            'text',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            ''
        ),
        'use-regex': GObject.ParamSpec.boolean(
            'use-regex',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'whole-word': GObject.ParamSpec.boolean(
            'whole-word',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'case-sensitive': GObject.ParamSpec.boolean(
            'case-sensitive',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'error': GObject.ParamSpec.boxed(
            'error',
            null,
            null,
            GObject.ParamFlags.READABLE,
            GLib.Error
        ),
        'regex-set': GObject.ParamSpec.boolean(
            'regex-set',
            null,
            null,
            GObject.ParamFlags.READABLE,
            false
        ),
    },
}, class DDTermSearchPattern extends GObject.Object {
    _init(params) {
        super._init(params);

        this._regex = REGEX_OUTDATED;

        this.connect('notify::text', this.invalidate.bind(this));
        this.connect('notify::use-regex', this.invalidate.bind(this));
        this.connect('notify::whole-word', this.invalidate.bind(this));
        this.connect('notify::case-sensitive', this.invalidate.bind(this));
    }

    update() {
        if (this._regex !== REGEX_OUTDATED)
            return;

        try {
            this._regex = compile_regex(
                this.text,
                this.use_regex,
                this.whole_word,
                this.case_sensitive
            );

            if (this._error) {
                this._error = null;
                this.notify('error');
            }
        } catch (ex) {
            this._regex = null;
            this._error = ex;
            this.notify('error');
        }
    }

    get regex() {
        this.update();
        return this._regex;
    }

    get error() {
        this.update();
        return this._error;
    }

    get regex_set() {
        return this.regex !== null;
    }

    invalidate() {
        this._regex = REGEX_OUTDATED;
        this.notify('regex');
        this.notify('regex-set');
    }
});

export const SearchBar = GObject.registerClass({
    Properties: {
        'pattern': GObject.ParamSpec.object(
            'pattern',
            null,
            null,
            GObject.ParamFlags.READABLE,
            SearchPattern
        ),
        'wrap': GObject.ParamSpec.boolean(
            'wrap',
            null,
            null,
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

        const container = new Gtk.Box({
            visible: true,
            parent: this,
        });

        container.get_style_context().add_class('background');

        const layout = new Gtk.Box({
            visible: true,
            border_width: 5,
            spacing: 5,
        });

        container.pack_start(layout, true, true, 0);

        const case_sensitive_button = new Gtk.ToggleButton({
            image: new Gtk.Image({ icon_name: 'uppercase' }),
            tooltip_text: Gettext.gettext('Case Sensitive'),
            visible: true,
            focus_on_click: false,
        });

        layout.pack_start(case_sensitive_button, false, false, 0);

        this.pattern.bind_property(
            'case-sensitive',
            case_sensitive_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        const whole_word_button = new Gtk.ToggleButton({
            image: new Gtk.Image({ icon_name: 'quotation' }),
            tooltip_text: Gettext.gettext('Match Whole Word'),
            visible: true,
            focus_on_click: false,
        });

        layout.pack_start(whole_word_button, false, false, 0);

        this.pattern.bind_property(
            'whole-word',
            whole_word_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        const regex_button = new Gtk.ToggleButton({
            image: new Gtk.Image({ icon_name: 'regex' }),
            tooltip_text: Gettext.gettext('Regular Expression'),
            visible: true,
            focus_on_click: false,
        });

        layout.pack_start(regex_button, false, false, 0);

        this.pattern.bind_property(
            'use-regex',
            regex_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        const entry = new Gtk.SearchEntry({
            visible: true,
        });

        layout.pack_start(entry, true, true, 0);

        this.pattern.bind_property(
            'text',
            entry,
            'text',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        const error_popover = new Gtk.Popover({
            relative_to: entry,
            modal: false,
            border_width: 5,
        });

        const error_label = new Gtk.Label({
            parent: error_popover,
            visible: true,
        });

        error_label.get_style_context().add_class('error');

        this.pattern.connect('notify::error', () => {
            if (this.pattern.error) {
                entry.get_style_context().add_class('error');
                error_label.label = this.pattern.error.message;
                error_popover.popup();
            } else {
                entry.get_style_context().remove_class('error');
                error_popover.popdown();
            }
        });

        entry.connect('activate', () => this.find_next());
        entry.connect('next-match', () => this.find_next());
        entry.connect('previous-match', () => this.find_prev());
        entry.connect('stop-search', () => this.close());
        entry.connect('search-changed', () => this.pattern.update());

        this.connect('key-press-event', (_, event) => entry.handle_event(event));
        this.connect('key-release-event', (_, event) => entry.handle_event(event));
        this.connect('notify::reveal-child', () => {
            if (this.reveal_child)
                entry.grab_focus();
        });

        const close_button = new Gtk.Button({
            image: new Gtk.Image({ icon_name: 'window-close' }),
            tooltip_text: Gettext.gettext('Close Search Bar'),
            visible: true,
            focus_on_click: false,
        });

        layout.pack_end(close_button, false, false, 0);

        close_button.connect('clicked', this.close.bind(this));

        const wrap_button = new Gtk.ToggleButton({
            image: new Gtk.Image({ icon_name: 'view-wrapped' }),
            tooltip_text: Gettext.gettext('Wrap Around'),
            visible: true,
            focus_on_click: false,
        });

        layout.pack_end(wrap_button, false, false, 0);

        this.bind_property(
            'wrap',
            wrap_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        const find_next_button = new Gtk.Button({
            image: new Gtk.Image({ icon_name: 'go-down' }),
            tooltip_text: Gettext.gettext('Find Next'),
            visible: true,
            focus_on_click: false,
        });

        layout.pack_end(find_next_button, false, false, 0);

        this._pattern.bind_property(
            'regex-set',
            find_next_button,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );

        find_next_button.connect('clicked', this.find_next.bind(this));

        const find_prev_button = new Gtk.Button({
            image: new Gtk.Image({ icon_name: 'go-up' }),
            tooltip_text: Gettext.gettext('Find Previous'),
            visible: true,
            focus_on_click: false,
        });

        layout.pack_end(find_prev_button, false, false, 0);

        this._pattern.bind_property(
            'regex-set',
            find_prev_button,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );

        find_prev_button.connect('clicked', this.find_prev.bind(this));
    }

    get pattern() {
        return this._pattern;
    }

    close() {
        this.reveal_child = false;
    }

    find_next() {
        this.pattern.update();
        this.emit('find-next');
    }

    find_prev() {
        this.pattern.update();
        this.emit('find-prev');
    }
});
