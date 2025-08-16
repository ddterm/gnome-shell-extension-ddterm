// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const uri = GLib.Uri.resolve_relative(import.meta.url, '../..', GLib.UriFlags.NONE);

export const dir = Gio.File.new_for_uri(uri);
export const path = dir.get_path();

function load() {
    const [, bytes] = GLib.file_get_contents(GLib.build_filenamev([path, 'metadata.json']));

    return JSON.parse(new TextDecoder().decode(bytes));
}

export const metadata = load();

export default metadata;

export const { name, uuid, version } = metadata;
