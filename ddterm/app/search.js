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

export class SearchWidget extends Gtk.Box {
    static [GObject.GTypeName] = 'DDTermSearchWidget';

    static [Gtk.template] = 'resource:///com/github/amezin/ddterm/ui/search.ui';

    static [GObject.properties] = {
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

    static [Gtk.children] = [
        'pattern',
        'entry',
    ];

    static [Gtk.internalChildren] = [
        'error_popover',
        'error_label',
    ];

    static {
        GObject.type_ensure(SearchPattern);

        GObject.registerClass(this);
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

    _update_error() {
        if (this.pattern.error) {
            this.entry.get_style_context().add_class('error');
            this._error_label.label = this.pattern.error.message;
            this._error_popover.popup();
        } else {
            this.entry.get_style_context().remove_class('error');
            this._error_popover.popdown();
        }
    }
}
