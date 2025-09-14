// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';

import { metadata } from './meta.js';
import { DisplayConfig } from '../util/displayconfig.js';
import { PrefsWidget } from '../pref/widget.js';

export const PrefsDialog = GObject.registerClass({
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'display-config': GObject.ParamSpec.object(
            'display-config',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            DisplayConfig
        ),
    },
}, class PrefsDialog extends Gtk.Dialog {
    _init(params) {
        super._init(params);

        const gettext_domain = Gettext.domain(metadata['gettext-domain']);

        this.set_title(gettext_domain.gettext('Preferences'));
        this.set_default_size(640, 576);
        this.set_icon_name('preferences-system');

        const widget = new PrefsWidget({
            settings: this.settings,
            monitors: this.display_config.create_monitor_list(),
            gettext_domain,
        });

        const content_area = this.get_content_area();

        if (content_area.append)
            content_area.append(widget);
        else
            content_area.pack_start(widget, true, true, 0);
    }
});
