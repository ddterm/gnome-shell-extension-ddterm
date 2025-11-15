// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import Gi from 'gi';

export const AdwOrHdy = Gi.require(Gtk.get_major_version() === 3 ? 'Handy' : 'Adw');

const UI_BASE_URI = GLib.Uri.resolve_relative(
    import.meta.url,
    `ui/gtk${Gtk.get_major_version()}/`,
    GLib.UriFlags.NONE
);

export function ui_file_uri(name) {
    return GLib.Uri.resolve_relative(UI_BASE_URI, name, GLib.UriFlags.NONE);
}

export function set_scale_value_format(scale, format) {
    const formatter = (_, value) => format.format(value);

    if (scale.set_format_value_func)
        scale.set_format_value_func(formatter);
    else
        scale.connect('format-value', formatter);
}

export function bind_widget(settings, key, widget, flags = Gio.SettingsBindFlags.DEFAULT) {
    if (!(flags & Gio.SettingsBindFlags.NO_SENSITIVITY)) {
        settings.bind_writable(key, widget, 'sensitive', false);
        flags |= Gio.SettingsBindFlags.NO_SENSITIVITY;
    }

    if (widget instanceof Gtk.ComboBox)
        settings.bind(key, widget, 'active-id', flags);

    else if (widget instanceof Gtk.Range)
        settings.bind(key, widget.get_adjustment(), 'value', flags);

    else if (widget instanceof Gtk.SpinButton)
        settings.bind(key, widget, 'value', flags);

    else if (widget instanceof Gtk.Entry)
        settings.bind(key, widget, 'text', flags);

    else if (widget instanceof Gtk.TextView)
        settings.bind(key, widget.buffer, 'text', flags);

    else if (widget instanceof Gtk.CheckButton)
        settings.bind(key, widget, 'active', flags);

    else if (widget instanceof Gtk.FontChooser)
        settings.bind(key, widget, 'font', flags);

    else
        throw new Error(`Widget ${widget} of unsupported type for setting ${key}`);
}

export function bind_widgets(settings, mapping) {
    for (const [key, widget] of Object.entries(mapping))
        bind_widget(settings, key, widget);
}

export function bind_sensitive(settings, key, widget, invert = false) {
    let flags = Gio.SettingsBindFlags.GET;

    if (invert)
        flags |= Gio.SettingsBindFlags.INVERT_BOOLEAN;

    settings.bind(key, widget, 'sensitive', flags);
}

export function insert_settings_actions(widget, settings, keys) {
    const group = new Gio.SimpleActionGroup();

    for (const key of keys)
        group.add_action(settings.create_action(key));

    widget.insert_action_group('settings', group);
    return group;
}

export const {
    PreferencesRow,
    ActionRow,
} = AdwOrHdy;

