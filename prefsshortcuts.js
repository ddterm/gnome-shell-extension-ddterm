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

'use strict';

const { GObject, Gdk, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { rxjs } = Me.imports.rxjs;
const { prefsutil, rxutil, settings, translations } = Me.imports;

const IS_GTK3 = Gtk.get_major_version() === 3;

function accelerator_parse(accel) {
    const parsed = Gtk.accelerator_parse(accel);

    return IS_GTK3 ? parsed : parsed.slice(1);
}

var Widget = GObject.registerClass(
    {
        GTypeName: 'DDTermPrefsShortcuts',
        Template: Me.dir.get_child(`prefs-shortcuts-gtk${Gtk.get_major_version()}.ui`).get_uri(),
        Children: [
            'accel_renderer',
            'global_accel_renderer',
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
                settings.Settings
            ),
        },
    },
    class PrefsShortcuts extends Gtk.Box {
        _init(params) {
            super._init(params);

            this.scope = prefsutil.scope(this, this.settings);

            this.insert_action_group(
                'settings',
                this.scope.make_actions([
                    'shortcuts-enabled',
                ])
            );

            [this.shortcuts_list, this.global_shortcuts_list].forEach(shortcuts_list => {
                shortcuts_list.foreach((model, path, iter) => {
                    const i = iter.copy();

                    this.scope.subscribe(
                        this.settings[model.get_value(i, 0)],
                        shortcuts => {
                            if (shortcuts && shortcuts.length > 0)
                                model.set(i, [2, 3], accelerator_parse(shortcuts[0]));
                            else
                                model.set(i, [2, 3], [0, 0]);
                        }
                    );

                    return false;
                });
            });

            this.scope.subscribe(
                rxjs.merge(
                    rxutil.signal(this.accel_renderer, 'accel-edited'),
                    rxutil.signal(this.accel_renderer, 'accel-cleared')
                ),
                args => {
                    this.save_shortcut(this.shortcuts_list, ...args);
                }
            );

            this.scope.subscribe(
                rxjs.merge(
                    rxutil.signal(this.global_accel_renderer, 'accel-edited'),
                    rxutil.signal(this.global_accel_renderer, 'accel-cleared')
                ),
                args => {
                    this.save_shortcut(this.global_shortcuts_list, ...args);
                }
            );

            this.scope.subscribe(
                this.settings['shortcuts-enabled'],
                rxutil.property(this.shortcuts_treeview, 'sensitive')
            );

            this.scope.connect(
                this.global_accel_renderer,
                'editing-started',
                (IS_GTK3 ? this.grab_global_keys : this.inhibit_system_shortcuts).bind(this)
            );
        }

        get title() {
            return translations.gettext('Keyboard Shortcuts');
        }

        save_shortcut(shortcuts_list, _, path, accel_key = null, accel_mods = null) {
            const [ok, iter] = shortcuts_list.get_iter_from_string(path);
            if (!ok)
                return;

            const action = shortcuts_list.get_value(iter, 0);
            const key_names = accel_key ? [Gtk.accelerator_name(accel_key, accel_mods)] : [];
            this.settings[action].value = key_names;
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

            this.scope.subscribe(
                rxutil.signal(editable, 'editing-done').pipe(rxjs.take(1)),
                () => {
                    seat.ungrab();
                }
            );
        }

        inhibit_system_shortcuts(cell_renderer, editable) {
            const toplevel = this.root.get_surface();
            toplevel.inhibit_system_shortcuts(null);

            this.scope.subscribe(
                rxutil.signal(editable, 'editing-done').pipe(rxjs.take(1)),
                () => {
                    toplevel.restore_system_shortcuts();
                }
            );
        }
    }
);

/* exported Widget */
