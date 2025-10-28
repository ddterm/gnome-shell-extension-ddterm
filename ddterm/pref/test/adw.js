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
        this.load_promise = this._load();
    }

    async _load() {
        const { gettext_domain, settings } = this;
        const adw = await import(this.application.resolve_relative('ddterm/pref/adw.js'));

        const { DisplayConfig } =
            await import(this.application.resolve_relative('ddterm/util/displayconfig.js'));

        const display_config = DisplayConfig.new();

        this.connect('close-request', () => {
            display_config.unwatch();
            return false;
        });

        this.add(new adw.WindowPage({
            settings,
            gettext_domain,
            monitors: display_config.create_monitor_list(),
        }));

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

    async preferences() {
        const prefs_dialog = new AdwPrefsDialog({
            settings: this.settings,
            gettext_domain: this.gettext_domain,
            application: this,
        });

        prefs_dialog.show();

        await prefs_dialog.load_promise;

        return prefs_dialog;
    }
});

const app = new AdwApplication();
app.run([System.programInvocationName].concat(ARGV));
