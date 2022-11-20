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

const { GObject, Gio, Gtk } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { rxjs } = Me.imports.rxjs;
const { prefsutil, rxutil, settings, translations } = Me.imports;

const PALETTE_SIZE = 16;

function palette_widget_ids() {
    const widgets = [];

    for (let i = 0; i < PALETTE_SIZE; i++)
        widgets.push(`palette${i}`);

    return widgets;
}

const PALETTE_WIDGET_IDS = palette_widget_ids();

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

var Widget = GObject.registerClass(
    {
        GTypeName: 'DDTermPrefsColors',
        Template: Me.dir.get_child(`prefs-colors-gtk${Gtk.get_major_version()}.ui`).get_uri(),
        Children: [
            'foreground_color',
            'background_color',
            'opacity_scale',
            'bold_color',
            'cursor_foreground_color',
            'cursor_background_color',
            'highlight_foreground_color',
            'highlight_background_color',
            'color_scheme_combo',
            'palette_combo',
            'theme_variant_combo',
        ].concat(PALETTE_WIDGET_IDS),
        Properties: {
            'settings': GObject.ParamSpec.object(
                'settings',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                settings.Settings
            ),
        },
    },
    class PrefsColors extends Gtk.Grid {
        _init(params) {
            super._init(params);

            const scope = prefsutil.scope(this, this.settings);

            scope.subscribe(
                rxjs.combineLatest(
                    scope.setting_editable('background-color'),
                    scope.setting_editable('foreground-color')
                ).pipe(rxjs.map(v => v.every(rxjs.identity))),
                rxutil.property(this.color_scheme_combo, 'sensitive')
            );

            scope.setup_widgets({
                'theme-variant': this.theme_variant_combo,
                'foreground-color': this.foreground_color,
                'background-color': this.background_color,
                'background-opacity': this.opacity_scale,
                'bold-color': this.bold_color,
                'cursor-foreground-color': this.cursor_foreground_color,
                'cursor-background-color': this.cursor_background_color,
                'highlight-foreground-color': this.highlight_foreground_color,
                'highlight-background-color': this.highlight_background_color,
            });

            this.insert_action_group(
                'settings',
                scope.make_actions([
                    'cursor-colors-set',
                    'highlight-colors-set',
                    'bold-is-bright',
                    'use-theme-colors',
                    'transparent-background',
                ])
            );

            this.insert_action_group(
                'inverse-settings',
                scope.make_inverse_actions([
                    'bold-color-same-as-fg',
                ])
            );

            scope.set_scale_value_formatter(
                this.opacity_scale,
                prefsutil.percent_formatter
            );

            const color_scheme_guard = prefsutil.recursion_guard();

            scope.subscribe(
                rxjs.combineLatest(
                    this.settings['foreground-color'],
                    this.settings['background-color']
                ).pipe(color_scheme_guard),
                scheme => {
                    select_colors_in_combo(this.color_scheme_combo, scheme);
                }
            );

            scope.subscribe(
                palette_selector(this.color_scheme_combo).pipe(color_scheme_guard),
                row => {
                    this.settings['foreground-color'].value = row[0];
                    this.settings['background-color'].value = row[1];
                }
            );

            const palette_guard = prefsutil.recursion_guard();
            const palette_edit_guard = prefsutil.recursion_guard();
            const palette_widgets = PALETTE_WIDGET_IDS.map(v => this[v]);

            scope.subscribe(
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

            scope.subscribe(
                palette_selector(this.palette_combo).pipe(palette_guard),
                this.settings['palette']
            );

            const palette_colors = palette_widgets.map(
                widget => rxutil.property(widget, 'rgba')
            );

            scope.subscribe(
                rxjs.combineLatest(...palette_colors).pipe(palette_edit_guard),
                this.settings['palette']
            );

            this.insert_action_group(
                'aux',
                scope.make_simple_actions({
                    'copy-gnome-terminal-profile': () => {
                        this.copy_gnome_terminal_profile();
                    },
                })
            );
        }

        get title() {
            return translations.gettext('Colors');
        }

        copy_gnome_terminal_profile() {
            // Lookup gnome terminal's setting schemas
            let profile_list_schema, profile_schema;
            try {
                profile_list_schema = get_settings_schema('org.gnome.Terminal.ProfilesList');
                profile_schema = get_settings_schema('org.gnome.Terminal.Legacy.Profile');
            } catch (e) {
                show_dialog(
                    this.get_toplevel(),
                    `${e.message} Probably, GNOME Terminal is not installed.`
                );
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

                    const type_ddterm = this.settings[key].value_type;

                    if (!type_gnome_terminal.equal(type_ddterm)) {
                        throw new Error(
                            `The type of key '${key}' in GNOME Terminal is` +
                            ` '${type_gnome_terminal.dup_string()}',` +
                            ` but '${type_ddterm.dup_string()}' is expected.`
                        );
                    }
                }

                profile_keys.forEach(key => {
                    this.settings[key].packed.value = gnome_terminal_profile.get_value(key);
                });
            } catch (e) {
                show_dialog(
                    this.get_toplevel(),
                    `Failed to copy color profile from GNOME Terminal. ${e.message}`
                );
            }
        }
    }
);

/* exported Widget */
