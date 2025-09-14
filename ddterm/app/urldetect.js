// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Vte from 'gi://Vte';

import {
    PCRE2_UTF,
    PCRE2_NO_UTF_CHECK,
    PCRE2_UCP,
    PCRE2_MULTILINE,
    PCRE2_JIT_COMPLETE,
    PCRE2_JIT_PARTIAL_SOFT,
} from './pcre2.js';

import {
    REGEX_URL_AS_IS,
    REGEX_URL_FILE,
    REGEX_URL_HTTP,
    REGEX_URL_VOIP,
    REGEX_EMAIL,
    REGEX_NEWS_MAN,
} from './urldetect_patterns.js';

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

const BASE_REGEX_FLAGS =
    PCRE2_UTF | PCRE2_NO_UTF_CHECK | PCRE2_UCP | PCRE2_MULTILINE;

function compile_regex(regex) {
    const compiled = Vte.Regex.new_for_match(regex, -1, BASE_REGEX_FLAGS);
    jit_regex(compiled);
    return compiled;
}

const URL_REGEX = {
    'detect-urls-as-is': {
        regex: compile_regex(REGEX_URL_AS_IS),
    },
    'detect-urls-file': {
        regex: compile_regex(REGEX_URL_FILE),
    },
    'detect-urls-http': {
        regex: compile_regex(REGEX_URL_HTTP),
        prefix: 'http://',
    },
    'detect-urls-voip': {
        regex: compile_regex(REGEX_URL_VOIP),
    },
    'detect-urls-email': {
        regex: compile_regex(REGEX_EMAIL),
        prefix: 'mailto:',
    },
    'detect-urls-news-man': {
        regex: compile_regex(REGEX_NEWS_MAN),
    },
};

export const PATTERN_NAMES = Object.keys(URL_REGEX);

export const UrlDetect = GObject.registerClass({
    Properties: {
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
    },
}, class DDTermUrlDetect extends GObject.Object {
    _init(params) {
        super._init(params);

        this._url_prefix = new Map();

        this.connect('notify::enabled-patterns', this.setup.bind(this));
        this.setup();
    }

    setup() {
        this.disable();

        if (!this.enabled_patterns)
            return;

        for (const [key, { regex, prefix }] of Object.entries(URL_REGEX)) {
            if (!this.enabled_patterns.includes(key))
                continue;

            const tag = this.terminal.match_add_regex(regex, 0);
            this.terminal.match_set_cursor_name(tag, 'pointer');
            this._url_prefix.set(tag, prefix);
        }
    }

    disable() {
        this._url_prefix.forEach((value, key) => {
            this.terminal.match_remove(key);
            this._url_prefix.delete(key);
        });
    }

    check_event(event) {
        const [url, tag] = this.terminal.match_check_event(event);

        if (url && tag !== null && this._url_prefix.has(tag)) {
            const prefix = this._url_prefix.get(tag);
            if (prefix && !url.toLowerCase().startsWith(prefix))
                return prefix + url;
            else
                return url;
        }

        return null;
    }
});
