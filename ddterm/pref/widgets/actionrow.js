// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Adw from 'gi://Adw';

export class ActionRow extends Adw.ActionRow {
    static [GObject.GTypeName] = 'DDTermActionRow';

    static {
        GObject.registerClass(this);
    }

    add_suffix = Adw.ActionRow.prototype.add_suffix;
};
