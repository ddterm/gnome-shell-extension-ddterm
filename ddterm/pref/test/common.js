// SPDX-FileCopyrightText: © 2022 Aleksandr Mezin
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';

import { PrefsDialog } from '../../app/prefsdialog.js';
import { get_settings } from '../../app/settings.js';
import { dir, metadata } from '../../app/meta.js';

export const Application = GObject.registerClass({
}, class Application extends Gtk.Application {
    _init(params) {
        super._init(params);

        this.connect('startup', () => this.startup());
        this.connect('activate', () => this.activate());
    }

    startup() {
        Gettext.bindtextdomain(
            metadata['gettext-domain'],
            dir.get_child('locale').get_path()
        );

        this.settings = get_settings();
        this.gettext_context = Gettext.domain(metadata['gettext-domain']);
    }

    activate() {
        this.preferences();
    }

    preferences() {
        const prefs_dialog = new PrefsDialog({
            settings: this.settings,
            application: this,
        });

        prefs_dialog.show();
    }
});
