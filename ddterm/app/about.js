// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';

import { get_version, metadata } from './meta.js';

const COPYRIGHT = 'Copyright © 2020-2026 ddterm contributors';
const ARTIST_RE = /^\s*#\s*Artwork\s+by\s*:\s*\n[^\n]+$/igm;

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

export class AboutDialog extends Gtk.AboutDialog {
    static [GObject.GTypeName] = 'DDTermAboutDialog';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            program_name: metadata.name,
            version: get_version(),
            logo_icon_name: 'com.github.amezin.ddterm',
            website: metadata.url,
            comments: metadata.description,
            license_type: Gtk.License.GPL_3_0,
            copyright: COPYRIGHT,
            translator_credits: Gettext.gettext('translator-credits'),
            ...params,
        });

        const text = new TextDecoder().decode(
            Gio.resources_lookup_data(
                '/com/github/amezin/ddterm/AUTHORS',
                Gio.ResourceLookupFlags.NONE
            ).toArray()
        );

        const authors = parse_authors(text.replace(ARTIST_RE, ''));
        const artists = parse_authors(text.match(ARTIST_RE)?.join('\n') ?? '');

        this.authors = [authors.shift()];
        this.add_credit_section(Gettext.gettext('Contributors'), authors);
        this.artists = artists;
    }
}
