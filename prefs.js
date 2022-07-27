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

/* exported init buildPrefsWidget PrefsWidget */

const { GLib, GObject, Gdk, Gio, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { rxjs } = Me.imports.rxjs;
const { rxutil, settings } = Me.imports;

const IS_GTK3 = Gtk.get_major_version() === 3;

const GVARIANT_FALSE = GLib.Variant.new_boolean(false);
const GVARIANT_BOOL = GVARIANT_FALSE.get_type();

const PALETTE_SIZE = 16;

function palette_widget_ids() {
    const widgets = [];

    for (let i = 0; i < PALETTE_SIZE; i++)
        widgets.push(`palette${i}`);

    return widgets;
}

const PALETTE_WIDGET_IDS = palette_widget_ids();

function accelerator_parse(accel) {
    const parsed = Gtk.accelerator_parse(accel);

    return IS_GTK3 ? parsed : parsed.slice(1);
}

function model_row(model, i) {
    const strv = [];

    for (let j = 0; j < model.get_n_columns(); j++)
        strv.push(model.get_value(i, j));

    return strv;
}

function is_custom_colors_row(row) {
    return row.every(v => !v);
}

function find_colors_in_model(model, colors) {
    if (!colors.every(v => v))
        return null;

    let [ok, iter] = model.get_iter_first();

    while (ok) {
        const row = model_row(model, iter).slice(1);

        if (is_custom_colors_row(row))
            return iter;

        if (row.map(settings.parse_rgba).every((v, j) => v && v.equal(colors[j])))
            return iter;

        ok = model.iter_next(iter);
    }

    return null;
}

function select_colors_in_combo(combo, colors) {
    const iter = find_colors_in_model(combo.model, colors);

    if (iter)
        combo.set_active_iter(iter);
}

function combo_active_iter(combo) {
    return rxutil.signal(combo, 'changed').pipe(
        rxjs.map(([sender]) => sender.get_active_iter()),
        rxjs.filter(([ok]) => ok),
        rxjs.map(([_, v]) => v)
    );
}

function combo_active_model_row(combo) {
    return combo_active_iter(combo).pipe(
        rxjs.map(iter => model_row(combo.model, iter))
    );
}

function palette_selector(combo) {
    return combo_active_model_row(combo).pipe(
        rxjs.map(row => row.slice(1)),
        rxjs.filter(row => !is_custom_colors_row(row)),
        rxjs.map(row => row.map(settings.parse_rgba))
    );
}

const PERCENT_FORMAT = new Intl.NumberFormat(undefined, { style: 'percent' });

function get_seconds_format() {
    try {
        return new Intl.NumberFormat(undefined, { style: 'unit', unit: 'second' });
    } catch {
        // Gnome 3.36 doesn't understand style: 'unit'
        return new class {
            format(v) {
                return `${v} sec`;
            }
        }();
    }
}

const SECONDS_FORMAT = get_seconds_format();

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

        return new rxjs.Observable(subscriber => {
            arg.subscribe({
                next(value) {
                    call(() => subscriber.next(value));
                },
                error(error) {
                    subscriber.error(error);
                },
                complete() {
                    subscriber.complete();
                },
            });
        });
    };
}

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

class DisplayConfig {
    constructor() {
        this.proxy = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.NONE,
            null,
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            'org.gnome.Mutter.DisplayConfig',
            null
        );

        this.config = rxutil.signal(this.proxy, 'g-signal').pipe(
            rxjs.filter(
                ([_proxy, _sender, signal_name]) => signal_name === 'MonitorsChanged'
            ),
            rxjs.startWith([this.proxy]),
            rxjs.switchMap(([proxy]) => {
                return new rxjs.Observable(observer => {
                    const cancellable = Gio.Cancellable.new();

                    proxy.call(
                        'GetCurrentState',
                        null,
                        Gio.DBusCallFlags.NONE,
                        -1,
                        cancellable,
                        (source, res) => {
                            try {
                                observer.next(source.call_finish(res).unpack());
                                observer.complete();
                            } catch (ex) {
                                observer.error(ex);
                            }
                        }
                    );

                    return () => cancellable.cancel();
                });
            }),
            settings.share()
        );

        this.monitors = this.config.pipe(
            rxjs.map(([_serial, monitor_list]) => Object.fromEntries(
                monitor_list.unpack().map(monitor => {
                    const [ids, modes_, props] = monitor.unpack();
                    const [connector, vendor_, model, monitor_serial_] = ids.deep_unpack();
                    let display_name = props.deep_unpack()['display-name'];

                    if (display_name instanceof GLib.Variant)
                        display_name = display_name.unpack();

                    return [connector, `${display_name} - ${model} (${connector})`];
                })
            ))
        );
    }
}

