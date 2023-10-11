/*
    Copyright © 2020, 2021 Aleksandr Mezin

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
