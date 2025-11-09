// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';

import { PreferencesGroup } from './util.js';

export class BehaviorGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermBehaviorPreferencesGroup';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.title = this.gettext('Behavior');

        this.add_switch_row({
            key: 'window-resizable',
            title: this.gettext('_Resizable'),
        });

        this.add_switch_row({
            key: 'window-above',
            title: this.gettext('_Above all windows'),
        });

        this.add_switch_row({
            key: 'window-stick',
            title: this.gettext('On all _workspaces'),
        });

        this.add_switch_row({
            key: 'hide-when-focus-lost',
            title: this.gettext('Hide when the application loses _focus'),
        });

        this.add_switch_row({
            key: 'hide-window-on-esc',
            title: this.gettext('Hide when _Esc key is pressed'),
        });

        this.add_switch_row({
            key: 'window-skip-taskbar',
            title: this.gettext('Exclude from _overview/task bar'),
        });

        this.add_switch_row({
            key: 'pointer-autohide',
            title: this.gettext('Hide mouse _pointer when typing'),
        });

        this.add_switch_row({
            key: 'force-x11-gdk-backend',
            title: this.gettext(
                'Force _X11 GDK backend (XWayland).\n' +
                "You'll have to close all tabs for this option to take effect."
            ),
        });
    }
}
