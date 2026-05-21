// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import Gi from 'gi';

const AdwOrHdy = Gi.require(Gtk.get_major_version() === 3 ? 'Handy' : 'Adw');

export class ActionRow extends AdwOrHdy.ActionRow {
    static [GObject.GTypeName] = 'DDTermActionRow';

    static {
        GObject.registerClass(this);
    }

    add_suffix = AdwOrHdy.ActionRow.prototype.add_suffix ?? AdwOrHdy.ActionRow.prototype.add;
};
