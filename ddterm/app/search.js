// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Vte from 'gi://Vte';

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
    Template: GLib.Uri.resolve_relative(import.meta.url, './ui/search.ui', GLib.UriFlags.NONE),
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
    InternalChildren: [
        'container',
        'layout',
        'case_sensitive_button',
        'whole_word_button',
        'regex_button',
        'entry',
        'close_button',
        'wrap_button',
        'find_next_button',
        'find_prev_button',
        'error_popover',
        'error_label',
    ],
},
class DDTermSearchBar extends Gtk.Revealer {
    _init(params) {
        super._init(params);

        this._pattern = new SearchPattern();

        this._container.get_style_context().add_class('background');
        this._error_label.get_style_context().add_class('error');

        this.pattern.bind_property(
            'case-sensitive',
            this._case_sensitive_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.pattern.bind_property(
            'whole-word',
            this._whole_word_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.pattern.bind_property(
            'use-regex',
            this._regex_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.pattern.bind_property(
            'text',
            this._entry,
            'text',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.pattern.bind_property(
            'regex-set',
            this._find_next_button,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.pattern.bind_property(
            'regex-set',
            this._find_prev_button,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.bind_property(
            'wrap',
            this._wrap_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.pattern.connect('notify::error', () => {
            if (this.pattern.error) {
                this._entry.get_style_context().add_class('error');
                this._error_label.label = this.pattern.error.message;
                this._error_popover.popup();
            } else {
                this._entry.get_style_context().remove_class('error');
                this._error_popover.popdown();
            }
        });
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

    _update_pattern() {
        this.pattern.update();
    }

    _handle_key_event(_, event) {
        return this._entry.handle_event(event);
    }

    _grab_focus_on_reveal() {
        if (this.reveal_child)
            this._entry.grab_focus();
    }
});
