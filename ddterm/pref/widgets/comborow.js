// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import Gi from 'gi';

const AdwOrHdy = Gi.require(Gtk.get_major_version() === 3 ? 'Handy' : 'Adw');

export const INVALID_LIST_POSITION = Gtk.INVALID_LIST_POSITION ?? GLib.MAXUINT32;

export const ComboRow = AdwOrHdy.ComboRow.prototype.bind_name_model
    ? class extends AdwOrHdy.ComboRow {
        static [GObject.GTypeName] = 'DDTermComboRow';

        static [GObject.properties] = {
            'selected': GObject.ParamSpec.uint(
                'selected',
                null,
                null,
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                0,
                GLib.MAXUINT32,
                INVALID_LIST_POSITION
            ),
            'selected-item': GObject.ParamSpec.object(
                'selected-item',
                null,
                null,
                GObject.ParamFlags.READABLE,
                GObject.Object
            ),
        };

        static {
            GObject.registerClass(this);
        }

        constructor(params) {
            super(params);

            this.connect('notify::selected-index', () => {
                this.notify('selected');
                this.notify('selected-item');
            });
        }

        get selected() {
            if (this.selected_index < 0)
                return INVALID_LIST_POSITION;

            return this.selected_index;
        }

        set selected(index) {
            if (index === INVALID_LIST_POSITION)
                this.selected_index = -1;
            else
                this.selected_index = index;
        }

        get selected_item() {
            const { selected } = this;
            const model = this.get_model();

            if (!model || selected >= model.get_n_items())
                return null;

            return model.get_item(selected);
        }

        add_suffix(widget) {
            super.add(widget);
        }
    } : class extends AdwOrHdy.ComboRow {
        static [GObject.GTypeName] = 'DDTermComboRow';

        static {
            GObject.registerClass(this);
        }

        bind_name_model(model, get_name_func) {
            this.set_get_name_func(get_name_func);
            this.set_model(model);
        }

        set_get_name_func(get_name_func) {
            this.set_expression(Gtk.ClosureExpression.new(String, get_name_func, null));
        }
    };

export class ComboTextItem extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermComboTextItem';

    static [GObject.properties] = {
        'name': GObject.ParamSpec.string(
            'name',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
        'value': GObject.ParamSpec.string(
            'value',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            null
        ),
    };

    static {
        GObject.registerClass(this);
    }

    static create_list(mapping) {
        const model = Gio.ListStore.new(this);

        for (const [value, name] of Object.entries(mapping))
            model.append(new this({ value, name }));

        return model;
    }
}

export class ComboTextRow extends ComboRow {
    static [GObject.GTypeName] = 'DDTermComboTextRow';

    static [GObject.properties] = {
        'value': GObject.ParamSpec.string(
            'value',
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
        super(params);

        this.connect('notify::selected-item', () => this.notify('value'));
    }

    bind_name_model(model) {
        super.bind_name_model(model, v => v.name);
    }

    get value() {
        return this.selected_item?.value ?? null;
    }

    set value(new_value) {
        const model = this.get_model();

        if (!model)
            return;

        for (let i = 0; i < model.get_n_items(); i++) {
            const item = model.get_item(i);

            if (item.value === new_value) {
                this.selected = i;
                return;
            }
        }

        this.selected = INVALID_LIST_POSITION;
    }
}

export const StringObject = Gtk.StringObject ?? class extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermStringObject';

    static [GObject.properties] = {
        'string': GObject.ParamSpec.string(
            'string',
            null,
            null,
            GObject.ParamFlags.READABLE,
            null
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #string = null;

    get string() {
        return this.#string;
    }

    get_string() {
        return this.#string;
    }

    static new(s) {
        const o = new this();

        o.#string = s;

        return o;
    }
};

export const StringList = Gtk.StringList ?? class extends Gio.ListStore {
    static [GObject.GTypeName] = 'DDTermStringList';

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            item_type: StringObject,
            ...params,
        });
    }

    static new(strings) {
        const o = new this();

        o.splice(0, 0, strings);

        return o;
    }

    append(s) {
        super.append(StringObject.new(s));
    }

    find(s) {
        const n = this.get_n_items();

        for (let i = 0; i < n; i++) {
            if (this.get_string(i) === s)
                return i;
        }

        return INVALID_LIST_POSITION;
    }

    get_string(position) {
        return this.get_item(position).string;
    }

    splice(position, n_removals, additions) {
        super.splice(position, n_removals, additions.map(v => StringObject.new(v)));
    }
};
