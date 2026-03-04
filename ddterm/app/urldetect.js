// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Vte from 'gi://Vte';

import {
    REGEX_URL_AS_IS,
    REGEX_URL_FILE,
    REGEX_URL_HTTP,
    REGEX_URL_VOIP,
    REGEX_EMAIL,
    REGEX_NEWS_MAN,
} from './urldetect_patterns.js';

import { regex_for_match } from './regex.js';

const URL_REGEX = {
    'detect-urls-as-is': {
        regex: regex_for_match(REGEX_URL_AS_IS),
    },
    'detect-urls-file': {
        regex: regex_for_match(REGEX_URL_FILE),
    },
    'detect-urls-http': {
        regex: regex_for_match(REGEX_URL_HTTP),
        prefix: 'http://',
    },
    'detect-urls-voip': {
        regex: regex_for_match(REGEX_URL_VOIP),
    },
    'detect-urls-email': {
        regex: regex_for_match(REGEX_EMAIL),
        prefix: 'mailto:',
    },
    'detect-urls-news-man': {
        regex: regex_for_match(REGEX_NEWS_MAN),
    },
};

export const PATTERN_NAMES = Object.keys(URL_REGEX);

export class UrlDetect extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermUrlDetect';

    static [GObject.properties] = {
        'terminal': GObject.ParamSpec.object(
            'terminal',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Vte.Terminal
        ),
        'enabled-patterns': GObject.ParamSpec.boxed(
            'enabled-patterns',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            GObject.type_from_name('GStrv')
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #url_prefix;

    constructor(params) {
        super(params);

        this.#url_prefix = new Map();

        this.connect('notify::enabled-patterns', this.#setup.bind(this));
        this.#setup();
    }

    #setup() {
        this.#disable();

        if (!this.enabled_patterns)
            return;

        for (const [key, { regex, prefix }] of Object.entries(URL_REGEX)) {
            if (!this.enabled_patterns.includes(key))
                continue;

            const tag = this.terminal.match_add_regex(regex, 0);
            this.terminal.match_set_cursor_name(tag, 'pointer');
            this.#url_prefix.set(tag, prefix);
        }
    }

    #disable() {
        for (const tag of this.#url_prefix.keys())
            this.terminal.match_remove(tag);

        this.#url_prefix.clear();
    }

    check_event(event) {
        const [url, tag] = this.terminal.match_check_event(event);

        if (url && tag !== null && this.#url_prefix.has(tag)) {
            const prefix = this.#url_prefix.get(tag);
            if (prefix && !url.toLowerCase().startsWith(prefix))
                return prefix + url;
            else
                return url;
        }

        return null;
    }
}
