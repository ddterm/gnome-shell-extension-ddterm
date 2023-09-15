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

const { GLib, GObject, Gio, Gdk, Gtk } = imports.gi;

const { gtktheme, heapdump, resources, terminalsettings } = imports.ddterm.app;

var Application = GObject.registerClass(
    {
        Properties: {
            'install-dir': GObject.ParamSpec.object(
                'install-dir',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
                Gio.File
            ),
            'window': GObject.ParamSpec.object(
                'window',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                Gtk.ApplicationWindow
            ),
            'prefs-dialog': GObject.ParamSpec.object(
                'prefs-dialog',
                '',
                '',
                GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
                Gtk.Dialog
            ),
        },
    },
    class Application extends Gtk.Application {
        _init(params) {
            super._init(params);

            this.resources = new resources.Resources({
                base_uri: `${this.install_dir.get_uri()}/`,
            });

            this.add_main_option(
                'activate-only',
                0,
                GLib.OptionFlags.HIDDEN,
                GLib.OptionArg.NONE,
                'Start the application, but do not show the window',
                null
            );

            this.add_main_option(
                'allowed-gdk-backends',
                0,
                GLib.OptionFlags.HIDDEN,
                GLib.OptionArg.STRING,
                'Comma-separated list of backends that GDK should try to use',
                null
            );

            this.add_main_option(
                'allow-heap-dump',
                0,
                GLib.OptionFlags.HIDDEN,
                GLib.OptionArg.NONE,
                'Enable HeapDump D-Bus interface (for testing/debug)',
                null
            );

            this.add_main_option(
                'version',
                0,
                GLib.OptionFlags.NONE,
                GLib.OptionArg.NONE,
                'Show version information and exit',
                null
            );

            this.connect('activate', () => {
                this.ensure_window().show();
            });

            this.connect('handle-local-options', (_, options) => {
                try {
                    return this.handle_local_options(options);
                } catch (ex) {
                    logError(ex);
                    return 1;
                }
            });

            this.connect('startup', this.startup.bind(this));
        }

        startup() {
            this.settings = imports.ddterm.util.settings.get_settings(this.install_dir);

            this.simple_action('quit', () => this.quit());
            this.simple_action('preferences', () => this.preferences());

            const close_preferences_action = this.simple_action(
                'close-preferences',
                () => this.close_preferences(),
                { enabled: false }
            );

            this.connect('notify::prefs-dialog', () => {
                close_preferences_action.enabled = this.prefs_dialog !== null;
            });

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

            Gtk.StyleContext.add_provider_for_screen(
                Gdk.Screen.get_default(),
                this.resources.css_providers.get('ddterm/app/style.css'),
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );

            this.terminal_settings = new terminalsettings.TerminalSettings();

            new terminalsettings.TerminalSettingsParser({
                gsettings: this.settings,
            }).bind_settings(this.terminal_settings);

            this.simple_action('toggle', () => this.ensure_window().toggle());
            this.simple_action('show', () => this.ensure_window().show());
            this.simple_action('hide', () => this.window?.hide());

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

            Gtk.IconTheme.get_default().append_search_path(
                this.resources.get_file('ddterm/app/icons').get_path()
            );
        }

        vfunc_dbus_register(connection, object_path) {
            if (this.allow_heap_dump) {
                this.heap_dump_dbus_interface = new heapdump.HeapDumper(this.resources);
                this.heap_dump_dbus_interface.dbus.export(connection, object_path);
            }

            return super.vfunc_dbus_register(connection, object_path);
        }

        vfunc_dbus_unregister(connection, object_path) {
            if (this.allow_heap_dump)
                this.heap_dump_dbus_interface.dbus.unexport_from_connection(connection);

            return super.vfunc_dbus_unregister(connection, object_path);
        }

        handle_local_options(options) {
            if (options.lookup('version')) {
                const metadata = JSON.parse(this.resources.text_files.get('metadata.json'));
                const revision = this.resources.text_files.get('revision.txt').trim();
                print(metadata.name, metadata.version, 'revision', revision);
                return 0;
            }

            const allowed_gdk_backends = options.lookup('allowed-gdk-backends');

            if (allowed_gdk_backends)
                Gdk.set_allowed_backends(allowed_gdk_backends);

            this.allow_heap_dump = options.lookup('allow-heap-dump');

            if (this.flags & Gio.ApplicationFlags.IS_SERVICE)
                return -1;

            this.flags |= Gio.ApplicationFlags.IS_LAUNCHER;

            this.extension_dbus.ServiceSync();

            return options.lookup('activate-only') ? 0 : -1;
        }

        get extension_dbus() {
            if ('_extension_dbus' in this)
                return this._extension_dbus;

            const extension_dbus_factory = Gio.DBusProxy.makeProxyWrapper(
                this.resources.text_files.get('ddterm/com.github.amezin.ddterm.Extension.xml')
            );

            this._extension_dbus = extension_dbus_factory(
                Gio.DBus.session,
                'org.gnome.Shell',
                '/org/gnome/Shell/Extensions/ddterm',
                undefined,
                undefined,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START
            );

            return this._extension_dbus;
        }

        ensure_window() {
            if (this.window)
                return this.window;

            this.window = new imports.ddterm.app.appwindow.AppWindow({
                application: this,
                decorated: false,
                settings: this.settings,
                terminal_settings: this.terminal_settings,
                extension_dbus: this.extension_dbus,
                resources: this.resources,
            });

            this.window.connect('destroy', source => {
                if (source === this.window)
                    this.window = null;
            });

            return this.window;
        }

        preferences() {
            if (this.prefs_dialog === null) {
                this.prefs_dialog = new imports.ddterm.pref.dialog.PrefsDialog({
                    transient_for: this.window,
                    settings: this.settings,
                });

                this.prefs_dialog.connect('destroy', source => {
                    if (source === this.prefs_dialog)
                        this.prefs_dialog = null;
                });
            }

            this.prefs_dialog.show();
        }

        close_preferences() {
            if (this.prefs_dialog !== null)
                this.prefs_dialog.close();
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

/* exported Application */
