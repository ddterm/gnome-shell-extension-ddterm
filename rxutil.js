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

const { GObject, Gio } = imports.gi;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { rxjs } = Me.imports.rxjs;

function signal_subscription(source, handler_id) {
    return new rxjs.Subscription(() => {
        GObject.signal_handler_disconnect(source, handler_id);
    });
}

function signal_connect(source, name, handler) {
    return signal_subscription(
        source,
        GObject.signal_connect(source, name, handler)
    );
}

/* exported signal_connect */

function signal_connect_after(source, name, handler) {
    return signal_subscription(
        source,
        GObject.signal_connect_after(source, name, handler)
    );
}

/* exported signal_connect_after */

function raw_signal(obj, name) {
    return new rxjs.Observable(observer => {
        return signal_connect(obj, name, (...args) => {
            observer.next(args);
        });
    });
}

/* exported raw_signal */

function signal(obj, name) {
    return raw_signal(obj, name).pipe(
        rxjs.share()
    );
}

/* exported signal */

var ObservableValue = class ObservableValue extends rxjs.Observable {
    constructor(change, change_with_initial, postproc = rxjs.identity) {
        super((...args) => this.observable.subscribe(...args));

        this.change = change;
        this.change_with_initial = change_with_initial;

        const to_value = rxjs.pipe(rxjs.map(() => this.value), postproc);

        this.observable = change_with_initial.pipe(to_value);
        this.skip_initial = change.pipe(to_value);
    }

    get value() {
        throw new Error('getter not implemented');
    }
};

var ObservableWritableValue = class ObservableWritableValue extends ObservableValue {
    set value(v) {
        throw new Error('setter not implemented');
    }

    next(v) {
        this.value = v;
    }
};

/* exported ObservableValue ObservableWritableValue */

class Property extends ObservableWritableValue {
    constructor(object, name) {
        const change = signal(object, `notify::${name}`);
        const pspec = GObject.Object.find_property.call(object.constructor.$gtype, name);

        super(change, change.pipe(rxjs.startWith([object, pspec])));

        this.object = object;
        this.name = name;
        this.pspec = pspec;
    }

    get value() {
        return this.object[this.name];
    }

    set value(v) {
        this.object[this.name] = v;
    }
}

function property(obj, name) {
    return new Property(obj, name);
}

/* exported property */

function switch_on(condition, choices) {
    return condition.pipe(rxjs.switchMap(
        condition_value => choices[condition_value]
    ));
}

/* exported switch_on */

function enable_if(condition, disabled_override = rxjs.EMPTY) {
    return observable => switch_on(condition, {
        true: observable,
        false: disabled_override,
    });
}

function disable_if(condition, disabled_override = rxjs.EMPTY) {
    return observable => switch_on(condition, {
        false: observable,
        true: disabled_override,
    });
}

/* exported enable_if disable_if */

var Scope = class Scope extends rxjs.Subscription {
    constructor(obj, destroy_signal = null) {
        super();

        this.destroy_signal = (destroy_signal || signal(obj, 'destroy')).pipe(rxjs.take(1));

        this.destroy_signal.subscribe(() => {
            this.unsubscribe();
        });
    }

    add(teardown) {
        super.add(teardown);
        return teardown;
    }

    subscribe(observable, observer) {
        return this.add(observable.subscribe(observer));
    }

    connect(source, signal_name, handler) {
        return this.add(signal_connect(source, signal_name, handler));
    }

    connect_after(source, signal_name, handler) {
        return this.add(signal_connect_after(source, signal_name, handler));
    }

    make_simple_action(name, fn) {
        const action = new Gio.SimpleAction({ name });
        this.connect(action, 'activate', fn);
        return action;
    }

    make_simple_actions(mapping) {
        const group = Gio.SimpleActionGroup.new();

        Object.entries(mapping).forEach(args => {
            group.add_action(this.make_simple_action(...args));
        });

        return group;
    }
};

function scope(obj, destroy_signal = null) {
    return new Scope(obj, destroy_signal);
}

/* exported Scope scope */
