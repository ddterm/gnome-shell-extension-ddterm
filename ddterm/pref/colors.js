// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import {
    bind_property,
    bind_sensitive,
    bind_settings,
    bind_settings_writable,
    bind_widget,
    callback_stack,
    connect,
    insert_action_group,
    make_settings_actions,
    set_scale_value_format,
    ui_file_uri,
} from './util.js';

function show_dialog(parent_window, message, message_type = Gtk.MessageType.ERROR) {
    const dialog = new Gtk.MessageDialog({
        transient_for: parent_window,
        modal: true,
        buttons: Gtk.ButtonsType.CLOSE,
        message_type,
        text: message,
    });
    dialog.connect('response', () => dialog.destroy());
    dialog.show();
}

// Looks up a `Gio.SettingsSchema` with the identifier `schema_id`.
// Throw error if the schema does not exist.
function get_settings_schema(schema_id) {
    const schema_source = Gio.SettingsSchemaSource.get_default();
    const schema = schema_source.lookup(schema_id, true);
    if (schema === null)
        throw new Error(`Settings schema '${schema_id}' not found.`);
    return schema;
}

// Get key named `name` from `schema`.
// Throw error if the key does not exist.
function get_settings_schema_key(schema, name) {
    if (!schema.has_key(name))
        throw new Error(`Key '${name}' does not exist in settings schema '${schema.get_id()}'.`);

    return schema.get_key(name);
}

function copy_gnome_terminal_profile(settings) {
    // Lookup gnome terminal's setting schemas
    let profile_list_schema, profile_schema;
    try {
        profile_list_schema = get_settings_schema('org.gnome.Terminal.ProfilesList');
        profile_schema = get_settings_schema('org.gnome.Terminal.Legacy.Profile');
    } catch (e) {
        throw new Error(`${e.message} Probably, GNOME Terminal is not installed.`);
    }

    // Find default gnome terminal profile
    let profiles_list = Gio.Settings.new_full(profile_list_schema, null, null);
    let profilePath = profiles_list.settings_schema.get_path();
    let uuid = profiles_list.get_string('default');
    let gnome_terminal_profile = Gio.Settings.new_full(
        profile_schema,
        null,
        `${profilePath}:${uuid}/`
    );

    // Copy color profile
    try {
        const profile_keys = [
            'use-theme-colors',
            'foreground-color',
            'background-color',
            'bold-color-same-as-fg',
            'bold-color',
            'cursor-colors-set',
            'cursor-foreground-color',
            'cursor-background-color',
            'highlight-colors-set',
            'highlight-foreground-color',
            'highlight-background-color',
            'palette',
            'bold-is-bright',
        ];

        // Check if key is valid
        for (const key of profile_keys) {
            const type_gnome_terminal =
                get_settings_schema_key(profile_schema, key).get_value_type();

            const type_ddterm = settings.settings_schema.get_key(key).get_value_type();

            if (!type_gnome_terminal.equal(type_ddterm)) {
                throw new Error(
                    `The type of key '${key}' in GNOME Terminal is` +
                    ` '${type_gnome_terminal.dup_string()}',` +
                    ` but '${type_ddterm.dup_string()}' is expected.`
                );
            }
        }

        profile_keys.forEach(key => {
            settings.set_value(key, gnome_terminal_profile.get_value(key));
        });
    } catch (e) {
        throw new Error(`Failed to copy color profile from GNOME Terminal. ${e.message}`);
    }
}

function parse_rgba(str) {
    if (str) {
        const rgba = new Gdk.RGBA();

        if (rgba.parse(str))
            return rgba;
    }

    throw Error(`Cannot parse ${JSON.stringify(str)} as color`);
}

const Color = GObject.registerClass({
    Properties: {
        'rgba': GObject.ParamSpec.boxed(
            'rgba',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gdk.RGBA
        ),
        'str': GObject.ParamSpec.string(
            'str',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            null
        ),
    },
}, class DDTermPrefsColorsColor extends GObject.Object {
    _init(params) {
        this._rgba = null;

        super._init(params);
    }

    get rgba() {
        return this._rgba;
    }

    set rgba(value) {
        if (this._rgba && this._rgba.equal(value))
            return;

        this._rgba = value;
        this.notify('rgba');
        this.notify('str');
    }

    get str() {
        return this.rgba && this.rgba.to_string();
    }

    set str(value) {
        this.rgba = parse_rgba(value);
    }
});

