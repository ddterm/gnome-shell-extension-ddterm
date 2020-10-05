'use strict';

/* exported init buildPrefsWidget createPrefsWidgetClass */

const { GObject, Gio, Gtk } = imports.gi;

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
            ],
            Properties: {
                'settings': GObject.ParamSpec.object('settings', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.Settings),
            },
        },
        class PrefsWidget extends Gtk.Notebook {
            _init(params) {
                super._init(params);

                this.settings.bind('custom-font', this.font_chooser, 'font', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('use-custom-font', this.custom_font_check, 'active', Gio.SettingsBindFlags.DEFAULT);
                this.settings.bind('use-custom-font', this.font_chooser, 'sensitive', Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY);
                this.settings.bind('background-opacity', this.opacity_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

                const actions = Gio.SimpleActionGroup.new();
                actions.add_action(this.settings.create_action('command'));
                this.insert_action_group('settings', actions);

                this.settings.bind('custom-command', this.custom_command_entry, 'text', Gio.SettingsBindFlags.DEFAULT);
                this.spawn_custom_command.bind_property('active', this.custom_command_entry, 'sensitive', GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);

                this.settings.connect('changed', this.update_shortcuts_from_settings.bind(this));
                this.update_shortcuts_from_settings();

                this.accel_renderer.connect('accel-edited', this.accel_edited.bind(this));
                this.accel_renderer.connect('accel-cleared', this.accel_cleared.bind(this));
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
