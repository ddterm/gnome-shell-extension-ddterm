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
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'monitors': GObject.ParamSpec.object(
            'monitors',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.ListModel
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
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

        const gettext_domain = this.gettext_domain;
        const settings = this.settings;

        this.add(new adw.WindowPage({ settings, gettext_domain, monitors: this.monitors }));
        this.add(new adw.TerminalPage({ settings, gettext_domain }));
        this.add(new adw.ShortcutsPage({ settings, gettext_domain }));
        this.add(new adw.MiscPage({ settings, gettext_domain }));
    }
});

const AdwApplication = GObject.registerClass({
}, class AdwApplication extends Application {
    startup() {
        Adw.init();

        return super.startup();
    }

    preferences() {
        const prefs_dialog = new AdwPrefsDialog({
            settings: this.settings,
            gettext_domain: this.gettext_domain,
            monitors: this.display_config.create_monitor_list(),
            application: this,
        });

        prefs_dialog.show();

        return prefs_dialog;
    }
});

const app = new AdwApplication();
app.run([System.programInvocationName].concat(ARGV));
