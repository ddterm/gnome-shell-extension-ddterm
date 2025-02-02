#!/usr/bin/env -S gjs -m

// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

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
        'monitors': GObject.ParamSpec.object(
            'monitors',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gio.ListModel
        ),
        'gettext-context': GObject.ParamSpec.jsobject(
            'gettext-context',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class AdwPrefsDialog extends Adw.PreferencesWindow {
    constructor(params) {
        super({
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
        const window_page = new adw.WindowPage({ settings, gettext_context });

        this.add(window_page);
        this.add(new adw.TerminalPage({ settings, gettext_context }));
        this.add(new adw.ShortcutsPage({ settings, gettext_context }));
        this.add(new adw.MiscPage({ settings, gettext_context }));

        this.bind_property(
            'monitors',
            window_page,
            'monitors',
            GObject.BindingFlags.SYNC_CREATE
        );
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
            monitors: this.display_config.create_monitor_list(),
            application: this,
        });

        prefs_dialog.show();
    }
});

const app = new AdwApplication();
app.run([System.programInvocationName].concat(ARGV));
