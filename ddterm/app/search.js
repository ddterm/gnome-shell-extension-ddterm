// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Vte from 'gi://Vte';

import { regex_for_search } from './regex.js';

const REGEX_OUTDATED = Symbol('regex-outdated');

class SearchPattern extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermSearchPattern';

    static [GObject.properties] = {
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
    };

    static {
        GObject.registerClass(this);
    }

    #regex = REGEX_OUTDATED;
    #error = null;

    constructor(params) {
        super(params);

        this.connect('notify::text', this.#invalidate.bind(this));
        this.connect('notify::use-regex', this.#invalidate.bind(this));
        this.connect('notify::whole-word', this.#invalidate.bind(this));
        this.connect('notify::case-sensitive', this.#invalidate.bind(this));
    }

    update() {
        if (this.#regex !== REGEX_OUTDATED)
            return;

        try {
            this.#regex = regex_for_search(
                this.text,
                this.use_regex,
                this.whole_word,
                this.case_sensitive
            );

            if (this.#error) {
                this.#error = null;
                this.notify('error');
            }
        } catch (ex) {
            this.#regex = null;
            this.#error = ex;
            this.notify('error');
        }
    }

    get regex() {
        this.update();
        return this.#regex;
    }

    get error() {
        this.update();
        return this.#error;
    }

    get regex_set() {
        return this.regex !== null;
    }

    #invalidate() {
        this.#regex = REGEX_OUTDATED;
        this.notify('regex');
        this.notify('regex-set');
    }
}

export class SearchBar extends Gtk.SearchBar {
    static [GObject.GTypeName] = 'DDTermSearchBar';

    static [Gtk.template] =
        GLib.Uri.resolve_relative(import.meta.url, './ui/search.ui', GLib.UriFlags.NONE);

    static [GObject.properties] = {
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
    };

    static [GObject.signals] = {
        'find-next': {},
        'find-prev': {},
    };

    static [Gtk.internalChildren] = [
        'case_sensitive_button',
        'whole_word_button',
        'regex_button',
        'entry',
        'wrap_button',
        'find_next_button',
        'find_prev_button',
        'error_popover',
        'error_label',
    ];

    static {
        GObject.registerClass(this);
    }

    #pattern = null;

    constructor(params) {
        super({
            ...params,
            show_close_button: true,
        });

        this.#pattern = new SearchPattern();

        this.#pattern.bind_property(
            'case-sensitive',
            this._case_sensitive_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.#pattern.bind_property(
            'whole-word',
            this._whole_word_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.#pattern.bind_property(
            'use-regex',
            this._regex_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.#pattern.bind_property(
            'text',
            this._entry,
            'text',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        for (const button of [this._find_next_button, this._find_prev_button]) {
            this.#pattern.bind_property(
                'regex-set',
                button,
                'sensitive',
                GObject.BindingFlags.SYNC_CREATE
            );
        }

        this.bind_property(
            'wrap',
            this._wrap_button,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
        );

        this.connect_entry(this._entry);
        this.connect('realize', this.#realize.bind(this));
    }

    #realize() {
        const handler = this.#pattern.connect('notify::error', () => {
            if (this.#pattern.error) {
                this._entry.get_style_context().add_class('error');
                this._error_label.label = this.pattern.error.message;
                this._error_popover.popup();
            } else {
                this._entry.get_style_context().remove_class('error');
                this._error_popover.popdown();
            }
        });

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);
            this.#pattern.disconnect(handler);
        });
    }

    get pattern() {
        return this.#pattern;
    }

    _find_next() {
        this.pattern.update();
        this.emit('find-next');
    }

    _find_prev() {
        this.pattern.update();
        this.emit('find-prev');
    }

    _update_pattern() {
        this.pattern.update();
    }
}
