// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import Gi from 'gi';

import { DisplayConfig } from '../util/displayconfig.js';

const AdwOrHdy = Gi.require(Gtk.get_major_version() === 3 ? 'Handy' : 'Adw');

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
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
    Signals: {
        'loaded': {},
    },
}, class DDTermPrefsDialog extends AdwOrHdy.PreferencesWindow {
    #load_promise;

    constructor(params) {
        super({
            modal: false,
            ...params,
        });

        this.set_title(this.gettext_domain.gettext('Preferences'));

        this.#load_promise = this.#load();
    }

    async #load() {
        try {
            const { settings, gettext_domain, display_config } = this;
            const mod = await import('./adw.js');

            mod.fill_preferences_window(this, settings, gettext_domain, display_config);
        } finally {
            this.emit('loaded');
        }
    }

    wait_loaded() {
        return this.#load_promise;
    }
});

export default PrefsDialog;
