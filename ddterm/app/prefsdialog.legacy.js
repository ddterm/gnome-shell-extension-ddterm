// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';

import { metadata, dir } from './meta.js';
import { DisplayConfig } from '../util/displayconfig.js';

const [fakeext_import_path] = GLib.filename_from_uri(
    GLib.Uri.resolve_relative(import.meta.url, 'fakeext', GLib.UriFlags.NONE)
);

imports.searchPath.unshift(fakeext_import_path);

const { setCurrentExtension, installImporter } = imports.misc.extensionUtils;
const Me = { dir, metadata };

installImporter(Me);
setCurrentExtension(Me);

export const PrefsDialog = GObject.registerClass({
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'display-config': GObject.ParamSpec.object(
            'display-config',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            DisplayConfig
        ),
    },
}, class PrefsDialog extends Gtk.Dialog {
    _init(params) {
        super._init(params);
        this.__heapgraph_name = this.constructor.$gtype.name;

        const gettext_context = Gettext.domain(metadata['gettext-domain']);

        this.set_title(gettext_context.gettext('Preferences'));
        this.set_default_size(640, 576);
        this.set_icon_name('preferences-system');

        const widget = new Me.imports.ddterm.pref.widget.PrefsWidget({
            settings: this.settings,
            monitors: this.display_config.create_monitor_list(),
            gettext_context,
        });

        const content_area = this.get_content_area();

        if (content_area.append)
            content_area.append(widget);
        else
            content_area.pack_start(widget, true, true, 0);
    }
});
