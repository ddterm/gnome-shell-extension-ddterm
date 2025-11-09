// SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    ExtensionPreferences,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { fill_preferences_window } from './ddterm/pref/adw.js';

export default class extends ExtensionPreferences {
    fillPreferencesWindow(win) {
        fill_preferences_window(win, this.getSettings(), this);
    }
}