var PrefsWidget = GObject.registerClass(
    {
        GTypeName: 'DDTermPrefsWidget',
        Template: Me.dir.get_child(`prefs-gtk${Gtk.get_major_version()}.ui`).get_uri(),
        Children: [
            'stack',
            'font_chooser',
            'opacity_scale',
            'accel_renderer',
            'global_accel_renderer',
            'shortcuts_list',
            'global_shortcuts_list',
            'custom_command_entry',
            'scrollback_spin',
            'text_blink_mode_combo',
            'cursor_blink_mode_combo',
            'cursor_shape_combo',
            'foreground_color',
            'background_color',
            'bold_color',
            'cursor_foreground_color',
            'cursor_background_color',
            'highlight_foreground_color',
            'highlight_background_color',
            'color_scheme_combo',
            'palette_combo',
            'theme_variant_combo',
            'tab_policy_combo',
            'tab_position_combo',
            'tab_label_width_scale',
            'tab_label_ellipsize_combo',
            'backspace_binding_combo',
            'delete_binding_combo',
            'ambiguous_width_combo',
            'tab_title_template_text_view',
            'window_type_hint_combo',
            'window_size_scale',
            'window_pos_combo',
            'shortcuts_treeview',
            'show_animation_combo',
            'hide_animation_combo',
            'show_animation_duration_scale',
            'hide_animation_duration_scale',
            'panel_icon_type_combo',
            'monitor_combo',
        ].concat(PALETTE_WIDGET_IDS),
        Properties: {
            'settings': GObject.ParamSpec.object('settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, settings.Settings),
        },
    },
    class PrefsWidget extends Gtk.Box {
        _init(params) {
            super._init(params);

            this.rx = rxutil.scope(this);

            this.rx.subscribe(
                rxjs.combineLatest(
                    this.setting_editable('background-color'),
                    this.setting_editable('foreground-color')
                ).pipe(rxjs.map(v => v.every(rxjs.identity))),
                rxutil.property(this.color_scheme_combo, 'sensitive')
            );

            /*
                GtkRadioButton: always build the group around the last one.
                I. e. 'group' property of all buttons (except the last one)
                should point to the last one. Otherwise, settings-based action
                won't work correctly on Gtk 3.
            */
            this.insert_action_group('settings', this.make_actions([
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
                'notebook-border',
                'window-monitor',
                'command',
            ]));

            const invert_bool_variant = v => GLib.Variant.new_boolean(!v.unpack());

            this.insert_action_group('inverse-settings',
                this.make_actions(
                    [
                        'use-system-font',
                        'bold-color-same-as-fg',
                        'scrollback-unlimited',
                    ],
                    invert_bool_variant,
                    invert_bool_variant
                )
            );

            this.settings_widgets = {
                'theme-variant': this.theme_variant_combo,
                'show-animation': this.show_animation_combo,
                'hide-animation': this.hide_animation_combo,
                'window-type-hint': this.window_type_hint_combo,
                'window-position': this.window_pos_combo,
                'panel-icon-type': this.panel_icon_type_combo,
                'window-monitor-connector': this.monitor_combo,
                'tab-policy': this.tab_policy_combo,
                'tab-position': this.tab_position_combo,
                'text-blink-mode': this.text_blink_mode_combo,
                'cursor-blink-mode': this.cursor_blink_mode_combo,
                'cursor-shape': this.cursor_shape_combo,
                'backspace-binding': this.backspace_binding_combo,
                'delete-binding': this.delete_binding_combo,
                'cjk-utf8-ambiguous-width': this.ambiguous_width_combo,
                'tab-label-ellipsize-mode': this.tab_label_ellipsize_combo,

                'show-animation-duration': this.show_animation_duration_scale,
                'hide-animation-duration': this.hide_animation_duration_scale,
                'tab-label-width': this.tab_label_width_scale,
                'background-opacity': this.opacity_scale,
                'window-size': this.window_size_scale,
                'scrollback-lines': this.scrollback_spin,

                'tab-title-template': this.tab_title_template_text_view,
                'custom-command': this.custom_command_entry,

                'foreground-color': this.foreground_color,
                'background-color': this.background_color,
                'bold-color': this.bold_color,
                'cursor-foreground-color': this.cursor_foreground_color,
                'cursor-background-color': this.cursor_background_color,
                'highlight-foreground-color': this.highlight_foreground_color,
                'highlight-background-color': this.highlight_background_color,

                'custom-font': this.font_chooser,
            };

            this.rx.subscribe(new DisplayConfig().monitors, monitors => {
                this.monitor_combo.freeze_notify();

                try {
                    this.monitor_combo.remove_all();

                    for (let monitor of Object.entries(monitors))
                        this.monitor_combo.append(...monitor);

                    this.monitor_combo.active_id = this.settings['window-monitor-connector'].value;
                } finally {
                    this.monitor_combo.thaw_notify();
                }
            });

            Object.entries(this.settings_widgets).forEach(
                args => this.setup_widget(...args)
            );

            this.set_scale_value_format(this.show_animation_duration_scale, SECONDS_FORMAT);
            this.set_scale_value_format(this.hide_animation_duration_scale, SECONDS_FORMAT);
            this.set_scale_value_format(this.opacity_scale, PERCENT_FORMAT);
            this.set_scale_value_format(this.window_size_scale, PERCENT_FORMAT);
            this.set_scale_value_format(this.tab_label_width_scale, PERCENT_FORMAT);

            const color_scheme_guard = recursion_guard();

            this.rx.subscribe(
                rxjs.combineLatest(
                    this.settings['foreground-color'],
                    this.settings['background-color']
                ).pipe(color_scheme_guard),
                scheme => {
                    select_colors_in_combo(this.color_scheme_combo, scheme);
                }
            );

            this.rx.subscribe(
                palette_selector(this.color_scheme_combo).pipe(color_scheme_guard),
                row => {
                    this.settings['foreground-color'].value = row[0];
                    this.settings['background-color'].value = row[1];
                }
            );

            const palette_guard = recursion_guard();
            const palette_edit_guard = recursion_guard();
            const palette_widgets = PALETTE_WIDGET_IDS.map(v => this[v]);

            this.rx.subscribe(
                this.settings['palette'],
                palette => {
                    palette_edit_guard(() => {
                        palette_widgets.forEach((widget, i) => {
                            widget.rgba = palette[i];
                        });
                    });

                    palette_guard(() => {
                        select_colors_in_combo(this.palette_combo, palette);
                    });
                }
            );

            this.rx.subscribe(
                palette_selector(this.palette_combo).pipe(palette_guard),
                this.settings['palette']
            );

            const palette_colors = palette_widgets.map(
                widget => rxutil.property(widget, 'rgba')
            );

            this.rx.subscribe(
                rxjs.combineLatest(...palette_colors).pipe(palette_edit_guard),
                this.settings['palette']
            );

            [this.shortcuts_list, this.global_shortcuts_list].forEach(shortcuts_list => {
                shortcuts_list.foreach((model, path, i) => {
                    this.rx.subscribe(
                        this.settings[model.get_value(i, 0)],
                        shortcuts => {
                            if (shortcuts && shortcuts.length > 0)
                                model.set(i, [2, 3], accelerator_parse(shortcuts[0]));
                            else
                                model.set(i, [2, 3], [0, 0]);
                        }
                    );

                    return false;
                });
            });

            this.rx.subscribe(
                rxjs.merge(
                    rxutil.signal(this.accel_renderer, 'accel-edited'),
                    rxutil.signal(this.accel_renderer, 'accel-cleared')
                ),
                args => {
                    this.save_shortcut(this.shortcuts_list, ...args);
                }
            );

            this.rx.subscribe(
                rxjs.merge(
                    rxutil.signal(this.global_accel_renderer, 'accel-edited'),
                    rxutil.signal(this.global_accel_renderer, 'accel-cleared')
                ),
                args => {
                    this.save_shortcut(this.global_shortcuts_list, ...args);
                }
            );

            this.rx.subscribe(
                this.settings['shortcuts-enabled'],
                rxutil.property(this.shortcuts_treeview, 'sensitive')
            );

            this.rx.connect(
                this.global_accel_renderer,
                'editing-started',
                (IS_GTK3 ? this.grab_global_keys : this.inhibit_system_shortcuts).bind(this)
            );

            const aux_actions = {
                'copy-gnome-terminal-profile': () => {
                    this.copy_gnome_terminal_profile();
                },
                'reset-compatibility-options': () => {
                    this.settings['backspace-binding'].reset();
                    this.settings['delete-binding'].reset();
                    this.settings['cjk-utf8-ambiguous-width'].reset();
                },
                'reset-tab-title': () => {
                    this.settings['tab-title-template'].reset();
                },
            };

            const aux_group = Gio.SimpleActionGroup.new();

            Object.entries(aux_actions).forEach(([name, fn]) => {
                const act = new Gio.SimpleAction({ name });
                this.rx.connect(act, 'activate', fn);
                aux_group.add_action(act);
            });

            this.insert_action_group('aux', aux_group);

            this.rx.subscribe(
                rxutil.property(this.tab_position_combo, 'active-id').skip_initial,
                position => {
                    if (['top', 'bottom'].includes(position)) {
                        const setting = this.settings['tab-label-ellipsize-mode'];

                        if (setting.value === 'none')
                            setting.value = 'middle';
                    }
                }
            );
        }

        setup_bidi_binding(setting, object, property, editable) {
            const circuit_breaker = recursion_guard();
            const prop = rxutil.property(object, property);
            const setting_obj = this.settings[setting];

            this.rx.subscribe(
                setting_obj.pipe(circuit_breaker),
                prop
            );

            this.rx.subscribe(
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

            this.rx.subscribe(editable, rxutil.property(widget, 'sensitive'));

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

            this.rx.subscribe(editable, rxutil.property(action, 'enabled'));

            const circuit_breaker = recursion_guard();

            this.rx.connect(action, 'change-state', (_, state) => {
                circuit_breaker(() => {
                    if (state.equal(action.state))
                        return;

                    const value = to_setting(state);

                    if (packed.set_value(value))
                        action.set_state(state);
                });
            });

            this.rx.subscribe(
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

        set_scale_value_format(scale, format) {
            const formatter = (_, value) => format.format(value);

            if (scale.set_format_value_func)
                scale.set_format_value_func(formatter);
            else
                this.rx.connect(scale, 'format-value', formatter);
        }

        save_shortcut(shortcuts_list, _, path, accel_key = null, accel_mods = null) {
            const [ok, iter] = shortcuts_list.get_iter_from_string(path);
            if (!ok)
                return;

            const action = shortcuts_list.get_value(iter, 0);
            const key_names = accel_key ? [Gtk.accelerator_name(accel_key, accel_mods)] : [];
            this.settings[action].value = key_names;
        }

        grab_global_keys(cell_renderer, editable) {
            const display = this.window.get_display();
            const seat = display.get_default_seat();
            const status = seat.grab(this.window, Gdk.SeatCapabilities.KEYBOARD, false, null, null, null);
            if (status !== Gdk.GrabStatus.SUCCESS)
                return;

            this.rx.subscribe(
                rxutil.signal(editable, 'editing-done').pipe(rxjs.take(1)),
                () => {
                    seat.ungrab();
                }
            );
        }

        inhibit_system_shortcuts(cell_renderer, editable) {
            const toplevel = this.root.get_surface();
            toplevel.inhibit_system_shortcuts(null);

            this.rx.subscribe(
                rxutil.signal(editable, 'editing-done').pipe(rxjs.take(1)),
                () => {
                    toplevel.restore_system_shortcuts();
                }
            );
        }

        copy_gnome_terminal_profile() {
            // Lookup gnome terminal's setting schemas
            let profile_list_schema, profile_schema;
            try {
                profile_list_schema = get_settings_schema('org.gnome.Terminal.ProfilesList');
                profile_schema = get_settings_schema('org.gnome.Terminal.Legacy.Profile');
            } catch (e) {
                show_dialog(this.get_toplevel(), `${e.message} Probably, GNOME Terminal is not installed.`);
                return;
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
                    'foreground-color', 'background-color',
                    'bold-color-same-as-fg', 'bold-color',
                    'cursor-colors-set', 'cursor-foreground-color', 'cursor-background-color',
                    'highlight-colors-set', 'highlight-foreground-color', 'highlight-background-color',
                    'palette',
                    'bold-is-bright',
                ];

                // Check if key is valid
                for (const key of profile_keys) {
                    const type_gnome_terimnal = get_settings_schema_key(profile_schema, key).get_value_type();
                    const type_ddterm = this.settings[key].value_type;

                    if (!type_gnome_terimnal.equal(type_ddterm))
                        throw new Error(`The type of key '${key}' in GNOME Terminal is '${type_gnome_terimnal.dup_string()}', but '${type_ddterm.dup_string()}' is expected.`);
                }

                profile_keys.forEach(key => {
                    this.settings[key].packed.value = gnome_terminal_profile.get_value(key);
                });
            } catch (e) {
                show_dialog(this.get_toplevel(), `Failed to copy color profile from GNOME Terminal. ${e.message}`);
            }
        }
    }
);

function init() {
    imports.misc.extensionUtils.initTranslations();
}

function buildPrefsWidget() {
    const widget = new PrefsWidget({
        settings: new settings.Settings({
            gsettings: imports.misc.extensionUtils.getSettings(),
        }),
    });

    if (imports.misc.config.PACKAGE_VERSION.split('.')[0] >= 42)
        widget.stack.vhomogeneous = false;

    return widget;
}
