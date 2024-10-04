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

const Gio = imports.gi.Gio;
const Gettext = imports.gettext;
const Me = imports.misc.extensionUtils.getCurrentExtension();

function init() {
    imports.misc.extensionUtils.initTranslations();
}

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

/* exported init fillPreferencesWindow */
