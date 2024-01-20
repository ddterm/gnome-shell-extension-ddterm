/*
    Copyright © 2022 Aleksandr Mezin

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

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import { ui_file_uri } from './resources.js';
import { bind_sensitive, insert_settings_actions } from './util.js';

const IS_GTK3 = Gtk.get_major_version() === 3;

function accelerator_parse(accel) {
    const parsed = Gtk.accelerator_parse(accel);

    return IS_GTK3 ? parsed : parsed.slice(1);
}

const COLUMN_SETTINGS_KEY = 0;
const COLUMN_ACCEL_KEY = 2;
const COLUMN_ACCEL_MODS = 3;
const COLUMN_EDITABLE = 4;

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
    ],
    Properties: {
        'settings': GObject.ParamSpec.object(
            'settings',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gio.Settings
        ),
        'gettext-context': GObject.ParamSpec.jsobject(
            'gettext-context',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
    },
}, class PrefsShortcuts extends Gtk.Box {
    _init(params) {
        super._init(params);

        insert_settings_actions(this, this.settings, ['shortcuts-enabled']);

        [this.shortcuts_list, this.global_shortcuts_list].forEach(shortcuts_list => {
            shortcuts_list.foreach((model, path, iter) => {
                const i = iter.copy();
                const key = model.get_value(i, COLUMN_SETTINGS_KEY);

                const handler = this.settings.connect(
                    `changed::${key}`,
                    this.update_model.bind(this, model, i)
                );
                this.connect('destroy', () => this.settings.disconnect(handler));
                this.update_model(model, i, this.settings, key);

                const editable_handler = this.settings.connect(
                    `writable-changed::${key}`,
                    this.update_editable.bind(this, model, i)
                );
                this.connect('destroy', () => this.settings.disconnect(editable_handler));
                this.update_editable(model, i, this.settings, key);

                return false;
            });
        });

        for (const signal of ['accel-edited', 'accel-cleared']) {
            this.accel_renderer.connect(
                signal,
                this.save_shortcut.bind(this, this.shortcuts_list)
            );

            this.global_accel_renderer.connect(
                signal,
                this.save_shortcut.bind(this, this.global_shortcuts_list)
            );
        }

        this.global_accel_renderer.connect(
            'editing-started',
            (IS_GTK3 ? this.grab_global_keys : this.inhibit_system_shortcuts).bind(this)
        );

        bind_sensitive(this.settings, 'shortcuts-enabled', this.shortcuts_treeview);

        this.accel_toggle.connect('toggled', (_, path) => {
            this.save_shortcut(this.shortcuts_list, _, path);
        });

        this.global_accel_toggle.connect('toggled', (_, path) => {
            this.save_shortcut(this.global_shortcuts_list, _, path);
        });

        const reset_action = new Gio.SimpleAction({ name: 'reset' });
        reset_action.connect('activate', this.reset.bind(this));

        const aux_actions = new Gio.SimpleActionGroup();
        aux_actions.add_action(reset_action);
        this.insert_action_group('aux', aux_actions);
    }

    get title() {
        return this.gettext_context.gettext('Keyboard Shortcuts');
    }

    update_model(model, iter, settings, key) {
        const strv = settings.get_strv(key);
        const [accel_key, accel_mods] =
            strv.length > 0 ? accelerator_parse(strv[0]) : [0, 0];

        model.set(
            iter,
            [COLUMN_ACCEL_KEY, COLUMN_ACCEL_MODS],
            [accel_key, accel_mods]
        );
    }

    update_editable(model, iter, settings, key) {
        model.set_value(iter, COLUMN_EDITABLE, settings.is_writable(key));
    }

    save_shortcut(shortcuts_list, _, path, accel_key = null, accel_mods = null) {
        if (accel_key) {
            this.remove_shortcut(this.shortcuts_list, accel_key, accel_mods);
            this.remove_shortcut(this.global_shortcuts_list, accel_key, accel_mods);
        }

        const [ok, iter] = shortcuts_list.get_iter_from_string(path);
        if (!ok)
            return;

        this.settings.set_strv(
            shortcuts_list.get_value(iter, COLUMN_SETTINGS_KEY),
            accel_key ? [Gtk.accelerator_name(accel_key, accel_mods)] : []
        );
    }

    reset() {
        [this.shortcuts_list, this.global_shortcuts_list].forEach(shortcuts_list => {
            shortcuts_list.foreach((model, path, iter) => {
                const key = model.get_value(iter, COLUMN_SETTINGS_KEY);
                this.settings.reset(key);
            });
        });
    }

    remove_shortcut(shortcuts_list, accel_key, accel_mods) {
        shortcuts_list.foreach((model, path, iter) => {
            const settings_key = model.get_value(iter, COLUMN_SETTINGS_KEY);
            const value = this.settings.get_strv(settings_key);
            const index = value.findIndex(accel => {
                const [key, mods] = accelerator_parse(accel);
                return key === accel_key && mods === accel_mods;
            });

            if (index !== -1) {
                value.splice(index, 1);
                this.settings.set_strv(settings_key, value);
            }
        });
    }

    grab_global_keys(cell_renderer, editable) {
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

    inhibit_system_shortcuts(cell_renderer, editable) {
        const toplevel = this.root.get_surface();
        toplevel.inhibit_system_shortcuts(null);

        const done_handler = editable.connect('editing-done', () => {
            toplevel.restore_system_shortcuts();
            editable.disconnect(done_handler);
        });
    }
});
