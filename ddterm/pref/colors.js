// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Lingfeng Zhang ccat3z
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import {
    ActionRow,
    ComboRow,
    PreferencesGroup,
    PreferencesRow,
    ScaleRow,
    StringList,
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

class Color extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermPrefsColorsColor';

    static [GObject.properties] = {
        'rgba': GObject.ParamSpec.boxed(
            'rgba',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gdk.RGBA
        ),
        'str': GObject.ParamSpec.string(
            'str',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            null
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #rgba = null;

    get rgba() {
        return this.#rgba;
    }

    set rgba(value) {
        if (this.#rgba?.equal(value))
            return;

        this.#rgba = value;
        this.notify('rgba');
        this.notify('str');
    }

    get str() {
        return this.rgba?.to_string() ?? null;
    }

    set str(value) {
        this.rgba = parse_rgba(value);
    }
}

class ColorScheme extends GObject.Object {
    static [GObject.GTypeName] = 'DDTermPrefsColorsColorScheme';

    static [GObject.properties] = {
        'active-preset': GObject.ParamSpec.uint(
            'active-preset',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            0,
            GLib.MAXUINT32,
            0
        ),
        'presets': GObject.ParamSpec.jsobject(
            'presets',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY
        ),
        'strv': GObject.ParamSpec.boxed(
            'strv',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            GObject.type_from_name('GStrv')
        ),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(params);

        this.colors = Array.from(
            { length: this.presets[0].length },
            () => new Color()
        );

        const weak = new WeakRef(this);

        for (const color of this.colors) {
            color.connect(
                'notify::str',
                ColorScheme.#weak_notify.bind(globalThis, weak, 'strv')
            );

            color.connect(
                'notify::rgba',
                ColorScheme.#weak_notify.bind(globalThis, weak, 'active-preset')
            );
        }
    }

    static #weak_notify(weakref, property) {
        weakref.deref()?.notify(property);
    }

    get active_preset() {
        return this.presets.findIndex(preset => preset.every(
            (rgba, index) => this.colors[index].rgba?.equal(rgba)
        ));
    }

    set active_preset(index) {
        this.freeze_notify();

        try {
            this.presets[index].forEach((rgba, color_index) => {
                this.colors[color_index].rgba = rgba;
            });
        } finally {
            this.thaw_notify();
        }
    }

    get strv() {
        return this.colors.map(color => color.str);
    }

    set strv(value) {
        this.freeze_notify();

        try {
            value.forEach((str, index) => {
                this.colors[index].str = str;
            });
        } finally {
            this.thaw_notify();
        }
    }
}

class ColorRow extends ActionRow {
    static [GObject.GTypeName] = 'DDTermColorRow';

    static [GObject.properties] = {
        'rgba': GObject.ParamSpec.boxed(
            'rgba',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gdk.RGBA
        ),
    };

    static {
        GObject.registerClass(this);
    }

    #button;

    constructor(params) {
        super(params);

        this.#button = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            can_focus: false,
            visible: true,
        });

        if (!this.rgba)
            this.rgba = this.#button.rgba;

        this.bind_property(
            'rgba',
            this.#button,
            'rgba',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.set_activatable(true);
        this.set_activatable_widget(this.#button);

        if (this.add_suffix)
            this.add_suffix(this.#button);
        else
            this.add(this.#button);
    }

    static create({ color, ...params }) {
        const row = new this({
            visible: true,
            use_underline: true,
            ...params,
        });

        color.bind_property(
            'rgba',
            row,
            'rgba',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        return row;
    }
}

export class ColorsGroup extends PreferencesGroup {
    static [GObject.GTypeName] = 'DDTermColorsPreferencesGroup';

    static {
        GObject.registerClass(this);
    }

    #color_scheme;
    #color_scheme_combo;
    #foreground_color_row;
    #background_color_row;
    #bold_color;
    #bold_color_expander;
    #cursor_foreground_color;
    #cursor_background_color;
    #cursor_color_expander;
    #highlight_foreground_color;
    #highlight_background_color;
    #highlight_color_expander;
    #palette;
    #copy_gnome_terminal_profile_button;

    constructor(params) {
        super(params);

        this.title = this.gettext('Colors');

        this.add_combo_text_row({
            key: 'theme-variant',
            title: this.gettext('Theme _Variant'),
            model: {
                system: this.gettext('Default'),
                light: this.gettext('Light'),
                dark: this.gettext('Dark'),
            },
        });

        this.add_switch_row({
            key: 'use-theme-colors',
            title: this.gettext('Use Colors From System _Theme'),
        });

        const color_scheme_presets = {
            [this.gettext('Black on light yellow')]: [parse_rgba('#000000'), parse_rgba('#ffffdd')],
            [this.gettext('Black on white')]: [parse_rgba('#000000'), parse_rgba('#ffffff')],
            [this.gettext('Gray on black')]: [parse_rgba('#aaaaaa'), parse_rgba('#000000')],
            [this.gettext('Green on black')]: [parse_rgba('#00ff00'), parse_rgba('#000000')],
            [this.gettext('White on black')]: [parse_rgba('#ffffff'), parse_rgba('#000000')],
            [this.gettext('GNOME light')]: [parse_rgba('#171421'), parse_rgba('#ffffff')],
            [this.gettext('GNOME dark')]: [parse_rgba('#d0cfcc'), parse_rgba('#171421')],
            [this.gettext('Tango light')]: [parse_rgba('#2e3436'), parse_rgba('#eeeeec')],
            [this.gettext('Tango dark')]: [parse_rgba('#d3d7cf'), parse_rgba('#2e3436')],
            [this.gettext('Solarized light')]: [parse_rgba('#657b83'), parse_rgba('#fdf6e3')],
            [this.gettext('Solarized dark')]: [parse_rgba('#839496'), parse_rgba('#002b36')],
            [this.gettext('Custom')]: [],
        };

        this.#color_scheme = new ColorScheme({
            presets: Object.values(color_scheme_presets),
        });

        this.settings.bind(
            'foreground-color',
            this.#color_scheme.colors[0],
            'str',
            Gio.SettingsBindFlags.DEFAULT
        );

        this.settings.bind(
            'background-color',
            this.#color_scheme.colors[1],
            'str',
            Gio.SettingsBindFlags.DEFAULT
        );

        this.#color_scheme_combo = new ComboRow({
            visible: true,
            title: this.gettext('Color _Scheme'),
            use_underline: true,
        });

        this.#color_scheme_combo.bind_name_model(
            StringList.new(Object.keys(color_scheme_presets)),
            v => v.string
        );

        this.#color_scheme.bind_property(
            'active-preset',
            this.#color_scheme_combo,
            'selected',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.add(this.#color_scheme_combo);

        this.#foreground_color_row = ColorRow.create({
            title: this.gettext('Foreground Color'),
            color: this.#color_scheme.colors[0],
        });

        this.add(this.#foreground_color_row);

        this.#background_color_row = ColorRow.create({
            title: this.gettext('Background Color'),
            color: this.#color_scheme.colors[1],
        });

        this.add(this.#background_color_row);

        this.#bold_color_expander = this.add_expander_row({
            key: 'bold-color-same-as-fg',
            title: this.gettext('Bold Color'),
            flags: Gio.SettingsBindFlags.NO_SENSITIVITY | Gio.SettingsBindFlags.INVERT_BOOLEAN,
        });

        this.#bold_color = new Color();
        this.settings.bind('bold-color', this.#bold_color, 'str', Gio.SettingsBindFlags.DEFAULT);

        const bold_color_row = ColorRow.create({
            title: this.gettext('Bold Color'),
            color: this.#bold_color,
        });

        this.settings.bind_writable('bold-color', bold_color_row, 'sensitive', false);
        this.#bold_color_expander.add_row(bold_color_row);

        this.#cursor_color_expander = this.add_expander_row({
            key: 'cursor-colors-set',
            title: this.gettext('Cursor Color'),
            flags: Gio.SettingsBindFlags.NO_SENSITIVITY,
        });

        this.#cursor_foreground_color = new Color();
        this.#cursor_background_color = new Color();

        this.settings.bind(
            'cursor-foreground-color',
            this.#cursor_foreground_color,
            'str',
            Gio.SettingsBindFlags.DEFAULT
        );

        this.settings.bind(
            'cursor-background-color',
            this.#cursor_background_color,
            'str',
            Gio.SettingsBindFlags.DEFAULT
        );

        const cursor_foreground_color_row = ColorRow.create({
            title: this.gettext('Cursor Foreground Color'),
            color: this.#cursor_foreground_color,
        });

        const cursor_background_color_row = ColorRow.create({
            title: this.gettext('Cursor Background Color'),
            color: this.#cursor_background_color,
        });

        this.settings.bind_writable(
            'cursor-foreground-color',
            cursor_foreground_color_row,
            'sensitive',
            false
        );

        this.settings.bind_writable(
            'cursor-background-color',
            cursor_background_color_row,
            'sensitive',
            false
        );

        this.#cursor_color_expander.add_row(cursor_foreground_color_row);
        this.#cursor_color_expander.add_row(cursor_background_color_row);

        this.#highlight_color_expander = this.add_expander_row({
            key: 'highlight-colors-set',
            title: this.gettext('Highlight Color'),
            flags: Gio.SettingsBindFlags.NO_SENSITIVITY,
        });

        this.#highlight_foreground_color = new Color();
        this.#highlight_background_color = new Color();

        this.settings.bind(
            'highlight-foreground-color',
            this.#highlight_foreground_color,
            'str',
            Gio.SettingsBindFlags.DEFAULT
        );

        this.settings.bind(
            'highlight-background-color',
            this.#highlight_background_color,
            'str',
            Gio.SettingsBindFlags.DEFAULT
        );

        const highlight_foreground_color_row = ColorRow.create({
            title: this.gettext('Highlight Foreground Color'),
            color: this.#highlight_foreground_color,
        });

        const highlight_background_color_row = ColorRow.create({
            title: this.gettext('Highlight Background Color'),
            color: this.#highlight_background_color,
        });

        this.settings.bind_writable(
            'highlight-foreground-color',
            highlight_foreground_color_row,
            'sensitive',
            false
        );

        this.settings.bind_writable(
            'highlight-background-color',
            highlight_background_color_row,
            'sensitive',
            false
        );

        this.#highlight_color_expander.add_row(highlight_foreground_color_row);
        this.#highlight_color_expander.add_row(highlight_background_color_row);

        const opacity_adjustment = new Gtk.Adjustment({
            upper: 1,
            step_increment: 0.01,
            page_increment: 0.10,
        });

        this.settings.bind(
            'background-opacity',
            opacity_adjustment,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        const opacity_row = new ScaleRow({
            adjustment: opacity_adjustment,
            digits: 2,
            round_digits: 2,
            visible: true,
            use_underline: true,
            title: this.gettext('_Background Opacity'),
        });

        const percent_format = new Intl.NumberFormat(undefined, { style: 'percent' });
        opacity_row.set_format_value_func((_, v) => percent_format.format(v));

        this.settings.bind_writable(
            'background-opacity',
            opacity_row,
            'sensitive',
            false
        );

        const opacity_expander = this.add_expander_row({
            key: 'transparent-background',
            title: this.gettext('Transparent Background'),
        });

        opacity_expander.add_row(opacity_row);

        const palette_presets = {
            [this.gettext('GNOME')]: [
                parse_rgba('#171421'),
                parse_rgba('#c01c28'),
                parse_rgba('#26a269'),
                parse_rgba('#a2734c'),
                parse_rgba('#12488b'),
                parse_rgba('#a347ba'),
                parse_rgba('#2aa1b3'),
                parse_rgba('#d0cfcc'),
                parse_rgba('#5e5c64'),
                parse_rgba('#f66151'),
                parse_rgba('#33d17a'),
                parse_rgba('#e9ad0c'),
                parse_rgba('#2a7bde'),
                parse_rgba('#c061cb'),
                parse_rgba('#33c7de'),
                parse_rgba('#ffffff'),
            ],
            [this.gettext('Tango')]: [
                parse_rgba('#2e3436'),
                parse_rgba('#cc0000'),
                parse_rgba('#4e9a06'),
                parse_rgba('#c4a000'),
                parse_rgba('#3465a4'),
                parse_rgba('#75507b'),
                parse_rgba('#06989a'),
                parse_rgba('#d3d7cf'),
                parse_rgba('#555753'),
                parse_rgba('#ef2929'),
                parse_rgba('#8ae234'),
                parse_rgba('#fce94f'),
                parse_rgba('#729fcf'),
                parse_rgba('#ad7fa8'),
                parse_rgba('#34e2e2'),
                parse_rgba('#eeeeec'),
            ],
            [this.gettext('Linux')]: [
                parse_rgba('#000000'),
                parse_rgba('#aa0000'),
                parse_rgba('#00aa00'),
                parse_rgba('#aa5500'),
                parse_rgba('#0000aa'),
                parse_rgba('#aa00aa'),
                parse_rgba('#00aaaa'),
                parse_rgba('#aaaaaa'),
                parse_rgba('#555555'),
                parse_rgba('#ff5555'),
                parse_rgba('#55ff55'),
                parse_rgba('#ffff55'),
                parse_rgba('#5555ff'),
                parse_rgba('#ff55ff'),
                parse_rgba('#55ffff'),
                parse_rgba('#ffffff'),
            ],
            [this.gettext('XTerm')]: [
                parse_rgba('#000000'),
                parse_rgba('#cd0000'),
                parse_rgba('#00cd00'),
                parse_rgba('#cdcd00'),
                parse_rgba('#0000ee'),
                parse_rgba('#cd00cd'),
                parse_rgba('#00cdcd'),
                parse_rgba('#e5e5e5'),
                parse_rgba('#7f7f7f'),
                parse_rgba('#ff0000'),
                parse_rgba('#00ff00'),
                parse_rgba('#ffff00'),
                parse_rgba('#5c5cff'),
                parse_rgba('#ff00ff'),
                parse_rgba('#00ffff'),
                parse_rgba('#ffffff'),
            ],
            [this.gettext('RXVT')]: [
                parse_rgba('#000000'),
                parse_rgba('#cd0000'),
                parse_rgba('#00cd00'),
                parse_rgba('#cdcd00'),
                parse_rgba('#0000cd'),
                parse_rgba('#cd00cd'),
                parse_rgba('#00cdcd'),
                parse_rgba('#faebd7'),
                parse_rgba('#404040'),
                parse_rgba('#ff0000'),
                parse_rgba('#00ff00'),
                parse_rgba('#ffff00'),
                parse_rgba('#0000ff'),
                parse_rgba('#ff00ff'),
                parse_rgba('#00ffff'),
                parse_rgba('#ffffff'),
            ],
            [this.gettext('Solarized')]: [
                parse_rgba('#073642'),
                parse_rgba('#dc322f'),
                parse_rgba('#859900'),
                parse_rgba('#b58900'),
                parse_rgba('#268bd2'),
                parse_rgba('#d33682'),
                parse_rgba('#2aa198'),
                parse_rgba('#eee8d5'),
                parse_rgba('#002b36'),
                parse_rgba('#cb4b16'),
                parse_rgba('#586e75'),
                parse_rgba('#657b83'),
                parse_rgba('#839496'),
                parse_rgba('#6c71c4'),
                parse_rgba('#93a1a1'),
                parse_rgba('#fdf6e3'),
            ],
            [this.gettext('Custom')]: [],
        };

        this.#palette = new ColorScheme({
            presets: Object.values(palette_presets),
        });

        this.settings.bind('palette', this.#palette, 'strv', Gio.SettingsBindFlags.DEFAULT);

        const palette_combo = new ComboRow({
            visible: true,
            title: this.gettext('_Palette'),
            use_underline: true,
        });

        palette_combo.bind_name_model(
            StringList.new(Object.keys(palette_presets)),
            v => v.string
        );

        this.#palette.bind_property(
            'active-preset',
            palette_combo,
            'selected',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
        );

        this.settings.bind_writable(
            'palette',
            palette_combo,
            'sensitive',
            false
        );

        this.add(palette_combo);

        const palette_layout = new Gtk.Grid({
            visible: true,
            column_homogeneous: true,
            row_spacing: 4,
        });

        const { colors } = this.#palette;

        for (let row = 0; row < colors.length; row++) {
            const start = row * 8;
            const end = Math.min(start + 8, colors.length);

            for (let col = 0; start + col < end; col++) {
                const color = colors[start + col];

                const button = new Gtk.ColorButton({
                    visible: true,
                    rgba: color.rgba,
                    halign: Gtk.Align.CENTER,
                });

                color.bind_property(
                    'rgba',
                    button,
                    'rgba',
                    GObject.BindingFlags.BIDIRECTIONAL
                );

                palette_layout.attach(button, col, row, 1, 1);
            }
        }

        const palette_row = new PreferencesRow({
            visible: true,
            child: palette_layout,
        });

        this.settings.bind_writable(
            'palette',
            palette_row,
            'sensitive',
            false
        );

        this.add(palette_row);

        this.add_switch_row({
            key: 'bold-is-bright',
            title: this.gettext('Show Bold Text in _Bright Colors'),
        });

        this.#copy_gnome_terminal_profile_button = new Gtk.Button({
            visible: true,
            label: this.gettext('Copy profile from GNOME Terminal'),
        });

        this.add(this.#copy_gnome_terminal_profile_button);

        this.connect('realize', this.#realize.bind(this));
    }

    #realize() {
        const update_sensitivity = this.#update_sensitivity.bind(this);

        const settings_handlers = [
            this.settings.connect('changed::use-theme-colors', update_sensitivity),
            this.settings.connect('writable-changed::foreground-color', update_sensitivity),
            this.settings.connect('writable-changed::background-color', update_sensitivity),
            this.settings.connect('writable-changed::bold-color-same-as-fg', update_sensitivity),
            this.settings.connect('writable-changed::cursor-colors-set', update_sensitivity),
            this.settings.connect('writable-changed::highlight-colors-set', update_sensitivity),
        ];

        const copy_profile_handler = this.#copy_gnome_terminal_profile_button.connect(
            'clicked',
            this.copy_gnome_terminal_profile.bind(this)
        );

        const unrealize_handler = this.connect('unrealize', () => {
            this.disconnect(unrealize_handler);

            for (const handler of settings_handlers)
                this.settings.disconnect(handler);

            this.#copy_gnome_terminal_profile_button.disconnect(copy_profile_handler);
        });

        this.#update_sensitivity();
    }

    #update_sensitivity() {
        const color_scheme_editable = !this.settings.get_boolean('use-theme-colors');

        this.#foreground_color_row.sensitive =
            color_scheme_editable && this.settings.is_writable('foreground-color');

        this.#background_color_row.sensitive =
            color_scheme_editable && this.settings.is_writable('background-color');

        this.#color_scheme_combo.sensitive =
            this.#foreground_color_row.sensitive && this.#background_color_row.sensitive;

        this.#bold_color_expander.sensitive =
            color_scheme_editable && this.settings.is_writable('bold-color-same-as-fg');

        this.#cursor_color_expander.sensitive =
            color_scheme_editable && this.settings.is_writable('cursor-colors-set');

        this.#highlight_color_expander.sensitive =
            color_scheme_editable && this.settings.is_writable('highlight-colors-set');
    }

    copy_gnome_terminal_profile() {
        try {
            copy_gnome_terminal_profile(this.settings);
        } catch (e) {
            show_dialog(this.get_root ? this.get_root() : this.get_toplevel(), e.message);
        }
    }
}
