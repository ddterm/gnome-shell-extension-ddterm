'use strict';

/* exported init buildPrefsWidget createPrefsWidgetClass */

const { GObject, Gio, Gdk, Gtk } = imports.gi;

function parse_rgba(s) {
    if (!s)
        return null;

    const v = new Gdk.RGBA();

    if (v.parse(s))
        return v;

    return null;
}

var ColorConverter = GObject.registerClass(
    {
        Properties: {
            'target': GObject.ParamSpec.object('target', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gtk.ColorChooser),
            'rgba': GObject.ParamSpec.string('rgba', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY, null),
        },
    },
    class ColorConverter extends GObject.Object {
        _init(params) {
            super._init(params);

            this.target.connect('notify::rgba', () => this.notify('rgba'));
        }

        get rgba() {
            return this.target.rgba.to_string();
        }

        set rgba(value) {
            this.target.rgba = parse_rgba(value);
        }
    }
);

const PALETTE_SIZE = 16;

function palette_widget_id(i) {
    return `palette${i}`;
}

function palette_widgets() {
    const widgets = [];

    for (let i = 0; i < PALETTE_SIZE; i++)
        widgets.push(palette_widget_id(i));

    return widgets;
}

function createPrefsWidgetClass(resource_path) {
    return GObject.registerClass(
        {
            Template: resource_path.get_child('prefs.ui').get_uri(),
            Children: [
                'font_chooser',
                'custom_font_check',
                'opacity_adjustment',
                'accel_renderer',
                'shortcuts_list',
                'spawn_custom_command',
                'custom_command_entry',
                'show_scrollbar_check',
                'scroll_on_output_check',
                'scoll_on_keystroke_check',
                'limit_scrollback_check',
                'scrollback_adjustment',
                'scrollback_spin',
                'text_blink_mode_combo',
                'cursor_blink_mode_combo',
                'cursor_shape_combo',
                'allow_hyperlink_check',
                'audible_bell_check',
                'foreground_color',
                'background_color',
                'bold_color',
                'cursor_foreground_color',
                'cursor_background_color',
                'highlight_foreground_color',
                'highlight_background_color',
                'bold_color_check',
                'cursor_color_check',
                'highlight_color_check',
                'theme_colors_check',
                'color_scheme_editor',
                'color_scheme_combo',
                'palette_combo',
                'bold_is_bright_check',
            ].concat(palette_widgets()),
            Properties: {
                'settings': GObject.ParamSpec.object('settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings),
            },
        },
        class PrefsWidget extends Gtk.Notebook {
            _init(params) {
                super._init(params);

                this.settings.bind('custom-font', this.font_chooser, 'font', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('use-system-font', this.custom_font_check, 'active', Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.INVERT_BOOLEAN);
                this.settings.bind('use-system-font', this.font_chooser.parent, 'sensitive', Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY | Gio.SettingsBindFlags.INVERT_BOOLEAN);
                this.settings.bind('text-blink-mode', this.text_blink_mode_combo, 'active-id', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('cursor-blink-mode', this.cursor_blink_mode_combo, 'active-id', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('cursor-shape', this.cursor_shape_combo, 'active-id', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('allow-hyperlink', this.allow_hyperlink_check, 'active', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('audible-bell', this.audible_bell_check, 'active', Gio.SettingsBindFlags.DEFAULT);

                this.color_converters = [];
                this.bind_color('foreground-color', this.foreground_color);
                this.bind_color('background-color', this.background_color);
                this.bind_color('bold-color', this.bold_color, 'bold-color-same-as-fg', Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY | Gio.SettingsBindFlags.INVERT_BOOLEAN);
                this.bind_color('cursor-foreground-color', this.cursor_foreground_color, 'cursor-colors-set');
                this.bind_color('cursor-background-color', this.cursor_background_color, 'cursor-colors-set');
                this.bind_color('highlight-foreground-color', this.highlight_foreground_color, 'highlight-colors-set');
                this.bind_color('highlight-background-color', this.highlight_background_color, 'highlight-colors-set');

                this.settings.bind('bold-color-same-as-fg', this.bold_color_check, 'active', Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.INVERT_BOOLEAN);
                this.settings.bind('cursor-colors-set', this.cursor_color_check, 'active', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('highlight-colors-set', this.highlight_color_check, 'active', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('background-opacity', this.opacity_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

                this.settings.bind('use-theme-colors', this.theme_colors_check, 'active', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('use-theme-colors', this.color_scheme_editor, 'sensitive', Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY | Gio.SettingsBindFlags.INVERT_BOOLEAN);

                this.setting_color_scheme = false;
                this.settings.connect('changed::foreground-color', this.update_builtin_color_scheme.bind(this));
                this.settings.connect('changed::background-color', this.update_builtin_color_scheme.bind(this));
                this.update_builtin_color_scheme();
                this.color_scheme_combo.connect('changed', this.set_builtin_color_scheme.bind(this));

                this.settings.connect('changed::palette', this.load_palette_from_settings.bind(this));
                this.load_palette_from_settings();
                this.palette_combo.connect('changed', this.load_builtin_palette.bind(this));

                for (let i = 0; i < PALETTE_SIZE; i++)
                    this.palette_widget(i).connect('color-set', this.edit_palette.bind(this));

                this.settings.bind('bold-is-bright', this.bold_is_bright_check, 'active', Gio.SettingsBindFlags.DEFAULT);

                const actions = Gio.SimpleActionGroup.new();
                actions.add_action(this.settings.create_action('command'));
                this.insert_action_group('settings', actions);

                this.settings.bind('custom-command', this.custom_command_entry, 'text', Gio.SettingsBindFlags.DEFAULT);
                this.spawn_custom_command.bind_property('active', this.custom_command_entry.parent, 'sensitive', GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);

                this.settings.bind('show-scrollbar', this.show_scrollbar_check, 'active', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('scroll-on-output', this.scroll_on_output_check, 'active', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('scroll-on-keystroke', this.scoll_on_keystroke_check, 'active', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('scrollback-unlimited', this.limit_scrollback_check, 'active', Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.INVERT_BOOLEAN);
                this.settings.bind('scrollback-lines', this.scrollback_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('scrollback-unlimited', this.scrollback_spin.parent, 'sensitive', Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.INVERT_BOOLEAN | Gio.SettingsBindFlags.NO_SENSITIVITY);

                this.settings.connect('changed', this.update_shortcuts_from_settings.bind(this));
                this.update_shortcuts_from_settings();

                this.accel_renderer.connect('accel-edited', this.accel_edited.bind(this));
                this.accel_renderer.connect('accel-cleared', this.accel_cleared.bind(this));
            }

            palette_widget(i) {
                return this[palette_widget_id(i)];
            }

            load_palette_from_settings() {
                const palette = this.settings.get_strv('palette').map(parse_rgba);

                for (let i = 0; i < PALETTE_SIZE; i++)
                    this.palette_widget(i).rgba = palette[i];

                const model = this.palette_combo.model;
                const [ok, i] = model.get_iter_first();
                if (!ok)
                    return;

                do {
                    const builtin_palette = this.get_builtin_palette(i);
                    if (!builtin_palette || builtin_palette.every((v, j) => parse_rgba(v).equal(palette[j]))) {
                        this.palette_combo.set_active_iter(i);
                        break;
                    }
                } while (model.iter_next(i));
            }

            get_builtin_palette(iter) {
                const model = this.palette_combo.model;
                const palette = [];

                for (let i = 0; i < PALETTE_SIZE; i++)
                    palette.push(model.get_value(iter, i + 1));

                if (palette.every(e => !e))
                    return null;  // Custom palette

                return palette;
            }

            load_builtin_palette() {
                const [ok, active_iter] = this.palette_combo.get_active_iter();
                if (!ok)
                    return;

                const palette = this.get_builtin_palette(active_iter);

                if (palette)
                    this.settings.set_strv('palette', palette);
            }

            edit_palette() {
                const palette = [];

                for (let i = 0; i < PALETTE_SIZE; i++)
                    palette.push(this.palette_widget(i).rgba.to_string());

                this.settings.set_strv('palette', palette);
            }

            bind_color(setting, widget, enable_key = null, enable_bind_flags = Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY) {
                const converter = new ColorConverter({ target: widget });
                this.color_converters.push(converter);
                this.settings.bind(setting, converter, 'rgba', Gio.SettingsBindFlags.DEFAULT);

                if (enable_key)
                    this.settings.bind(enable_key, widget.parent, 'sensitive', enable_bind_flags);
            }

            set_builtin_color_scheme() {
                const [ok, active_iter] = this.color_scheme_combo.get_active_iter();
                if (!ok)
                    return;

                const foreground = this.color_scheme_combo.model.get_value(active_iter, 1);
                const background = this.color_scheme_combo.model.get_value(active_iter, 2);

                if (!foreground && !background)
                    return;

                try {
                    this.setting_color_scheme = true;
                    this.settings.set_string('foreground-color', foreground);
                    this.settings.set_string('background-color', background);
                } finally {
                    this.setting_color_scheme = false;
                }
            }

            update_builtin_color_scheme() {
                if (this.setting_color_scheme)
                    return;

                const [ok, i] = this.color_scheme_combo.model.get_iter_first();
                if (!ok)
                    return;

                const foreground = parse_rgba(this.settings.get_string('foreground-color'));
                const background = parse_rgba(this.settings.get_string('background-color'));

                do {
                    const i_foreground = parse_rgba(this.color_scheme_combo.model.get_value(i, 1));
                    const i_background = parse_rgba(this.color_scheme_combo.model.get_value(i, 2));

                    if (foreground !== null &&
                        background !== null &&
                        i_foreground !== null &&
                        i_background !== null &&
                        foreground.equal(i_foreground) &&
                        background.equal(i_background)
                    ) {
                        this.color_scheme_combo.set_active_iter(i);
                        return;
                    }

                    if (i_foreground === null && i_background === null) {
                        // Last - "Custom"
                        this.color_scheme_combo.set_active_iter(i);
                        return;
                    }
                } while (this.color_scheme_combo.model.iter_next(i));
            }

            accel_edited(_, path, accel_key, accel_mods) {
                const [ok, iter] = this.shortcuts_list.get_iter_from_string(path);
                if (!ok)
                    return;

                const action = this.shortcuts_list.get_value(iter, 0);
                this.settings.set_strv(action, [
                    Gtk.accelerator_name(accel_key, accel_mods),
                ]);
            }

            accel_cleared(_, path) {
                const [ok, iter] = this.shortcuts_list.get_iter_from_string(path);
                if (!ok)
                    return;

                const action = this.shortcuts_list.get_value(iter, 0);
                this.settings.set_strv(action, []);
            }

            update_shortcuts_from_settings() {
                let [ok, i] = this.shortcuts_list.get_iter_first();
                if (ok) {
                    do {
                        const action = this.shortcuts_list.get_value(i, 0);

                        const cur_accel_key = this.shortcuts_list.get_value(i, 2);
                        const cur_accel_mods = this.shortcuts_list.get_value(i, 3);

                        const shortcuts = this.settings.get_strv(action);
                        if (shortcuts && shortcuts.length) {
                            const [accel_key, accel_mods] = Gtk.accelerator_parse(shortcuts[0]);

                            if (cur_accel_key !== accel_key || cur_accel_mods !== accel_mods)
                                this.shortcuts_list.set(i, [2, 3], [accel_key, accel_mods]);
                        } else if (cur_accel_key !== 0 || cur_accel_mods !== 0) {
                            this.shortcuts_list.set(i, [2, 3], [0, 0]);
                        }
                    } while (this.shortcuts_list.iter_next(i));
                }
            }
        }
    );
}

function init() {}

let prefsWidgetClass = null;

function buildPrefsWidget() {
    const Me = imports.misc.extensionUtils.getCurrentExtension();

    if (prefsWidgetClass === null)
        prefsWidgetClass = createPrefsWidgetClass(Me.dir);

    const settings = imports.misc.extensionUtils.getSettings();

    const widget = new prefsWidgetClass({
        settings,
    });

    widget.connect('destroy', () => settings.run_dispose());

    return widget;
}
