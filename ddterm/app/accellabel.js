/*
    Copyright © 2023 Aleksandr Mezin

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

/* exported AccelLabel */

const { GObject, Gio, Gtk } = imports.gi;

var AccelLabel = GObject.registerClass(
    {
        Implements: [Gtk.Actionable],
        Properties: {
            'action-name': GObject.ParamSpec.override('action-name', Gtk.Actionable),
            'action-target': GObject.ParamSpec.override('action-target', Gtk.Actionable),
        },
    },
    class DDTermAccelLabel extends Gtk.Label {
        _init(params) {
            this._name = null;
            this._target_value = null;
            this._keys_handler = null;

            super._init(params);

            this.connect('destroy', () => {
                if (this._keys_handler) {
                    this.get_toplevel().disconnect(this._keys_handler);
                    this._keys_handler = null;
                }
            });

            this.on_hierarchy_changed(null);
        }

        get action_name() {
            return this._name;
        }

        vfunc_get_action_name() {
            return this._name;
        }

        get action_target() {
            return this._target_value;
        }

        vfunc_get_action_target_value() {
            return this._target_value;
        }

        set action_name(value) {
            this.set_action_name(value);
        }

        vfunc_set_action_name(value) {
            if (this._name === value)
                return;

            this._name = value;
            this.update_label();
        }

        set action_target(value) {
            this.set_action_target_value(value);
        }

        vfunc_set_action_target_value(value) {
            if (this._target_value === value)
                return;

            if (value && this._target_value && value.equal(this._target_value))
                return;

            this._target_value = value;
            this.update_label();
        }

        on_hierarchy_changed(previous_toplevel) {
            if (this._keys_handler) {
                previous_toplevel.disconnect(this._keys_handler);
                this._keys_handler = null;
            }

            const toplevel = this.get_toplevel();

            if (toplevel instanceof Gtk.Window) {
                this._keys_handler = this.get_toplevel()?.connect(
                    'keys-changed',
                    () => this.update_label()
                );
            }

            this.update_label();
        }

        _get_label() {
            if (!this._name)
                return '';

            const action = Gio.Action.print_detailed_name(this._name, this._target_value);
            const toplevel = this.get_toplevel();

            if (!(toplevel instanceof Gtk.Window))
                return '';

            for (const shortcut of toplevel.application?.get_accels_for_action(action) || []) {
                try {
                    return Gtk.accelerator_get_label(
                        ...Gtk.accelerator_parse(shortcut)
                    );
                } catch (ex) {
                    logError(ex);
                }
            }

            return '';
        }

        update_label() {
            this.label = this._get_label();
        }
    }
);
