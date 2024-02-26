// SPDX-FileCopyrightText: © 2020, 2021 Aleksandr Mezin
//
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    ExtensionPreferences
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    WindowPage,
    TerminalPage,
    ShortcutsPage,
    MiscPage
} from './ddterm/pref/adw.js';

export default class extends ExtensionPreferences {
    fillPreferencesWindow(win) {
        const settings = this.getSettings();
        const gettext_context = this;

        win.add(new WindowPage({ settings, gettext_context }));
        win.add(new TerminalPage({ settings, gettext_context }));
        win.add(new ShortcutsPage({ settings, gettext_context }));
        win.add(new MiscPage({ settings, gettext_context }));
    }
}
