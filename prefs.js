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
                'theme_variant_combo',
                'window_above_check',
                'window_stick_check',
                'window_skip_pager_check',
                'window_skip_taskbar_check',
                'hide_when_focus_lost_check',
                'hide_window_on_esc_check',
                'tab_policy_combo',
                'expand_tabs_check',
                'show_tab_close_buttons_check',
                'show_new_tab_button_check',
                'show_tab_switcher_check',
                'show_tab_switch_hotkeys_check',
                'enable_shortcuts_check',
            ].concat(palette_widgets()),
            Properties: {
                'settings': GObject.ParamSpec.object('settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings),
            },
        },
        class PrefsWidget extends Gtk.Box {
            _init(params) {
                super._init(params);

                this.settings_bind('theme-variant', this.theme_variant_combo, 'active-id');
                this.settings_bind('window-above', this.window_above_check, 'active');
                this.settings_bind('window-stick', this.window_stick_check, 'active');
                this.settings_bind('window-skip-taskbar', this.window_skip_taskbar_check, 'active');
                this.settings_bind('window-skip-pager', this.window_skip_pager_check, 'active');
                this.settings_bind('hide-when-focus-lost', this.hide_when_focus_lost_check, 'active');
                this.settings_bind('hide-window-on-esc', this.hide_window_on_esc_check, 'active');

                this.settings_bind('tab-policy', this.tab_policy_combo, 'active-id');
                this.settings_bind('tab-expand', this.expand_tabs_check, 'active');
                this.settings_bind('tab-close-buttons', this.show_tab_close_buttons_check, 'active');
                this.settings_bind('new-tab-button', this.show_new_tab_button_check, 'active');
                this.settings_bind('tab-switcher-popup', this.show_tab_switcher_check, 'active');
                this.settings_bind('show-tab-switch-hotkeys', this.show_tab_switch_hotkeys_check, 'active');

                this.settings_bind('custom-font', this.font_chooser, 'font');
                this.settings_bind('use-system-font', this.custom_font_check, 'active', Gio.SettingsBindFlags.INVERT_BOOLEAN);
                this.bind_sensitive('use-system-font', this.font_chooser.parent, true);
                this.settings_bind('text-blink-mode', this.text_blink_mode_combo, 'active-id');
                this.settings_bind('cursor-blink-mode', this.cursor_blink_mode_combo, 'active-id');
                this.settings_bind('cursor-shape', this.cursor_shape_combo, 'active-id');
                this.settings_bind('allow-hyperlink', this.allow_hyperlink_check, 'active');
                this.settings_bind('audible-bell', this.audible_bell_check, 'active');

                this.bind_color('foreground-color', this.foreground_color);
                this.bind_color('background-color', this.background_color);

                this.bind_color('bold-color', this.bold_color);
                this.settings_bind('bold-color-same-as-fg', this.bold_color_check, 'active', Gio.SettingsBindFlags.INVERT_BOOLEAN);
                this.bind_sensitive('bold-color-same-as-fg', this.bold_color.parent, true);

                this.bind_color('cursor-foreground-color', this.cursor_foreground_color);
                this.bind_color('cursor-background-color', this.cursor_background_color);
                this.settings_bind('cursor-colors-set', this.cursor_color_check, 'active');
                this.bind_sensitive('cursor-colors-set', this.cursor_foreground_color.parent);
                this.bind_sensitive('cursor-colors-set', this.cursor_background_color.parent);

                this.bind_color('highlight-foreground-color', this.highlight_foreground_color);
                this.bind_color('highlight-background-color', this.highlight_background_color, 'highlight-colors-set');
                this.settings_bind('highlight-colors-set', this.highlight_color_check, 'active');
                this.bind_sensitive('highlight-colors-set', this.highlight_foreground_color.parent);
                this.bind_sensitive('highlight-colors-set', this.highlight_background_color.parent);

                this.settings_bind('background-opacity', this.opacity_adjustment, 'value');

                this.settings_bind('use-theme-colors', this.theme_colors_check, 'active');
                this.bind_sensitive('use-theme-colors', this.color_scheme_editor, true);

                this.setting_color_scheme = false;
                this.settings_connect('foreground-color', this.update_builtin_color_scheme.bind(this));
                this.settings_connect('background-color', this.update_builtin_color_scheme.bind(this));
                this.update_builtin_color_scheme();
                this.color_scheme_combo.connect('changed', this.set_builtin_color_scheme.bind(this));

                this.settings_connect('palette', this.load_palette_from_settings.bind(this));
                this.load_palette_from_settings();
                this.palette_combo.connect('changed', this.load_builtin_palette.bind(this));

                for (let i = 0; i < PALETTE_SIZE; i++)
                    this.palette_widget(i).connect('color-set', this.edit_palette.bind(this));

                this.settings_bind('bold-is-bright', this.bold_is_bright_check, 'active');

                const actions = Gio.SimpleActionGroup.new();
                actions.add_action(this.settings.create_action('command'));
                this.insert_action_group('settings', actions);

                this.settings_bind('custom-command', this.custom_command_entry, 'text');
                this.spawn_custom_command.bind_property('active', this.custom_command_entry.parent, 'sensitive', GObject.BindingFlags.SYNC_CREATE);

                this.settings_bind('show-scrollbar', this.show_scrollbar_check, 'active');
                this.settings_bind('scroll-on-output', this.scroll_on_output_check, 'active');
                this.settings_bind('scroll-on-keystroke', this.scoll_on_keystroke_check, 'active');
                this.settings_bind('scrollback-unlimited', this.limit_scrollback_check, 'active', Gio.SettingsBindFlags.INVERT_BOOLEAN);
                this.settings_bind('scrollback-lines', this.scrollback_adjustment, 'value');
                this.bind_sensitive('scrollback-unlimited', this.scrollback_spin.parent, true);

                for (let [ok, i] = this.shortcuts_list.get_iter_first(); ok && this.shortcuts_list.iter_next(i);) {
                    const settings_key = this.shortcuts_list.get_value(i, 0);
                    this.settings_connect(settings_key, this.update_shortcuts_from_settings.bind(this));
                }
                this.update_shortcuts_from_settings();

                this.accel_renderer.connect('accel-edited', this.accel_edited.bind(this));
                this.accel_renderer.connect('accel-cleared', this.accel_cleared.bind(this));

                this.settings_bind('shortcuts-enabled', this.enable_shortcuts_check, 'active');
            }

            bind_sensitive(key, widget, invert = false) {
                let flags = Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY;

                if (invert)
                    flags |= Gio.SettingsBindFlags.INVERT_BOOLEAN;

                this.settings_bind(key, widget, 'sensitive', flags);
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

            bind_color(setting, widget) {
                widget.connect('color-set', () => {
                    this.settings.set_string(setting, widget.rgba.to_string());
                });

                const update = () => {
                    widget.set_rgba(parse_rgba(this.settings.get_string(setting)));
                };
                this.settings_connect(setting, update);
                update();

                const handler_id = this.settings.bind_writable(setting, widget, 'sensitive', false);
                this.connect('destroy', () => this.settings.disconnect(handler_id));
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

            update_shortcuts_from_settings(settings = null, changed_key = null) {
                if (settings === null)
                    settings = this.settings;

                let [ok, i] = this.shortcuts_list.get_iter_first();
                if (!ok)
                    return;

                do {
                    const action = this.shortcuts_list.get_value(i, 0);

                    if (changed_key && action !== changed_key)
                        continue;

                    const cur_accel_key = this.shortcuts_list.get_value(i, 2);
                    const cur_accel_mods = this.shortcuts_list.get_value(i, 3);

                    const shortcuts = settings.get_strv(action);
                    if (shortcuts && shortcuts.length) {
                        const [accel_key, accel_mods] = Gtk.accelerator_parse(shortcuts[0]);

                        if (cur_accel_key !== accel_key || cur_accel_mods !== accel_mods)
                            this.shortcuts_list.set(i, [2, 3], [accel_key, accel_mods]);
                    } else if (cur_accel_key !== 0 || cur_accel_mods !== 0) {
                        this.shortcuts_list.set(i, [2, 3], [0, 0]);
                    }
                } while (this.shortcuts_list.iter_next(i));
            }

            settings_bind(key, target, property, flags = Gio.SettingsBindFlags.DEFAULT) {
                this.settings.bind(key, target, property, flags);
                this.connect('destroy', () => Gio.Settings.unbind(target, property));
            }

            settings_connect(key, handler) {
                const handler_id = this.settings.connect(`changed::${key}`, handler);
                this.connect('destroy', () => this.settings.disconnect(handler_id));
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

    return widget;
}
