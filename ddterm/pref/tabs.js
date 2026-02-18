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

        this.add_combo_text_row({
            key: 'tab-label-ellipsize-mode',
            title: this.gettext('Ellipsize Tab Labels'),
            model: {
                none: this.gettext('None'),
                start: this.gettext('Start'),
                middle: this.gettext('Middle'),
                end: this.gettext('End'),
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

        this.connect('realize', this.#realize.bind(this));
    }

    #realize() {
        this.saved_ellipsize_mode = this.settings.get_string('tab-label-ellipsize-mode');

        if (this.saved_ellipsize_mode === 'none')
            this.saved_ellipsize_mode = 'middle';

        const auto_enable_ellipsize = this.#auto_enable_ellipsize.bind(this);
        const handlers = [
            this.settings.connect('changed::tab-position', auto_enable_ellipsize),
            this.settings.connect('changed::tab-expand', auto_enable_ellipsize),
        ];

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);

            for (const handler of handlers)
                this.settings.disconnect(handler);
        });
    }

    #auto_enable_ellipsize() {
        const current_mode = this.settings.get_string('tab-label-ellipsize-mode');
        const current_enabled = current_mode !== 'none';
        const should_enable =
            ['left', 'right'].includes(this.settings.get_string('tab-position')) ||
                this.settings.get_boolean('tab-expand');

        if (current_enabled === should_enable)
            return;

        if (should_enable) {
            this.settings.set_string('tab-label-ellipsize-mode', this.saved_ellipsize_mode);
        } else {
            this.saved_ellipsize_mode = current_mode;
            this.settings.set_string('tab-label-ellipsize-mode', 'none');
        }
    }
}
