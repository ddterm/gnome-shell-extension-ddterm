// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';

import { PrefsDialog } from '../../app/prefsdialog.js';
import { dir, get_settings, metadata } from '../../app/meta.js';
import { DisplayConfig } from '../../util/displayconfig.js';

export const Application = GObject.registerClass({
}, class Application extends Gtk.Application {
    constructor(params) {
        super(params);

        this.connect('startup', () => this.startup());
        this.connect('activate', () => this.activate());
    }

    startup() {
        Gettext.bindtextdomain(
            metadata['gettext-domain'],
            dir.get_child('locale').get_path()
        );

        this.settings = get_settings();
        this.gettext_domain = Gettext.domain(metadata['gettext-domain']);
        this.display_config = DisplayConfig.new();

        this.connect('shutdown', () => this.display_config.unwatch());
    }

    activate() {
        this.preferences();
    }

    preferences() {
        const prefs_dialog = new PrefsDialog({
            settings: this.settings,
            display_config: this.display_config,
            application: this,
        });

        prefs_dialog.show();
    }
});
