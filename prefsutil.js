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

const { GLib, Gio, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { rxjs } = Me.imports.rxjs;
const { rxutil } = Me.imports;

const GVARIANT_FALSE = GLib.Variant.new_boolean(false);
const GVARIANT_BOOL = GVARIANT_FALSE.get_type();

function recursion_guard() {
    let running = false;

    const call = fn => {
        if (running)
            return;

        running = true;
        try {
            fn();
        } finally {
            running = false;
        }
    };

    return arg => {
        if (!rxjs.isObservable(arg))
            return call(arg);

        return new rxjs.Observable(subscriber => arg.subscribe({
            next(value) {
                call(() => subscriber.next(value));
            },
            error(error) {
                subscriber.error(error);
            },
            complete() {
                subscriber.complete();
            },
        }));
    };
}

/* exported recursion_guard */

const PERCENT_FORMAT = new Intl.NumberFormat(undefined, { style: 'percent' });

function percent_formatter(_, value) {
    return PERCENT_FORMAT.format(value);
}

/* exported percent_formatter */

function invert_bool_variant(v) {
    return GLib.Variant.new_boolean(!v.unpack());
}

var Scope = class Scope extends rxutil.Scope {
    // eslint-disable-next-line no-shadow
    constructor(obj, settings, destroy_signal = null) {
        super(obj, destroy_signal);

        this.settings = settings;
    }

    setup_bidi_binding(setting, object, property, editable) {
        const circuit_breaker = recursion_guard();
        const prop = rxutil.property(object, property);
        const setting_obj = this.settings[setting];

        this.subscribe(
            setting_obj.pipe(circuit_breaker),
            prop
        );

        this.subscribe(
            prop.skip_initial.pipe(
                rxutil.enable_if(editable),
                circuit_breaker
            ),
            setting_obj
        );
    }

    setting_editable(setting) {
        const writable = this.settings[setting].writable;
        const enable = this.settings.enable[setting];

        return writable.pipe(
            enable ? rxutil.enable_if(enable, rxjs.of(false)) : rxjs.identity
        );
    }

    setup_widget(setting, widget) {
        const editable = this.setting_editable(setting);

        this.subscribe(editable, rxutil.property(widget, 'sensitive'));

        if (widget instanceof Gtk.ComboBox)
            this.setup_bidi_binding(setting, widget, 'active-id', editable);

        else if (widget instanceof Gtk.Range)
            this.setup_bidi_binding(setting, widget.adjustment, 'value', editable);

        else if (widget instanceof Gtk.SpinButton)
            this.setup_bidi_binding(setting, widget.adjustment, 'value', editable);

        else if (widget instanceof Gtk.Entry)
            this.setup_bidi_binding(setting, widget, 'text', editable);

        else if (widget instanceof Gtk.TextView)
            this.setup_bidi_binding(setting, widget.buffer, 'text', editable);

        else if (widget instanceof Gtk.CheckButton)
            this.setup_bidi_binding(setting, widget, 'active', editable);

        else if (widget instanceof Gtk.ColorChooser)
            this.setup_bidi_binding(setting, widget, 'rgba', editable);

        else if (widget instanceof Gtk.FontChooser)
            this.setup_bidi_binding(setting, widget, 'font', editable);

        else
            throw new Error(`Widget ${widget} of unsupported type for setting ${setting}`);
    }

    setup_widgets(mapping) {
        Object.entries(mapping).forEach(
            args => this.setup_widget(...args)
        );
    }

    make_action(setting, from_setting = rxjs.identity, to_setting = rxjs.identity) {
        const packed = this.settings[setting].packed;
        const initial_state = from_setting(packed.value);
        const type = initial_state.get_type();

        const action = Gio.SimpleAction.new_stateful(
            setting,
            type.equal(GVARIANT_BOOL) ? null : type,
            initial_state
        );

        const editable = this.setting_editable(setting);

        this.subscribe(editable, rxutil.property(action, 'enabled'));

        const circuit_breaker = recursion_guard();

        this.connect(action, 'change-state', (_, state) => {
            circuit_breaker(() => {
                if (state.equal(action.state))
                    return;

                const value = to_setting(state);

                if (packed.set_value(value))
                    action.set_state(state);
            });
        });

        this.subscribe(
            packed.skip_initial.pipe(
                circuit_breaker,
                rxjs.map(from_setting)
            ),
            value => {
                action.set_state(value);
            }
        );

        return action;
    }

    make_actions(keys, from_setting = rxjs.identity, to_setting = rxjs.identity) {
        const group = Gio.SimpleActionGroup.new();

        for (const setting of keys) {
            group.add_action(
                this.make_action(setting, from_setting, to_setting)
            );
        }

        return group;
    }

    make_inverse_actions(keys) {
        return this.make_actions(keys, invert_bool_variant, invert_bool_variant);
    }

    set_scale_value_formatter(scale, formatter) {
        if (scale.set_format_value_func)
            scale.set_format_value_func(formatter);
        else
            this.connect(scale, 'format-value', formatter);
    }
};

// eslint-disable-next-line no-shadow
function scope(obj, settings, destroy_signal = null) {
    return new Scope(obj, settings, destroy_signal);
}

/* exported Scope scope */