export const SwitchRow = AdwOrHdy.SwitchRow ?? class extends ActionRow {
    static [GObject.GTypeName] = 'DDTermSwitchRow';

    static [GObject.properties] = {
        'active': GObject.ParamSpec.boolean(
            'active',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #slider;
    #slider_binding;

    constructor(params) {
        super(params);

        this.#slider = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            can_focus: false,
            visible: true,
        });

        this.set_activatable(true);
        this.set_activatable_widget(this.#slider);
        this.add(this.#slider);

        this.connect('notify::action-name', this.#update_active_binding.bind(this));
        this.#update_active_binding();

        this.bind_property(
            'action-name',
            this.#slider,
            'action-name',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.bind_property(
            'action-target',
            this.#slider,
            'action-target',
            GObject.BindingFlags.SYNC_CREATE
        );
    }

    #update_active_binding() {
        if (this.action_name) {
            this.#slider_binding?.unbind();
            this.#slider_binding = null;
        } else if (!this.#slider_binding) {
            this.#slider_binding = this.bind_property(
                'active',
                this.#slider,
                'active',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
            );
        }
    }
};

export const EntryRow = AdwOrHdy.EntryRow ?? class extends ActionRow {
    static [GObject.GTypeName] = 'DDTermEntryRow';

    static [GObject.properties] = {
        'text': GObject.ParamSpec.string(
            'text',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            ''
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #entry;

    constructor(params) {
        super(params);

        this.#entry = new Gtk.Entry({
            visible: true,
            hexpand: true,
            valign: Gtk.Align.CENTER,
        });

        this.bind_property(
            'text',
            this.#entry,
            'text',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.set_activatable(true);
        this.set_activatable_widget(this.#entry);

        if (this.add_suffix)
            this.add_suffix(this.#entry);
        else
            this.add(this.#entry);
    }
};

export const SpinRow = AdwOrHdy.SpinRow ?? class extends ActionRow {
    static [GObject.GTypeName] = 'DDTermSpinRow';

    static [GObject.properties] = {
        'adjustment': GObject.ParamSpec.object(
            'adjustment',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gtk.Adjustment
        ),
        'digits': GObject.ParamSpec.int(
            'digits',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            0,
            20,
            0
        ),
        'numeric': GObject.ParamSpec.boolean(
            'numeric',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'snap-to-ticks': GObject.ParamSpec.boolean(
            'snap-to-ticks',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            false
        ),
        'value': GObject.ParamSpec.double(
            'value',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            -Number.MAX_VALUE,
            Number.MAX_VALUE,
            0
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #spin;

    constructor(params) {
        super(params);

        this.#spin = new Gtk.SpinButton({
            visible: true,
            hexpand: true,
            valign: Gtk.Align.CENTER,
        });

        for (const prop of ['snap-to-ticks', 'numeric', 'digits', 'adjustment'])
            this.bind_property(prop, this.#spin, prop, GObject.BindingFlags.SYNC_CREATE);

        this.bind_property(
            'value',
            this.#spin,
            'value',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.set_activatable(true);
        this.set_activatable_widget(this.#spin);

        if (this.add_suffix)
            this.add_suffix(this.#spin);
        else
            this.add(this.#spin);
    }
};

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

export class ScaleRow extends ActionRow {
    static [GObject.GTypeName] = 'DDTermScaleRow';

    static [GObject.properties] = {
        'adjustment': GObject.ParamSpec.object(
            'adjustment',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gtk.Adjustment
        ),
        'round-digits': GObject.ParamSpec.int(
            'round-digits',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            -1,
            GLib.MAXINT32,
            -1
        ),
        'digits': GObject.ParamSpec.int(
            'digits',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            -1,
            32,
            1
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #scale;

    constructor(params) {
        super(params);

        this.#scale = new Gtk.Scale({
            visible: true,
            hexpand: true,
            valign: Gtk.Align.CENTER,
            draw_value: true,
        });

        for (const prop of ['round-digits', 'digits', 'adjustment'])
            this.bind_property(prop, this.#scale, prop, GObject.BindingFlags.SYNC_CREATE);

        this.set_activatable(true);
        this.set_activatable_widget(this.#scale);

        if (this.add_suffix)
            this.add_suffix(this.#scale);
        else
            this.add(this.#scale);
    }

    set_format_value_func(formatter) {
        if (this.#scale.set_format_value_func)
            this.#scale.set_format_value_func(formatter);
        else
            this.#scale.connect('format-value', formatter);
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

    add_switch_row({ key, flags = Gio.SettingsBindFlags.DEFAULT, ...params }) {
        const row = new SwitchRow({
            visible: true,
            use_underline: true,
            ...params,
        });

        this.settings.bind(key, row, 'active', flags);
        this.add(row);

        return row;
    }

    add_combo_text_row({ key, model, flags = Gio.SettingsBindFlags.DEFAULT, ...params }) {
        if (model && !(model instanceof GObject.Object))
            model = ComboTextItem.create_list(model);

        const row = new ComboTextRow({
            visible: true,
            use_underline: true,
            ...params,
        });

        row.bind_name_model(model);

        this.settings.bind(key, row, 'value', flags);
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

    add_widget(widget_type, extra_properties = {}) {
        const widget = new widget_type({
            settings: this.settings,
            gettext_domain: this.gettext_domain,
            visible: true,
            ...extra_properties,
        });

        const group = new AdwOrHdy.PreferencesGroup({
            title: widget.title,
            visible: true,
        });

        group.add(widget);
        this.add(group);

        return widget;
    }
}
