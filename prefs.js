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
        const gettext_context = this;
        const window_page = new WindowPage({ settings, gettext_context });

        win.add(window_page);
        win.add(new TerminalPage({ settings, gettext_context }));
        win.add(new ShortcutsPage({ settings, gettext_context }));
        win.add(new MiscPage({ settings, gettext_context }));

        const display_config = DisplayConfig.new();

        win.connect('destroy', () => display_config.unwatch());

        window_page.monitors = display_config.create_monitor_list();
    }
}
