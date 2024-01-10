#!/usr/bin/env -S gjs -m

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

import Adw from 'gi://Adw?version=1';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import System from 'system';

import { Application } from './common.js';

export const AdwPrefsDialog = GObject.registerClass({
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'gettext-context': GObject.ParamSpec.jsobject(
            'gettext-context',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class AdwPrefsDialog extends Adw.PreferencesWindow {
    _init(params) {
        super._init({
            ...params,
            title: 'ddterm',
            search_enabled: false,
        });

        // Simulating extension preferences dialog
        this._load().catch(e => {
            logError(e, 'Failed to open preferences');
        });
    }

    async _load() {
        const adw = await import('../adw.js');

        const gettext_context = this.gettext_context;
        const settings = this.settings;

        this.add(new adw.WindowPage({ settings, gettext_context }));
        this.add(new adw.TerminalPage({ settings, gettext_context }));
        this.add(new adw.ShortcutsPage({ settings, gettext_context }));
        this.add(new adw.MiscPage({ settings, gettext_context }));
    }
});

const AdwApplication = GObject.registerClass({
}, class AdwApplication extends Application {
    startup() {
        Adw.init();

        super.startup();
    }

    preferences() {
        const prefs_dialog = new AdwPrefsDialog({
            settings: this.settings,
            gettext_context: this.gettext_context,
            application: this,
        });

        prefs_dialog.show();
    }
});

const app = new AdwApplication();
app.run([System.programInvocationName].concat(ARGV));
