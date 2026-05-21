// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import Gi from 'gi';

import { ComboTextRow, ComboTextItem } from './widgets/comborow.js';
import { SwitchRow } from './widgets/switchrow.js';

export { ActionRow } from './widgets/actionrow.js';

export const AdwOrHdy = Gi.require(Gtk.get_major_version() === 3 ? 'Handy' : 'Adw');
export const { PreferencesRow } = AdwOrHdy;

export function add_reset_button(row, settings, key, gettext_domain) {
    const button = Gtk.Button.new_from_icon_name.length === 1
        ? Gtk.Button.new_from_icon_name('edit-clear')
        : Gtk.Button.new_from_icon_name('edit-clear', Gtk.IconSize.BUTTON);

    button.set_tooltip_text(gettext_domain.gettext('Reset to default value'));
    button.set_valign(Gtk.Align.CENTER);
    button.set_hexpand(false);
    button.set_vexpand(false);
    button.set_visible(true);

    if (button.set_has_frame)
        button.set_has_frame(false);
    else
        button.set_relief(Gtk.ReliefStyle.NONE);

    const container = new Gtk.Revealer({
        visible: true,
        child: button,
        transition_type: row.get_direction() === Gtk.TextDirection.LTR
            ? Gtk.RevealerTransitionType.SLIDE_LEFT
            : Gtk.RevealerTransitionType.SLIDE_RIGHT,
    });

    row.add_suffix(container);

    settings.bind_writable(key, button, 'sensitive', false);

    row.connect('realize', () => {
        const changed = settings.connect(`changed::${key}`, () => {
            container.reveal_child = settings.get_user_value(key) !== null;
        });

        const clicked = button.connect('clicked', () => {
            settings.reset(key);
        });

        const unrealize = row.connect('unrealize', () => {
            row.disconnect(unrealize);
            settings.disconnect(changed);
            button.disconnect(clicked);
        });

        container.reveal_child = settings.get_user_value(key) !== null;
    });

    return button;
}

function create_switch_row({
    settings,
    key,
    flags = Gio.SettingsBindFlags.DEFAULT,
    gettext_domain,
    ...params
}) {
    const row = new SwitchRow({
        visible: true,
        use_underline: true,
        ...params,
    });

    settings.bind(key, row, 'active', flags);
    add_reset_button(row, settings, key, gettext_domain);

    return row;
}

function create_combo_text_row({
    settings,
    key,
    model,
    flags = Gio.SettingsBindFlags.DEFAULT,
    gettext_domain,
    ...params
}) {
    if (model && !(model instanceof GObject.Object))
        model = ComboTextItem.create_list(model);

    const row = new ComboTextRow({
        visible: true,
        use_underline: true,
        ...params,
    });

    row.bind_name_model(model);

    settings.bind(key, row, 'value', flags);
    add_reset_button(row, settings, key, gettext_domain);

    return row;
}

class ExpanderRow extends AdwOrHdy.ExpanderRow {
    static [GObject.GTypeName] = 'DDTermExpanderRowEx';

    static [GObject.properties] = {
        'settings': GObject.ParamSpec.object(
            'settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    };

    static {
        GObject.registerClass(this);
    }

    add_switch_row(params) {
        const row = create_switch_row({
            settings: this.settings,
            gettext_domain: this.gettext_domain,
            ...params,
        });

        this.add_row(row);

        return row;
    }

    add_combo_text_row(params) {
        const row = create_combo_text_row({
            settings: this.settings,
            gettext_domain: this.gettext_domain,
            ...params,
        });

        this.add_row(row);

        return row;
    }

    add_row(row) {
        if (super.add_row)
            super.add_row(row);
        else
            super.add(row);
    }

    add_suffix(widget) {
        if (super.add_suffix)
            super.add_suffix(widget);
        else
            super.add_action(widget);
    }

    static create({
        settings,
        key,
        flags = Gio.SettingsBindFlags.DEFAULT,
        gettext_domain,
        ...params
    }) {
        const row = new ExpanderRow({
            settings,
            visible: true,
            use_underline: true,
            show_enable_switch: Boolean(key),
            gettext_domain,
            ...params,
        });

        if (key) {
            settings.bind(key, row, 'enable-expansion', flags);
            add_reset_button(row, settings, key, gettext_domain);
        }

        return row;
    }
}

export class PreferencesGroup extends AdwOrHdy.PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermPreferencesGroup';

    static [GObject.properties] = {
        'settings': GObject.ParamSpec.object(
            'settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            visible: true,
            ...params,
        });
    }

    gettext(...args) {
        return this.gettext_domain.gettext(...args);
    }

    add_switch_row(params) {
        const row = create_switch_row({
            settings: this.settings,
            gettext_domain: this.gettext_domain,
            ...params,
        });

        this.add(row);

        return row;
    }

    add_combo_text_row(params) {
        const row = create_combo_text_row({
            settings: this.settings,
            gettext_domain: this.gettext_domain,
            ...params,
        });

        this.add(row);

        return row;
    }

    add_expander_row(params) {
        const row = ExpanderRow.create({
            settings: this.settings,
            gettext_domain: this.gettext_domain,
            ...params,
        });

        this.add(row);

        return row;
    }
}

export class PreferencesPage extends AdwOrHdy.PreferencesPage {
    static [GObject.GTypeName] = 'DDTermPreferencesPage';

    static [GObject.properties] = {
        'settings': GObject.ParamSpec.object(
            'settings',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'gettext-domain': GObject.ParamSpec.jsobject(
            'gettext-domain',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            visible: true,
            ...params,
        });
    }
}
