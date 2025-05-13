// SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    ExtensionPreferences,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    WindowPage,
    TerminalPage,
    ShortcutsPage,
    MiscPage,
} from './ddterm/pref/adw.js';

import { DisplayConfig } from './ddterm/util/displayconfig.js';

export default class extends ExtensionPreferences {
    fillPreferencesWindow(win) {
        const settings = this.getSettings();
        const gettext_domain = this;
        const display_config = DisplayConfig.new();

        win.connect('destroy', () => display_config.unwatch());

        win.add(new WindowPage({
            settings,
            gettext_domain,
            monitors: display_config.create_monitor_list(),
        }));

        win.add(new TerminalPage({ settings, gettext_domain }));
        win.add(new ShortcutsPage({ settings, gettext_domain }));
        win.add(new MiscPage({ settings, gettext_domain }));
    }
}
