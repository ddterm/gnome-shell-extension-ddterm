// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

export class SimpleAction extends Gio.SimpleAction {
    static [GObject.GTypeName] = 'DDTermSimpleAction';

    static [GObject.properties] = {
        'state-hint': GObject.param_spec_variant(
            'state-hint',
            null,
            null,
            new GLib.VariantType('*'),
            null,
            GObject.ParamFlags.WRITABLE
        ),
    };

    static {
        GObject.registerClass(this);
    }

    set state_hint(value) {
        this.set_state_hint(value);
    }
}

export class SimpleStringAction extends SimpleAction {
    static [GObject.GTypeName] = 'DDTermSimpleStringAction';

    static [GObject.properties] = {
        'state-value': GObject.ParamSpec.string(
            'state-value',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            null
        ),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            ...params,
            parameter_type: GLib.VariantType.new('s'),
            state: params.state ?? GLib.Variant.new_string(''),
        });

        this.connect('notify::state', () => this.notify('state-value'));
    }

    get state_value() {
        return this.get_state().get_string()[0];
    }

    set state_value(value) {
        this.set_state(GLib.Variant.new_string(value));
    }
}

export class SimpleBooleanAction extends SimpleAction {
    static [GObject.GTypeName] = 'DDTermSimpleBooleanAction';

    static [GObject.properties] = {
        'state-value': GObject.ParamSpec.boolean(
            'state-value',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            ...params,
            parameter_type: GLib.VariantType.new('b'),
            state: params.state ?? GLib.Variant.new_boolean(false),
        });

        this.connect('notify::state', () => this.notify('state-value'));
    }

    get state_value() {
        return this.get_state().get_boolean();
    }

    set state_value(value) {
        this.set_state(GLib.Variant.new_boolean(value));
    }
}

export class SimpleActionGroup extends Gio.SimpleActionGroup {
    static [GObject.GTypeName] = 'DDTermSimpleActionGroup';
    static [GObject.interfaces] = [Gtk.Buildable];

    static {
        GObject.registerClass(this);
    }

    vfunc_add_child(builder, child, _type) {
        this.add_action(child);
    }
}
