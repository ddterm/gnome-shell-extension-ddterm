// SPDX-FileCopyrightText: © 2024 Aleksandr Mezin
//
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

const Gettext = imports.gettext;
const Me = imports.misc.extensionUtils.getCurrentExtension();

function init() {
    imports.misc.extensionUtils.initTranslations();
}

function buildPrefsWidget() {
    return new Me.imports.ddterm.pref.widget.PrefsWidget({
        settings: imports.misc.extensionUtils.getSettings(),
        gettext_context: Gettext.domain(Me.metadata['gettext-domain']),
    });
}

function  fillPreferencesWindow(win) {
    const settings = imports.misc.extensionUtils.getSettings();
    const gettext_context = Gettext.domain(Me.metadata['gettext-domain']);

    win.add(new Me.imports.ddterm.pref.adw.WindowPage({ settings, gettext_context }));
    win.add(new Me.imports.ddterm.pref.adw.TerminalPage({ settings, gettext_context }));
    win.add(new Me.imports.ddterm.pref.adw.ShortcutsPage({ settings, gettext_context }));
    win.add(new Me.imports.ddterm.pref.adw.MiscPage({ settings, gettext_context }));
}

/* exported init buildPrefsWidget fillPreferencesWindow */
