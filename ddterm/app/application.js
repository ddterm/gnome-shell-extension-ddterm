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

const System = imports.system;

const Me = imports.misc.extensionUtils.getCurrentExtension();

const { GLib, GObject, Gio } = imports.gi;

imports.ddterm.app.dependencies.gi_require({
    'Gtk': '3.0',
    'Gdk': '3.0',
    'Pango': '1.0',
    'Vte': '2.91',
});

const { Gdk, Gtk } = imports.gi;

const { translations } = imports.ddterm.util;
translations.init(Me.dir);

const { appwindow, extensiondbus, gtktheme, metadata } = imports.ddterm.app;
const { PrefsDialog } = imports.ddterm.pref.dialog;

const APP_DIR = Me.dir.get_child('ddterm').get_child('app');

const Application = GObject.registerClass(
    {
        Properties: {
            'window': GObject.ParamSpec.object(
                'window',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                appwindow.AppWindow
            ),
            'prefs-dialog': GObject.ParamSpec.object(
                'prefs-dialog',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                PrefsDialog
            ),
        },
    },
    class Application extends Gtk.Application {
        _init(params) {
            super._init(params);

            this.decorated = true;

            this.add_main_option(
                'undecorated',
                0,
                GLib.OptionFlags.NONE,
                GLib.OptionArg.NONE,
                'Hide window decorations',
                null
            );
            this.add_main_option(
                'unset-gdk-backend',
                0,
                GLib.OptionFlags.NONE,
                GLib.OptionArg.NONE,
                'Unset GDK_BACKEND variable for subprocesses',
                null
            );
            this.add_main_option(
                'reset-gdk-backend',
                0,
                GLib.OptionFlags.NONE,
                GLib.OptionArg.STRING,
                'Set GDK_BACKEND variable for subprocesses',
                null
            );
            this.add_main_option(
                'launch-through-extension',
                0,
                GLib.OptionFlags.NONE,
                GLib.OptionArg.NONE,
                'Ask the extension to launch the app',
                null
            );

            this.connect('startup', this.startup.bind(this));
            this.connect('handle-local-options', this.handle_local_options.bind(this));

            this.env_gdk_backend = null;
            this.unset_gdk_backend = false;
        }

        startup() {
            if (this.unset_gdk_backend)
                GLib.unsetenv('GDK_BACKEND');

            if (this.env_gdk_backend !== null)
                GLib.setenv('GDK_BACKEND', this.env_gdk_backend, true);

            this.simple_action('quit', () => this.quit());
            this.simple_action('preferences', () => this.preferences());
            this.simple_action('gc', () => System.gc());

            this.simple_action(
                'dump-heap',
                (_, param) => this.dump_heap(param.deepUnpack()),
                { parameter_type: new GLib.VariantType('s') }
            );

            const close_preferences_action = this.simple_action(
                'close-preferences',
                () => this.close_preferences(),
                { enabled: false }
            );

            this.connect('notify::prefs-dialog', () => {
                close_preferences_action.enabled = this.prefs_dialog !== null;
            });

            this.settings = imports.ddterm.util.settings.get_settings();

            [
                'window-above',
                'window-stick',
                'window-maximize',
                'hide-when-focus-lost',
                'hide-window-on-esc',
                'shortcuts-enabled',
                'scroll-on-output',
                'scroll-on-keystroke',
                'preserve-working-directory',
                'transparent-background',
            ].forEach(key => {
                this.add_action(this.settings.create_action(key));
            });

            this.theme_manager = new gtktheme.GtkThemeManager({
                'gtk-settings': Gtk.Settings.get_default(),
            });

            this.settings.bind(
                'theme-variant',
                this.theme_manager,
                'theme-variant',
                Gio.SettingsBindFlags.GET
            );

            const menus = Gtk.Builder.new_from_file(APP_DIR.get_child('menus.ui').get_path());

            const style = Gtk.CssProvider.new();
            style.load_from_path(APP_DIR.get_child('style.css').get_path());
            Gtk.StyleContext.add_provider_for_screen(
                Gdk.Screen.get_default(),
                style,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );

            this.desktop_settings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.interface',
            });

            this.extension_dbus = extensiondbus.get();

            const extension_version = this.extension_dbus.Version;
            if (extension_version !== `${metadata.version}`) {
                printerr(
                    'ddterm extension version mismatch! ' +
                    `app: ${metadata.version} extension: ${extension_version}`
                );
            }

            this.window = new appwindow.AppWindow({
                application: this,
                decorated: this.decorated,
                settings: this.settings,
                desktop_settings: this.desktop_settings,
                extension_dbus: this.extension_dbus,
                menus,
            });

            this.add_action(this.window.lookup_action('toggle'));
            this.add_action(this.window.lookup_action('show'));
            this.add_action(this.window.lookup_action('hide'));

            const shortcut_actions = {
                'shortcut-window-hide': 'win.hide',
                'shortcut-window-size-inc': 'win.window-size-inc',
                'shortcut-window-size-dec': 'win.window-size-dec',
                'shortcut-background-opacity-inc': 'win.background-opacity-inc',
                'shortcut-background-opacity-dec': 'win.background-opacity-dec',
                'shortcut-toggle-maximize': 'app.window-maximize',
                'shortcut-toggle-transparent-background': 'app.transparent-background',
                'shortcut-terminal-copy': 'terminal.copy',
                'shortcut-terminal-copy-html': 'terminal.copy-html',
                'shortcut-terminal-paste': 'terminal.paste',
                'shortcut-terminal-select-all': 'terminal.select-all',
                'shortcut-terminal-reset': 'terminal.reset',
                'shortcut-terminal-reset-and-clear': 'terminal.reset-and-clear',
                'shortcut-win-new-tab': 'notebook.new-tab',
                'shortcut-win-new-tab-front': 'notebook.new-tab-front',
                'shortcut-win-new-tab-before-current': 'notebook.new-tab-before-current',
                'shortcut-win-new-tab-after-current': 'notebook.new-tab-after-current',
                'shortcut-page-close': 'page.close',
                'shortcut-prev-tab': 'notebook.prev-tab',
                'shortcut-next-tab': 'notebook.next-tab',
                'shortcut-move-tab-prev': 'notebook.move-tab-prev',
                'shortcut-move-tab-next': 'notebook.move-tab-next',
                'shortcut-set-custom-tab-title': 'page.use-custom-title(true)',
                'shortcut-reset-tab-title': 'page.use-custom-title(false)',
                'shortcut-find': 'terminal.find',
                'shortcut-find-next': 'terminal.find-next',
                'shortcut-find-prev': 'terminal.find-prev',
            };

            for (let i = 0; i < 10; i += 1) {
                shortcut_actions[`shortcut-switch-to-tab-${i + 1}`] =
                    `notebook.switch-to-tab(${i})`;
            }

            Object.entries(shortcut_actions).forEach(([key, action]) => {
                this.bind_shortcut(action, key);
            });

            this.connect('activate', this.activate.bind(this));
        }

        activate() {
            if (!this.window)  // There was an exception in startup()
                System.exit(1);

            this.window.show();
        }

        handle_local_options(_, options) {
            if (options.contains('launch-through-extension')) {
                try {
                    const iface = extensiondbus.get();
                    iface.ServiceSync();
                    return 0;
                } catch (e) {
                    logError(e);
                    return 1;
                }
            }

            if (options.contains('undecorated'))
                this.decorated = false;

            if (options.contains('unset-gdk-backend'))
                this.unset_gdk_backend = true;

            this.env_gdk_backend = options.lookup_value(
                'reset-gdk-backend',
                GLib.VariantType.new('s')
            );

            if (this.env_gdk_backend !== null)
                this.env_gdk_backend = this.env_gdk_backend.unpack();

            if (!(this.flags & Gio.ApplicationFlags.IS_SERVICE))
                this.flags |= Gio.ApplicationFlags.IS_LAUNCHER;

            return -1;
        }

        preferences() {
            if (this.prefs_dialog === null) {
                this.prefs_dialog = new PrefsDialog({
                    transient_for: this.window,
                    settings: this.settings,
                });

                this.prefs_dialog.connect('destroy', () => {
                    this.prefs_dialog = null;
                });
            }

            this.prefs_dialog.show();
        }

        close_preferences() {
            if (this.prefs_dialog !== null)
                this.prefs_dialog.close();
        }

        dump_heap(path = null) {
            if (!path) {
                path = GLib.build_filenamev([
                    GLib.get_user_state_dir(),
                    this.application_id,
                ]);
                GLib.mkdir_with_parents(path, 0o700);
            }

            if (GLib.file_test(path, GLib.FileTest.IS_DIR)) {
                path = GLib.build_filenamev([
                    path,
                    `${this.application_id}-${new Date().toISOString().replace(/:/g, '-')}.heap`,
                ]);
            }

            printerr(`Dumping heap to ${path}`);
            System.dumpHeap(path);
            printerr(`Dumped heap to ${path}`);
        }

        simple_action(name, activate, params = {}) {
            const action = new Gio.SimpleAction({
                name,
                ...params,
            });
            action.connect('activate', activate);
            this.add_action(action);
            return action;
        }

        bind_shortcut(action, settings_key) {
            const handler = this.update_shortcut.bind(this, action, settings_key);

            this.settings.connect(`changed::${settings_key}`, handler);
            this.settings.connect('changed::shortcuts-enabled', handler);

            if (action === 'win.hide')
                this.settings.connect('changed::hide-window-on-esc', handler);

            handler();
        }

        update_shortcut(action, settings_key) {
            const enable = this.settings.get_boolean('shortcuts-enabled');
            const keys = enable ? this.settings.get_strv(settings_key) : [];

            if (action === 'win.hide' && this.settings.get_boolean('hide-window-on-esc'))
                keys.push('Escape');

            this.set_accels_for_action(action, keys);
        }
    }
);

function main(argv) {
    const app = new Application({
        application_id: 'com.github.amezin.ddterm',
    });

    System.exit(app.run(argv));
}

/* exported main */
