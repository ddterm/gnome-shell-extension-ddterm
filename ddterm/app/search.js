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
        'error': GObject.ParamSpec.boxed(
            'error',
            '',
            '',
            GObject.ParamFlags.READABLE,
            GLib.Error
        ),
        'regex-set': GObject.ParamSpec.boolean(
            'regex-set',
            '',
            '',
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
            spacing: 5,
        });

        this.child = layout;

        const case_sensitive_button = new Gtk.ToggleButton({
            icon_name: 'uppercase',
            tooltip_text: Gettext.gettext('Case Sensitive'),
            visible: true,
            focus_on_click: false,
        });

        layout.append(case_sensitive_button);

        this.pattern.bind_property(
            'case-sensitive',
            case_sensitive_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        const whole_word_button = new Gtk.ToggleButton({
            icon_name: 'quotation',
            tooltip_text: Gettext.gettext('Match Whole Word'),
            visible: true,
            focus_on_click: false,
        });

        layout.append(whole_word_button);

        this.pattern.bind_property(
            'whole-word',
            whole_word_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        const regex_button = new Gtk.ToggleButton({
            icon_name: 'regex',
            tooltip_text: Gettext.gettext('Regular Expression'),
            visible: true,
            focus_on_click: false,
        });

        layout.append(regex_button);

        this.pattern.bind_property(
            'use-regex',
            regex_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.entry = new Gtk.SearchEntry({
            visible: true,
        });

        layout.append(this.entry);

        this.pattern.bind_property(
            'text',
            this.entry,
            'text',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.error_label = new Gtk.Label({
            visible: true,
        });

        this.error_label.get_style_context().add_class('error');

        this.error_popover = new Gtk.Popover({
            autohide: false,
            visible: false,
            child: this.error_label,
        });

        this.connect('realize', () => this.error_popover.set_parent(this.entry));
        this.connect('unrealize', () => this.error_popover.unparent());

        this.find_next_button = new Gtk.Button({
            icon_name: 'go-down',
            tooltip_text: Gettext.gettext('Find Next'),
            visible: true,
            focus_on_click: false,
        });

        layout.append(this.find_next_button);

        this._pattern.bind_property(
            'regex-set',
            this.find_next_button,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.find_prev_button = new Gtk.Button({
            icon_name: 'go-up',
            tooltip_text: Gettext.gettext('Find Previous'),
            visible: true,
            focus_on_click: false,
        });

        layout.append(this.find_prev_button);

        this._pattern.bind_property(
            'regex-set',
            this.find_prev_button,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.wrap_button = new Gtk.ToggleButton({
            icon_name: 'view-wrapped',
            tooltip_text: Gettext.gettext('Wrap Around'),
            visible: true,
            focus_on_click: false,
        });

        layout.append(this.wrap_button);

        this.bind_property(
            'wrap',
            this.wrap_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.close_button = new Gtk.Button({
            icon_name: 'window-close',
            tooltip_text: Gettext.gettext('Close Search Bar'),
            visible: true,
            focus_on_click: false,
        });

        layout.append(this.close_button);

        this.connect('notify::reveal-child', () => {
            if (this.reveal_child)
                this.entry.grab_focus();
        });

        this._setup_capture();
        this.connect('realize', this._connect_handlers.bind(this));
    }

    _setup_capture() {
        const { entry } = this;
        const capture_controller = Gtk.EventControllerKey.new();

        capture_controller.set_propagation_phase(Gtk.PropagationPhase.BUBBLE);
        capture_controller.connect('key-pressed', () => capture_controller.forward(entry));
        capture_controller.connect('key-released', () => capture_controller.forward(entry));

        this.add_controller(capture_controller);
    }

    _connect_handlers() {
        const error_handler =
            this.pattern.connect('notify::error', this.show_error.bind(this));

        const entry_handlers = [
            this.entry.connect('activate', this.find_next.bind(this)),
            this.entry.connect('next-match', this.find_next.bind(this)),
            this.entry.connect('previous-match', this.find_prev.bind(this)),
            this.entry.connect('stop-search', this.close.bind(this)),
            this.entry.connect('search-changed', () => this.pattern.update()),
        ];

        const find_next_handler =
            this.find_next_button.connect('clicked', this.find_next.bind(this));

        const find_prev_handler =
            this.find_prev_button.connect('clicked', this.find_prev.bind(this));

        const close_handler =
            this.close_button.connect('clicked', this.close.bind(this));

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);
            this.pattern.disconnect(error_handler);

            for (const handler of entry_handlers)
                this.entry.disconnect(handler);

            this.find_next_button.disconnect(find_next_handler);
            this.find_prev_button.disconnect(find_prev_handler);
            this.close_button.disconnect(close_handler);
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

    show_error() {
        if (this.pattern.error) {
            this.entry.get_style_context().add_class('error');
            this.error_label.label = this.pattern.error.message;
            this.error_popover.popup();
        } else {
            this.entry.get_style_context().remove_class('error');
            this.error_popover.popdown();
        }
    }
});
