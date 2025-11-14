// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';

import { PreferencesGroup } from './util.js';

export class PanelIconGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermPanelIconPreferencesGroup';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.title = this.gettext('Panel Icon');

        this.add_combo_text_row({
            key: 'panel-icon-type',
            title: this.gettext('Panel Icon'),
            use_subtitle: true,
            model: {
                'none': this.gettext('None'),
                'menu-button': this.gettext('With popup menu'),
                'toggle-button': this.gettext('Toggle button'),
                'toggle-and-menu-button': this.gettext('Toggle button and popup menu'),
            },
        });
    }
}
