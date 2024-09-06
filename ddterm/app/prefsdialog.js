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

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';

import { metadata } from './meta.js';
import { PrefsWidget } from '../pref/widget.js';

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
        this.__heapgraph_name = this.constructor.$gtype.name;

        const gettext_context = Gettext.domain(metadata['gettext-domain']);

        this.set_title(gettext_context.gettext('Preferences'));
        this.set_default_size(640, 576);
        this.set_icon_name('preferences-system');

        const widget = new PrefsWidget({
            settings: this.settings,
            gettext_context,
        });

        const content_area = this.get_content_area();

        if (content_area.append)
            content_area.append(widget);
        else
            content_area.pack_start(widget, true, true, 0);
    }
});
