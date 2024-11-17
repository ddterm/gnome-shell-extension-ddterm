// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

const Gio = imports.gi.Gio;
const Gettext = imports.gettext;
const Me = imports.misc.extensionUtils.getCurrentExtension();

function init() {
    imports.misc.extensionUtils.initTranslations();
}

/* exported init */

function  fillPreferencesWindow(win) {
    const settings = imports.misc.extensionUtils.getSettings();
    const gettext_context = Gettext.domain(Me.metadata['gettext-domain']);
    const window_page = new Me.imports.ddterm.pref.adw.WindowPage({ settings, gettext_context });

    win.add(window_page);
    win.add(new Me.imports.ddterm.pref.adw.TerminalPage({ settings, gettext_context }));
    win.add(new Me.imports.ddterm.pref.adw.ShortcutsPage({ settings, gettext_context }));
    win.add(new Me.imports.ddterm.pref.adw.MiscPage({ settings, gettext_context }));

    const cancellable = Gio.Cancellable.new();

    win.connect('destroy', () => cancellable.cancel());

    import('./ddterm/util/displayconfig.js').then(({ DisplayConfig }) => {
        if (cancellable.is_cancelled())
            return;

        const display_config = DisplayConfig.new();

        cancellable.connect(() => display_config.unwatch());

        window_page.monitors = display_config.create_monitor_list();
    });
}

/* exported fillPreferencesWindow */
