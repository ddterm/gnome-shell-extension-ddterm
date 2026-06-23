// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';

import { PreferencesGroup } from './util.js';

export class WindowAppearanceGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermWindowAppearanceGroup';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.title = this.gettext('Appearance');

        this.add_combo_text_row({
            key: 'theme-variant',
            title: this.gettext('Theme _Variant'),
            model: {
                system: this.gettext('Default'),
                light: this.gettext('Light'),
                dark: this.gettext('Dark'),
            },
        });
    }
}
