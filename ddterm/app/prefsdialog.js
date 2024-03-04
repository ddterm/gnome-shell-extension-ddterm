/*
    Copyright © 2024 Aleksandr Mezin

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

// BEGIN !ESM
import GLib from 'gi://GLib';
// END !ESM
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';

import { metadata, dir } from './meta.js';
// BEGIN ESM
import { PrefsWidget } from '../pref/widget.js';
// END ESM

// BEGIN !ESM
const [fakeext_import_path] = GLib.filename_from_uri(
    GLib.Uri.resolve_relative(import.meta.url, 'fakeext', GLib.UriFlags.NONE)
);

imports.searchPath.unshift(fakeext_import_path);

const { setCurrentExtension, installImporter } = imports.misc.extensionUtils;
const Me = { dir, metadata };

installImporter(Me);
setCurrentExtension(Me);

// END !ESM
export const PrefsDialog = GObject.registerClass({
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
    },
}, class PrefsDialog extends Gtk.Dialog {
    _init(params) {
        super._init(params);

        const gettext_context = Gettext.domain(metadata['gettext-domain']);

        this.set_title(gettext_context.gettext('Preferences'));
        this.set_default_size(640, 576);
        this.set_icon_name('preferences-system');

        let widget;
        // BEGIN ESM
        widget = new PrefsWidget({
            settings: this.settings,
            gettext_context,
        });
        // END ESM
        // BEGIN !ESM
        widget = new Me.imports.ddterm.pref.widget.PrefsWidget({
            settings: this.settings,
            gettext_context,
        });
        // END !ESM

        const content_area = this.get_content_area();

        if (content_area.append)
            content_area.append(widget);
        else
            content_area.pack_start(widget, true, true, 0);
    }
});
