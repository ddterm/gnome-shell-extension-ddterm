// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import { bind_sensitive, insert_settings_actions, ui_file_uri } from './util.js';

const IS_GTK3 = Gtk.get_major_version() === 3;

function accelerator_parse(accel) {
    const parsed = Gtk.accelerator_parse(accel);

    return IS_GTK3 ? parsed : parsed.slice(1);
}

const COLUMN_SETTINGS_KEY = 0;
const COLUMN_ACCEL_KEY = 2;
const COLUMN_ACCEL_MODS = 3;
const COLUMN_EDITABLE = 4;

function update_model(model, iter, settings, key) {
    const strv = settings.get_strv(key);
    const [accel_key, accel_mods] =
        strv.length > 0 ? accelerator_parse(strv[0]) : [0, 0];

    model.set(
        iter,
        [COLUMN_ACCEL_KEY, COLUMN_ACCEL_MODS],
        [accel_key, accel_mods]
    );
}

function update_editable(model, iter, settings, key) {
    model.set_value(iter, COLUMN_EDITABLE, settings.is_writable(key));
}

function save_shortcut(settings, model, renderer, path, accel_key = null, accel_mods = null) {
    const [ok, iter] = model.get_iter_from_string(path);
    if (!ok)
        return;

    settings.set_strv(
        model.get_value(iter, COLUMN_SETTINGS_KEY),
        accel_key ? [Gtk.accelerator_name(accel_key, accel_mods)] : []
    );
}

function reset(settings, model) {
    // eslint-disable-next-line no-shadow
    model.foreach((model, path, iter) => {
        const key = model.get_value(iter, COLUMN_SETTINGS_KEY);
        settings.reset(key);
    });
}

function remove_shortcut(settings, model, renderer, path, accel_key = null, accel_mods = null) {
    if (!accel_key && !accel_mods)
        return;

    // eslint-disable-next-line no-shadow
    model.foreach((model, path, iter) => {
        const settings_key = model.get_value(iter, COLUMN_SETTINGS_KEY);
        const value = settings.get_strv(settings_key);
        const index = value.findIndex(accel => {
            const [key, mods] = accelerator_parse(accel);
            return key === accel_key && mods === accel_mods;
        });

        if (index !== -1) {
            value.splice(index, 1);
            settings.set_strv(settings_key, value);
        }
    });
}

export const ShortcutsWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsShortcuts',
    Template: ui_file_uri('prefs-shortcuts.ui'),
    Children: [
        'accel_renderer',
        'accel_toggle',
        'global_accel_renderer',
        'global_accel_toggle',
        'shortcuts_list',
        'global_shortcuts_list',
        'shortcuts_treeview',
        'reset_button',
    ],
    Properties: {
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
    },
}, class PrefsShortcuts extends Gtk.Box {
    constructor(params) {
        super(params);

        insert_settings_actions(this, this.settings, ['shortcuts-enabled']);

        for (const renderer of [this.accel_renderer, this.global_accel_renderer]) {
            for (const model of [this.shortcuts_list, this.global_shortcuts_list]) {
                renderer.connect(
                    'accel-edited',
                    remove_shortcut.bind(globalThis, this.settings, model)
                );
            }
        }

        for (const signal of ['accel-edited', 'accel-cleared']) {
            this.accel_renderer.connect(
                signal,
                save_shortcut.bind(globalThis, this.settings, this.shortcuts_list)
            );

            this.global_accel_renderer.connect(
                signal,
                save_shortcut.bind(globalThis, this.settings, this.global_shortcuts_list)
            );
        }

        bind_sensitive(this.settings, 'shortcuts-enabled', this.shortcuts_treeview);

        this.accel_toggle.connect(
            'toggled',
            save_shortcut.bind(globalThis, this.settings, this.shortcuts_list)
        );

        this.global_accel_toggle.connect(
            'toggled',
            save_shortcut.bind(globalThis, this.settings, this.global_shortcuts_list)
        );

        this.reset_button.connect(
            'clicked',
            reset.bind(globalThis, this.settings, this.shortcuts_list)
        );

        this.reset_button.connect(
            'clicked',
            reset.bind(globalThis, this.settings, this.global_shortcuts_list)
        );

        this.connect('realize', this.#realize.bind(this));
    }

    #realize() {
        const settings_handlers = [];

        const inhibit_shortcuts_handler = this.global_accel_renderer.connect(
            'editing-started',
            (IS_GTK3 ? this.#grab_global_keys : this.#inhibit_system_shortcuts).bind(this)
        );

        for (const shortcuts_list of [this.shortcuts_list, this.global_shortcuts_list]) {
            shortcuts_list.foreach((model, path, iter) => {
                const i = iter.copy();
                const key = model.get_value(i, COLUMN_SETTINGS_KEY);

                settings_handlers.push(
                    this.settings.connect(
                        `changed::${key}`,
                        update_model.bind(globalThis, model, i)
                    ),
                    this.settings.connect(
                        `writable-changed::${key}`,
                        update_editable.bind(globalThis, model, i)
                    )
                );

                update_model(model, i, this.settings, key);
                update_editable(model, i, this.settings, key);

                return false;
            });
        }

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);
            this.global_accel_renderer.disconnect(inhibit_shortcuts_handler);

            for (const handler of settings_handlers)
                this.settings.disconnect(handler);
        });
    }

    get title() {
        return this.gettext_domain.gettext('Keyboard Shortcuts');
    }

    #grab_global_keys(cell_renderer, editable) {
        const display = this.window.get_display();
        const seat = display.get_default_seat();
        const status = seat.grab(
            this.window,
            Gdk.SeatCapabilities.KEYBOARD,
            false,
            null,
            null,
            null
        );

        if (status !== Gdk.GrabStatus.SUCCESS)
            return;

        const done_handler = editable.connect('editing-done', () => {
            seat.ungrab();
            editable.disconnect(done_handler);
        });
    }

    #inhibit_system_shortcuts(cell_renderer, editable) {
        const toplevel = this.root.get_surface();
        toplevel.inhibit_system_shortcuts(null);

        const done_handler = editable.connect('editing-done', () => {
            toplevel.restore_system_shortcuts();
            editable.disconnect(done_handler);
        });
    }
});
