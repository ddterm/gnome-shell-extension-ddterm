// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';

import { get_version, metadata } from './meta.js';

const COPYRIGHT = 'Copyright © 2020-2026 ddterm contributors';
const ARTIST_RE = /^\s*#\s*Artwork\s+by\s*:\s*\n[^\n]+$/igm;

function load_authors() {
    const url = GLib.Uri.resolve_relative(import.meta.url, '../../AUTHORS', GLib.UriFlags.NONE);
    const [path] = GLib.filename_from_uri(url);
    const [, bytes] = GLib.file_get_contents(path);

    return new TextDecoder().decode(bytes);
}

function parse_authors(text) {
    // https://github.com/npm/cli/blob/latest/node_modules/%40npmcli/package-json/lib/normalize.js
    return text
        .split(/\r?\n/g)
        .map(line => line.replace(/^\s*#.*$/, '').trim())
        .filter(line => line)
        .map(fix_markup);
}

function fix_markup(line) {
    return line.replace(
        /(<.+@.+>)?\s*(?:\((https?:\/\/.+)\))?$/,
        (substr, email, url) => url || email || ''
    );
}

export function create_about_dialog() {
    const dialog = new Adw.AboutDialog();
    const text = load_authors();
    const authors = parse_authors(text.replace(ARTIST_RE, ''));
    const artists = parse_authors(text.match(ARTIST_RE)?.join('\n') ?? '');

    dialog.application_name = metadata.name;
    dialog.version = get_version();
    dialog.application_icon = 'com.github.amezin.ddterm';
    dialog.website = metadata.url;
    dialog.comments = metadata.description;
    dialog.license_type = Gtk.License.GPL_3_0;
    dialog.copyright = COPYRIGHT;
    dialog.developers = [authors.shift()];
    dialog.translator_credits = Gettext.gettext('translator-credits');
    dialog.add_credit_section(Gettext.gettext('Contributors'), authors);
    dialog.artists = artists;

    return dialog;
}
