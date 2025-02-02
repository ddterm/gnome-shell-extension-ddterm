// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

export const AccelLabel = GObject.registerClass({
    Implements: [Gtk.Actionable],
    Properties: {
        'action-name': GObject.ParamSpec.override('action-name', Gtk.Actionable),
        'action-target': GObject.ParamSpec.override('action-target', Gtk.Actionable),
    },
},
class DDTermAccelLabel extends Gtk.Label {
    #name = null;
    #target_value = null;
    #toplevel = null;
    #keys_handler = null;
    #hierarchy_handler = null;

    constructor(params) {
        super(params);

        this.connect('realize', this.#realize.bind(this));
        this.connect('unrealize', this.#unrealize.bind(this));
    }

    #realize() {
        this.#hierarchy_handler =
            this.connect('hierarchy-changed', this.#update_hierarchy.bind(this));

        this.#update_hierarchy();
    }

    #unrealize() {
        if (this.#keys_handler) {
            this.#toplevel.disconnect(this.#keys_handler);
            this.#keys_handler = null;
        }

        this.#toplevel = null;

        if (this.#hierarchy_handler) {
            this.disconnect(this.#hierarchy_handler);
            this.#hierarchy_handler = null;
        }
    }

    get action_name() {
        return this.#name;
    }

    vfunc_get_action_name() {
        return this.#name;
    }

    get action_target() {
        return this.#target_value;
    }

    vfunc_get_action_target_value() {
        return this.#target_value;
    }

    set action_name(value) {
        this.set_action_name(value);
    }

    vfunc_set_action_name(value) {
        if (this.#name === value)
            return;

        this.#name = value;
        this.#update_label();
    }

    set action_target(value) {
        this.set_action_target_value(value);
    }

    vfunc_set_action_target_value(value) {
        if (this.#target_value === value)
            return;

        if (value && this.#target_value && value.equal(this.#target_value))
            return;

        this.#target_value = value;
        this.#update_label();
    }

    #update_hierarchy() {
        if (this.#keys_handler) {
            this.#toplevel.disconnect(this.#keys_handler);
            this.#keys_handler = null;
        }

        this.#toplevel = this.get_toplevel();

        if (this.#toplevel instanceof Gtk.Window) {
            this.#keys_handler =
                this.#toplevel.connect('keys-changed', this.#update_label.bind(this));
        }

        this.#update_label();
    }

    #get_label() {
        if (!this.#name)
            return '';

        const action = Gio.Action.print_detailed_name(this.#name, this.#target_value);
        const toplevel = this.#toplevel;

        if (!(toplevel instanceof Gtk.Window))
            return '';

        for (const shortcut of toplevel.application?.get_accels_for_action(action) || []) {
            try {
                return Gtk.accelerator_get_label(...Gtk.accelerator_parse(shortcut));
            } catch (ex) {
                logError(ex);
            }
        }

        return '';
    }

    #update_label() {
        this.label = this.#get_label();
    }
});
