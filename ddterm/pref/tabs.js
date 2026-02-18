// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';

import { PreferencesGroup } from './util.js';

export class TabsGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermTabsPreferencesGroup';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.title = this.gettext('Tabs');

        this.add_switch_row({
            key: 'save-restore-session',
            title: this.gettext('_Restore Previous Tabs on Startup'),
        });

        this.add_combo_text_row({
            key: 'tab-policy',
            title: this.gettext('Show Tab _Bar'),
            model: {
                always: this.gettext('Always'),
                automatic: this.gettext('Automatic'),
                never: this.gettext('Never'),
            },
        });

        this.add_combo_text_row({
            key: 'tab-position',
            title: this.gettext('Tab Bar Position'),
            model: {
                bottom: this.gettext('Bottom'),
                top: this.gettext('Top'),
                left: this.gettext('Left'),
                right: this.gettext('Right'),
            },
        });

        this.add_switch_row({
            key: 'tab-expand',
            title: this.gettext('Expand Tabs'),
        });

        this.add_switch_row({
            key: 'tab-close-buttons',
            title: this.gettext('Show _Close Buttons'),
        });

        this.add_switch_row({
            key: 'new-tab-button',
            title: this.gettext('"_New Tab (Last)" Button'),
        });

        this.add_switch_row({
            key: 'new-tab-front-button',
            title: this.gettext('"_New Tab (First)" Button'),
        });

        this.add_switch_row({
            key: 'tab-switcher-popup',
            title: this.gettext('Tab _Switcher Popup'),
        });

        this.add_switch_row({
            key: 'notebook-border',
            title: this.gettext('Show Border'),
        });

        this.add_switch_row({
            key: 'tab-show-shortcuts',
            title: this.gettext('Show Keyboard Shortcuts'),
        });
    }
}
