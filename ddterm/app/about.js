// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';

import { metadata, path } from './meta.js';

const COPYRIGHT = 'Copyright © 2020-2025 Aleksandr Mezin';
const ARTISTS = ['luk'];

function load_npm_package_json() {
    const [, bytes] = GLib.file_get_contents(GLib.build_filenamev([path, 'package.json']));

    return JSON.parse(new TextDecoder().decode(bytes));
}

function format_person(data) {
    if (data.url)
        return `${data.name} ${data.url}`;

    if (data.email)
        return `${data.name} <${data.email}>`;

    if (data.name)
        return data.name;

    return data;
};

export const AboutDialog = GObject.registerClass({
},
class DDTermAboutDialog extends Gtk.AboutDialog {
    constructor(...params) {
        super(...params);

        const { author, contributors } = load_npm_package_json();

        this.program_name = metadata.name;
        this.version = this.application.get_version();
        this.logo_icon_name = this.application.application_id;
        this.website = metadata.url;
        this.comments = metadata.description;
        this.license_type = Gtk.License.GPL_3_0;
        this.copyright = COPYRIGHT;
        this.authors = [format_person(author)];
        this.translator_credits = Gettext.gettext('translator-credits');
        this.add_credit_section(Gettext.gettext('Contributors'), contributors.map(format_person));
        this.artists =
            contributors.filter(person => ARTISTS.includes(person.name)).map(format_person);
    }
});
