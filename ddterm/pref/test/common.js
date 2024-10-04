/*
    Copyright © 2022 Aleksandr Mezin

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
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';

import { PrefsDialog } from '../../app/prefsdialog.js';
import { get_settings } from '../../app/settings.js';
import { dir, metadata } from '../../app/meta.js';
import { DisplayConfig } from '../../util/displayconfig.js';

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