const ColorScheme = GObject.registerClass({
    Properties: {
        'active-preset': GObject.ParamSpec.int(
            'active-preset',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            -1,
            GLib.MAXINT32,
            -1
        ),
        'presets': GObject.ParamSpec.object(
            'presets',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
            Gtk.TreeModel
        ),
        'strv': GObject.ParamSpec.boxed(
            'strv',
            '',
            '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            GObject.type_from_name('GStrv')
        ),
    },
}, class DDTermPrefsColorsColorScheme extends GObject.Object {
    _init(params) {
        super._init(params);

        this.colors = Array.from(
            { length: this.presets.get_n_columns() - 1 },
            () => new Color()
        );

        for (const color of this.colors) {
            color.connect('notify::str', () => this.notify('strv'));
            color.connect('notify::rgba', () => this.notify('active-preset'));
        }

        this._model_handlers = ['row-changed', 'row-deleted', 'row-inserted'].map(
            signal => this.presets.connect(signal, () => this.notify('active-preset'))
        );
    }

    get active_preset() {
        const rgbav = this.colors.map(color => color.rgba);
        let preset = -1;

        this.presets.foreach((model, path, iter) => {
            if (!this.preset_matches(iter, rgbav))
                return false;

            [preset] = path.get_indices();
            return true;
        });

        return preset;
    }

    set active_preset(value) {
        const [ok, iter] = this.presets.iter_nth_child(null, value);

        if (!ok)
            return;

        this.strv = Array.from(
            { length: this.presets.get_n_columns() - 1 },
            (_, index) => this.presets.get_value(iter, index + 1)
        );
    }

    get strv() {
        return this.colors.map(color => color.str);
    }

    set strv(value) {
        this.freeze_notify();
        try {
            value.forEach((str, index) => {
                if (str)
                    this.colors[index].str = str;
            });
        } finally {
            this.thaw_notify();
        }
    }

    destroy() {
        for (const handler_id of this._model_handlers)
            this.presets.disconnect(handler_id);

        this._model_handlers = [];
    }

    preset_matches(iter, rgbav) {
        return rgbav.every((rgba, index) => {
            if (!rgba)
                return true;

            const model_str = this.presets.get_value(iter, index + 1);
            return !model_str || rgba.equal(parse_rgba(model_str));
        });
    }
});

const PALETTE_WIDGET_IDS = Array.from({ length: 16 }, (_, i) => `palette${i}`);

