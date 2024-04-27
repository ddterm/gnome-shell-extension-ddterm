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

'use strict';

const Gettext = imports.gettext;
const Me = imports.misc.extensionUtils.getCurrentExtension();

function init() {
    imports.misc.extensionUtils.initTranslations();
}

function  fillPreferencesWindow(win) {
    const settings = imports.misc.extensionUtils.getSettings();
    const gettext_context = Gettext.domain(Me.metadata['gettext-domain']);

    win.add(new Me.imports.ddterm.pref.adw.WindowPage({ settings, gettext_context }));
    win.add(new Me.imports.ddterm.pref.adw.TerminalPage({ settings, gettext_context }));
    win.add(new Me.imports.ddterm.pref.adw.ShortcutsPage({ settings, gettext_context }));
    win.add(new Me.imports.ddterm.pref.adw.MiscPage({ settings, gettext_context }));
}

/* exported init fillPreferencesWindow */
