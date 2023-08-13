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

const { GObject, Vte } = imports.gi;
const { pcre2, urldetect_patterns } = imports.ddterm.app;

/* exported UrlDetect SETTINGS */

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

const BASE_REGEX_FLAGS =
    pcre2.PCRE2_UTF | pcre2.PCRE2_NO_UTF_CHECK | pcre2.PCRE2_UCP | pcre2.PCRE2_MULTILINE;

function compile_regex(regex) {
    const compiled = Vte.Regex.new_for_match(regex, -1, BASE_REGEX_FLAGS);
    jit_regex(compiled);
    return compiled;
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

var SETTINGS = Object.keys(URL_REGEX);

var UrlDetect = GObject.registerClass(
    {
        Properties: {
            'terminal': GObject.ParamSpec.object(
                'terminal',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Vte.Terminal
            ),
            ...Object.fromEntries(SETTINGS.map(name => [
                name,
                GObject.ParamSpec.boolean(
                    name,
                    '',
                    '',
                    GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                    true
                ),
            ])),
        },
    },
    class DDTermUrlDetect extends GObject.Object {
        _init(params) {
            super._init(params);

            this._url_prefix = new Map();

            SETTINGS.forEach(name => {
                this.connect(`notify::${name}`, this.setup.bind(this));
            });

            this.setup();
        }

        setup() {
            this.disable();

            for (const [key, { regex, prefix }] of Object.entries(URL_REGEX)) {
                if (!this[key])
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

            if (url && tag !== null) {
                const prefix = this._url_prefix.get(tag);
                if (prefix && !url.toLowerCase().startsWith(prefix))
                    return prefix + url;
                else
                    return url;
            }

            return null;
        }
    }
);
