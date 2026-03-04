// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import Vte from 'gi://Vte';

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

const BASE_REGEX_FLAGS = PCRE2_UTF | PCRE2_NO_UTF_CHECK | PCRE2_UCP | PCRE2_MULTILINE;

function escape_regex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function regex_for_search(pattern, use_regex, whole_word, case_sensitive) {
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

export function regex_for_match(regex) {
    const compiled = Vte.Regex.new_for_match(regex, -1, BASE_REGEX_FLAGS);
    jit_regex(compiled);
    return compiled;
}