export const ColorsWidget = GObject.registerClass({
    GTypeName: 'DDTermPrefsColors',
    Template: ui_file_uri('prefs-colors.ui'),
    Children: [
        'theme_variant_combo',
        'color_scheme_editor',
        'color_scheme_combo',
        'foreground_color',
        'background_color',
        'opacity_scale',
        'bold_color',
        'cursor_foreground_color',
        'cursor_background_color',
        'highlight_foreground_color',
        'highlight_background_color',
        'palette_combo',
        'bold_color_check',
    ].concat(PALETTE_WIDGET_IDS),
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
}, class PrefsColors extends Gtk.Grid {
    _init(params) {
        super._init(params);

        const percent_format = new Intl.NumberFormat(undefined, { style: 'percent' });
        set_scale_value_format(this.opacity_scale, percent_format);

        this.unbind_settings = callback_stack();
        this.connect_after('unrealize', this.unbind_settings);
        this.connect('realize', this.bind_settings.bind(this));
    }

    bind_settings() {
        this.unbind_settings();

        const actions = make_settings_actions(this.settings, [
            'cursor-colors-set',
            'highlight-colors-set',
            'bold-is-bright',
            'use-theme-colors',
            'transparent-background',
        ]);

        const copy_from_gnome_terminal_action = new Gio.SimpleAction({
            name: 'copy-gnome-terminal-profile',
        });

        copy_from_gnome_terminal_action.connect('activate', () => {
            try {
                copy_gnome_terminal_profile(this.settings);
            } catch (e) {
                show_dialog(this.get_toplevel(), e.message);
            }
        });

        const aux_actions = new Gio.SimpleActionGroup();
        aux_actions.add_action(copy_from_gnome_terminal_action);

        this.color_scheme = new ColorScheme({
            presets: this.color_scheme_combo.model,
        });

        this.palette = new ColorScheme({
            presets: this.palette_combo.model,
        });

        this.unbind_settings.push(
            () => this.color_scheme.destroy(),
            () => this.palette.destroy(),

            insert_action_group(this, 'settings', actions),

            bind_widget(this.settings, 'theme-variant', this.theme_variant_combo),

            bind_sensitive(
                this.settings,
                'use-theme-colors',
                this.color_scheme_editor,
                true
            ),

            this.bind_color('foreground-color', this.foreground_color, this.color_scheme.colors[0]),
            this.bind_color('background-color', this.background_color, this.color_scheme.colors[1]),

            bind_property(
                this.color_scheme,
                'active-preset',
                this.color_scheme_combo,
                'active',
                GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
            ),

            connect(
                this.settings,
                'writable-changed::foreground-color',
                this.enable_color_scheme_combo.bind(this)
            ),
            connect(
                this.settings,
                'writable-changed::background-color',
                this.enable_color_scheme_combo.bind(this)
            ),

            bind_widget(this.settings, 'background-opacity', this.opacity_scale),
            bind_sensitive(this.settings, 'transparent-background', this.opacity_scale.parent),

            bind_widget(
                this.settings,
                'bold-color-same-as-fg',
                this.bold_color_check,
                Gio.SettingsBindFlags.INVERT_BOOLEAN
            ),

            this.bind_color('bold-color', this.bold_color),

            bind_sensitive(
                this.settings,
                'bold-color-same-as-fg',
                this.bold_color.parent,
                true
            ),

            this.bind_color('cursor-foreground-color', this.cursor_foreground_color),
            bind_sensitive(this.settings, 'cursor-colors-set', this.cursor_foreground_color),

            this.bind_color('cursor-background-color', this.cursor_background_color),
            bind_sensitive(this.settings, 'cursor-colors-set', this.cursor_background_color),

            this.bind_color('highlight-foreground-color', this.highlight_foreground_color),
            bind_sensitive(this.settings, 'highlight-colors-set', this.highlight_foreground_color),

            this.bind_color('highlight-background-color', this.highlight_background_color),
            bind_sensitive(this.settings, 'highlight-colors-set', this.highlight_background_color),

            bind_settings(
                this.settings,
                'palette',
                this.palette,
                'strv',
                Gio.SettingsBindFlags.NO_SENSITIVITY
            ),

            bind_settings_writable(
                this.settings,
                'palette',
                this.palette_combo,
                'sensitive',
                false
            ),

            bind_property(
                this.palette,
                'active-preset',
                this.palette_combo,
                'active',
                GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
            ),

            ...PALETTE_WIDGET_IDS.map(key => this[key]).map((widget, index) => {
                const unbind = callback_stack();

                unbind.push(
                    bind_settings_writable(this.settings, 'palette', widget, 'sensitive', false),
                    bind_property(
                        this.palette.colors[index],
                        'rgba',
                        widget,
                        'rgba',
                        GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
                    )
                );

                return unbind;
            }),

            insert_action_group(this, 'aux', aux_actions)
        );

        this.enable_color_scheme_combo();
    }

    get title() {
        return this.gettext_context.gettext('Colors');
    }

    bind_color(key, widget, color = null) {
        const unbind = callback_stack();

        if (!color) {
            color = new Color();

            // Prevent color object from being garbage collected while the widget is alive
            widget._bound_color = color;
        }

        unbind.push(
            bind_settings(this.settings, key, color, 'str', Gio.SettingsBindFlags.NO_SENSITIVITY),
            bind_property(
                color,
                'rgba',
                widget,
                'rgba',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE
            ),
            bind_settings_writable(this.settings, key, widget, 'sensitive', false)
        );

        return unbind;
    }

    enable_color_scheme_combo() {
        this.color_scheme_combo.sensitive =
            this.settings.is_writable('foreground-color') &&
            this.settings.is_writable('background-color');
    }
});
