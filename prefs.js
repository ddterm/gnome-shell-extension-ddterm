// SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import './ddterm/app/init.js';

import {
    ExtensionPreferences,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Adw from 'gi://Adw';

import { fill_preferences_window } from './ddterm/pref/adw.js';

export default class extends ExtensionPreferences {
    fillPreferencesWindow(win) {
        Adw.init();
        fill_preferences_window(win, this.getSettings(), this);
    }
}
