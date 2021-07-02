/*
    Copyright © 2020, 2021 Aleksandr Mezin

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

/* exported init buildPrefsWidget createPrefsWidgetClass */

const { GLib, GObject, Gdk, Gio, Gtk } = imports.gi;

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

function accelerator_parse(accel) {
    const parsed = Gtk.accelerator_parse(accel);

    if (Gtk.get_major_version() === 3)
        return parsed;

    return parsed.slice(1);
}

function rgba_equal(a, b) {
    return a !== null && b !== null && a.equal(b);
}

const PERCENT_FORMAT = new Intl.NumberFormat(undefined, { style: 'percent' });

function format_scale_value_percent(scale, value) {
    return PERCENT_FORMAT.format(value);
}

function createPrefsWidgetClass(resource_path, util) {
    const cls = GObject.registerClass(
        {
            Template: resource_path.get_child(`prefs-gtk${Gtk.get_major_version()}.ui`).get_uri(),
            Children: [
                'font_chooser',
                'custom_font_check',
                'opacity_adjustment',
                'opacity_scale',
                'accel_renderer',
                'global_accel_renderer',
                'shortcuts_list',
                'global_shortcuts_list',
                'spawn_user_shell',
                'spawn_user_shell_login',
                'spawn_custom_command',
                'custom_command_entry',
                'limit_scrollback_check',
                'scrollback_adjustment',
                'scrollback_spin',
                'text_blink_mode_combo',
                'cursor_blink_mode_combo',
                'cursor_shape_combo',
                'detect_urls_container',
                'foreground_color',
                'background_color',
                'bold_color',
                'cursor_foreground_color',
                'cursor_background_color',
                'highlight_foreground_color',
                'highlight_background_color',
                'bold_color_check',
                'color_scheme_editor',
                'color_scheme_combo',
                'palette_combo',
                'theme_variant_combo',
                'tab_policy_combo',
                'tab_position_combo',
                'backspace_binding_combo',
                'delete_binding_combo',
                'ambiguous_width_combo',
                'reset_compatibility_button',
                'tab_title_template_buffer',
                'reset_tab_title_button',
                'window_type_hint_combo',
                'window_size_adjustment',
                'window_size_scale',
                'window_pos_combo',
                'shortcuts_treeview',
                'show_animation_combo',
                'hide_animation_combo',
                'panel_icon_type_combo',
                'window_monitor_current_radio',
                'window_monitor_primary_radio',
                'window_monitor_focus_radio',
                'window_monitor_connector_radio',
                'monitor_combo',
            ].concat(palette_widgets()),
            Properties: {
                'settings': GObject.ParamSpec.object('settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings),
            },
        },
        class PrefsWidget extends Gtk.Box {
            _init(params) {
                super._init(params);

                const actions = Gio.SimpleActionGroup.new();
                [
                    'window-above',
                    'window-stick',
                    'window-skip-taskbar',
                    'override-window-animation',
                    'hide-when-focus-lost',
                    'hide-window-on-esc',
                    'pointer-autohide',
                    'force-x11-gdk-backend',
                    'tab-expand',
                    'tab-close-buttons',
                    'new-tab-button',
                    'new-tab-front-button',
                    'tab-switcher-popup',
                    'allow-hyperlink',
                    'audible-bell',
                    'cursor-colors-set',
                    'highlight-colors-set',
                    'use-theme-colors',
                    'bold-is-bright',
                    'show-scrollbar',
                    'scroll-on-output',
                    'scroll-on-keystroke',
                    'shortcuts-enabled',
                    'window-resizable',
                    'detect-urls',
                    'detect-urls-as-is',
                    'detect-urls-file',
                    'detect-urls-http',
                    'detect-urls-voip',
                    'detect-urls-email',
                    'detect-urls-news-man',
                    'preserve-working-directory',
                    'transparent-background',
                ].forEach(
                    key => actions.add_action(this.settings.create_action(key))
                );
                this.insert_action_group('settings', actions);

                this.settings_bind('theme-variant', this.theme_variant_combo, 'active-id');
                this.settings_bind('show-animation', this.show_animation_combo, 'active-id');
                this.bind_sensitive('override-window-animation', this.show_animation_combo.parent);
                this.settings_bind('hide-animation', this.hide_animation_combo, 'active-id');
                this.bind_sensitive('override-window-animation', this.hide_animation_combo.parent);
                this.settings_bind('window-type-hint', this.window_type_hint_combo, 'active-id');
                this.settings_bind('window-position', this.window_pos_combo, 'active-id');
                this.settings_bind('panel-icon-type', this.panel_icon_type_combo, 'active-id');

                this.display_config_proxy = Gio.DBusProxy.new_for_bus_sync(
                    Gio.BusType.SESSION,
                    Gio.DBusProxyFlags.NONE,
                    null,
                    'org.gnome.Mutter.DisplayConfig',
                    '/org/gnome/Mutter/DisplayConfig',
                    'org.gnome.Mutter.DisplayConfig',
                    null
                );
                this.signal_connect(this.display_config_proxy, 'g-signal', (proxy, sender_name, signal_name) => {
                    if (signal_name === 'MonitorsChanged')
                        this.fill_monitors_combo();
                });
                this.fill_monitors_combo();

                this.setup_radio('window-monitor', 'current', this.window_monitor_current_radio);
                this.setup_radio('window-monitor', 'primary', this.window_monitor_primary_radio);
                this.setup_radio('window-monitor', 'focus', this.window_monitor_focus_radio);
                this.setup_radio('window-monitor', 'connector', this.window_monitor_connector_radio);
                this.window_monitor_connector_radio.bind_property('active', this.monitor_combo.parent, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
                this.settings_bind('window-monitor-connector', this.monitor_combo, 'active-id');

                this.settings_bind('tab-policy', this.tab_policy_combo, 'active-id');
                this.settings_bind('tab-position', this.tab_position_combo, 'active-id');
                this.settings_bind('tab-title-template', this.tab_title_template_buffer, 'text');
                this.signal_connect(this.reset_tab_title_button, 'clicked', () => {
                    this.settings.reset('tab-title-template');
                });

                this.settings_bind('custom-font', this.font_chooser, 'font');
                this.settings_bind('use-system-font', this.custom_font_check, 'active', Gio.SettingsBindFlags.INVERT_BOOLEAN);
                this.bind_sensitive('use-system-font', this.font_chooser.parent, true);
                this.settings_bind('text-blink-mode', this.text_blink_mode_combo, 'active-id');
                this.settings_bind('cursor-blink-mode', this.cursor_blink_mode_combo, 'active-id');
                this.settings_bind('cursor-shape', this.cursor_shape_combo, 'active-id');
                this.bind_sensitive('detect-urls', this.detect_urls_container);

                this.bind_color('foreground-color', this.foreground_color);
                this.bind_color('background-color', this.background_color);

                this.bind_color('bold-color', this.bold_color);
                this.settings_bind('bold-color-same-as-fg', this.bold_color_check, 'active', Gio.SettingsBindFlags.INVERT_BOOLEAN);
                this.bind_sensitive('bold-color-same-as-fg', this.bold_color.parent, true);

                this.bind_color('cursor-foreground-color', this.cursor_foreground_color);
                this.bind_color('cursor-background-color', this.cursor_background_color);
                this.bind_sensitive('cursor-colors-set', this.cursor_foreground_color.parent);
                this.bind_sensitive('cursor-colors-set', this.cursor_background_color.parent);

                this.bind_color('highlight-foreground-color', this.highlight_foreground_color);
                this.bind_color('highlight-background-color', this.highlight_background_color, 'highlight-colors-set');
                this.bind_sensitive('highlight-colors-set', this.highlight_foreground_color.parent);
                this.bind_sensitive('highlight-colors-set', this.highlight_background_color.parent);

                this.settings_bind('background-opacity', this.opacity_adjustment, 'value');
                this.set_scale_value_format_percent(this.opacity_scale);
                this.bind_sensitive('transparent-background', this.opacity_scale.parent);
                this.settings_bind('window-size', this.window_size_adjustment, 'value');
                this.set_scale_value_format_percent(this.window_size_scale);

                this.bind_sensitive('use-theme-colors', this.color_scheme_editor, true);

                this.setting_color_scheme = false;
                this.method_handler(this.settings, 'changed::foreground-color', this.update_builtin_color_scheme);
                this.method_handler(this.settings, 'changed::background-color', this.update_builtin_color_scheme);
                this.update_builtin_color_scheme();
                this.method_handler(this.color_scheme_combo, 'changed', this.set_builtin_color_scheme);

                this.method_handler(this.settings, 'changed::palette', this.load_palette_from_settings);
                this.load_palette_from_settings();
                this.method_handler(this.palette_combo, 'changed', this.load_builtin_palette);

                for (let i = 0; i < PALETTE_SIZE; i++)
                    this.method_handler(this.palette_widget(i), 'color-set', this.edit_palette);

                this.settings_bind('custom-command', this.custom_command_entry, 'text');
                this.spawn_custom_command.bind_property('active', this.custom_command_entry.parent, 'sensitive', GObject.BindingFlags.SYNC_CREATE);

                this.setup_radio('command', 'user-shell', this.spawn_user_shell);
                this.setup_radio('command', 'user-shell-login', this.spawn_user_shell_login);
                this.setup_radio('command', 'custom-command', this.spawn_custom_command);

                this.settings_bind('scrollback-unlimited', this.limit_scrollback_check, 'active', Gio.SettingsBindFlags.INVERT_BOOLEAN);
                this.settings_bind('scrollback-lines', this.scrollback_adjustment, 'value');
                this.bind_sensitive('scrollback-unlimited', this.scrollback_spin.parent, true);

                this.settings_bind('backspace-binding', this.backspace_binding_combo, 'active-id');
                this.settings_bind('delete-binding', this.delete_binding_combo, 'active-id');
                this.settings_bind('cjk-utf8-ambiguous-width', this.ambiguous_width_combo, 'active-id');
                this.signal_connect(this.reset_compatibility_button, 'clicked', () => {
                    this.settings.reset('backspace-binding');
                    this.settings.reset('delete-binding');
                    this.settings.reset('cjk-utf8-ambiguous-width');
                });

                [this.shortcuts_list, this.global_shortcuts_list].forEach(shortcuts_list => {
                    const update_fn = this.update_shortcuts_from_settings.bind(this, shortcuts_list);
                    shortcuts_list.foreach((model, path, i) => {
                        const key = model.get_value(i, 0);
                        this.signal_connect(this.settings, `changed::${key}`, update_fn);
                        return false;
                    });
                    update_fn();
                });

                const save_app_shortcut = this.save_shortcut.bind(this, this.shortcuts_list);
                this.signal_connect(this.accel_renderer, 'accel-edited', save_app_shortcut);
                this.signal_connect(this.accel_renderer, 'accel-cleared', save_app_shortcut);

                const save_global_shortcut = this.save_shortcut.bind(this, this.global_shortcuts_list);
                this.signal_connect(this.global_accel_renderer, 'accel-edited', save_global_shortcut);
                this.signal_connect(this.global_accel_renderer, 'accel-cleared', save_global_shortcut);

                this.bind_sensitive('shortcuts-enabled', this.shortcuts_treeview);

                if (Gtk.get_major_version() === 3)
                    this.method_handler(this.global_accel_renderer, 'editing-started', this.grab_global_keys);
                else
                    this.method_handler(this.global_accel_renderer, 'editing-started', this.inhibit_system_shortcuts);
            }

            bind_sensitive(key, widget, invert = false) {
                let flags = Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY;

                if (invert)
                    flags |= Gio.SettingsBindFlags.INVERT_BOOLEAN;

                this.settings_bind(key, widget, 'sensitive', flags);
            }

            set_scale_value_format_percent(scale) {
                if (scale.set_format_value_func)
                    scale.set_format_value_func(format_scale_value_percent);
                else
                    this.signal_connect(scale, 'format-value', format_scale_value_percent);
            }

            palette_widget(i) {
                return this[palette_widget_id(i)];
            }

            load_palette_from_settings() {
                const palette = this.settings.get_strv('palette').map(util.parse_rgba);

                for (let i = 0; i < PALETTE_SIZE; i++)
                    this.palette_widget(i).rgba = palette[i];

                this.palette_combo.model.foreach((model, path, i) => {
                    const builtin_palette = this.get_builtin_palette(i);
                    if (!builtin_palette || builtin_palette.every((v, j) => rgba_equal(util.parse_rgba(v), palette[j]))) {
                        this.palette_combo.set_active_iter(i);
                        return true;
                    }
                    return false;
                });
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
                this.signal_connect(widget, 'color-set', () => {
                    this.settings.set_string(setting, widget.rgba.to_string());
                });

                const update = () => {
                    widget.set_rgba(util.parse_rgba(this.settings.get_string(setting)));
                };
                this.signal_connect(this.settings, `changed::${setting}`, update);
                update();

                this.settings.bind_writable(setting, widget, 'sensitive', false);
                this.run_on_destroy(
                    Gio.Settings.unbind.bind(null, widget, 'sensitive'),
                    widget
                );
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

                const foreground = util.parse_rgba(this.settings.get_string('foreground-color'));
                const background = util.parse_rgba(this.settings.get_string('background-color'));

                this.color_scheme_combo.model.foreach((model, path, i) => {
                    const i_foreground = util.parse_rgba(model.get_value(i, 1));
                    const i_background = util.parse_rgba(model.get_value(i, 2));

                    if (rgba_equal(foreground, i_foreground) &&
                        rgba_equal(background, i_background)
                    ) {
                        this.color_scheme_combo.set_active_iter(i);
                        return true;
                    }

                    if (i_foreground === null && i_background === null) {
                        // Last - "Custom"
                        this.color_scheme_combo.set_active_iter(i);
                        return true;
                    }

                    return false;
                });
            }

            save_shortcut(shortcuts_list, _, path, accel_key = null, accel_mods = null) {
                const [ok, iter] = shortcuts_list.get_iter_from_string(path);
                if (!ok)
                    return;

                const action = shortcuts_list.get_value(iter, 0);
                const key_names = accel_key ? [Gtk.accelerator_name(accel_key, accel_mods)] : [];
                this.settings.set_strv(action, key_names);
            }

            update_shortcuts_from_settings(shortcuts_list, settings = null, changed_key = null) {
                if (settings === null)
                    settings = this.settings;

                shortcuts_list.foreach((model, path, i) => {
                    const action = model.get_value(i, 0);

                    if (changed_key && action !== changed_key)
                        return false;

                    const shortcuts = settings.get_strv(action);
                    if (shortcuts && shortcuts.length) {
                        const [accel_key, accel_mods] = accelerator_parse(shortcuts[0]);
                        model.set(i, [2, 3], [accel_key, accel_mods]);
                    } else {
                        model.set(i, [2, 3], [0, 0]);
                    }

                    return false;
                });
            }

            grab_global_keys(cell_renderer, editable) {
                const display = this.window.get_display();
                const seat = display.get_default_seat();
                const status = seat.grab(this.window, Gdk.SeatCapabilities.KEYBOARD, false, null, null, null);
                if (status !== Gdk.GrabStatus.SUCCESS)
                    return;

                const handler_id = editable.connect(
                    'editing-done',
                    () => {
                        editable.disconnect(handler_id);
                        seat.ungrab();
                    }
                );
            }

            inhibit_system_shortcuts(cell_renderer, editable) {
                const toplevel = this.root.get_surface();
                toplevel.inhibit_system_shortcuts(null);

                const handler_id = editable.connect(
                    'editing-done',
                    () => {
                        editable.disconnect(handler_id);
                        toplevel.restore_system_shortcuts();
                    }
                );
            }

            setup_radio(setting, value, radio) {
                this.settings.bind_writable(setting, radio, 'sensitive', false);
                this.run_on_destroy(
                    Gio.Settings.unbind.bind(null, radio, 'sensitive'),
                    radio
                );

                const update_active = () => {
                    if (this.settings.get_string(setting) === value) {
                        if (!radio.active)
                            radio.active = true;
                    }
                };

                this.signal_connect(this.settings, `changed::${setting}`, update_active);
                update_active();

                this.signal_connect(radio, 'toggled', () => {
                    if (radio.active)
                        this.settings.set_string(setting, value);
                });
            }

            fill_monitors_combo() {
                const current_state = this.display_config_proxy.call_sync(
                    'GetCurrentState',
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null
                );

                const [serial_, monitors, logical_monitors_, properties_] = current_state.unpack();

                const prev_active_id = this.monitor_combo.active_id;
                this.monitor_combo.freeze_notify();

                try {
                    this.monitor_combo.remove_all();

                    for (let monitor_info of monitors.unpack()) {
                        const [ids, modes_, props] = monitor_info.unpack();
                        const [connector, vendor_, model, monitor_serial_] = ids.deep_unpack();
                        let display_name = props.deep_unpack()['display-name'];

                        if (display_name instanceof GLib.Variant)
                            display_name = display_name.unpack();

                        this.monitor_combo.append(connector, `${display_name} - ${model} (${connector})`);
                    }

                    this.monitor_combo.active_id = prev_active_id;
                } finally {
                    this.monitor_combo.thaw_notify();
                }
            }
        }
    );

    Object.assign(cls.prototype, util.UtilMixin);

    return cls;
}

function init() {}

let prefsWidgetClass = null;

function buildPrefsWidget() {
    const Me = imports.misc.extensionUtils.getCurrentExtension();

    if (prefsWidgetClass === null)
        prefsWidgetClass = createPrefsWidgetClass(Me.dir, Me.imports.util);

    const settings = imports.misc.extensionUtils.getSettings();

    const widget = new prefsWidgetClass({
        settings,
    });

    return widget;
}
