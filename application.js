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
const Gettext = imports.gettext;

/* eslint-disable-next-line consistent-return */
function checked_import(libname, version) {
    try {
        imports.gi.versions[libname] = version;
        return imports.gi[libname];
    } catch (ex) {
        const message = `Can't start ddterm - library ${libname}, version ${version} not available:\n${ex}\n\n` +
            `You likely need to install the package that contains the file '${libname}-${version}.typelib'`;
        printerr(message);

        if (typeof GLib !== 'undefined')
            GLib.spawn_sync(null, ['zenity', '--error', '--width=300', '--text', message], null, GLib.SpawnFlags.SEARCH_PATH, null);

        System.exit(1);
    }
}

const GLib = checked_import('GLib', '2.0');
const GObject = checked_import('GObject', '2.0');
const Gio = checked_import('Gio', '2.0');

const Gtk = checked_import('Gtk', '3.0');
const Gdk = checked_import('Gdk', '3.0');

/* These are used in other modules - check that they are available, and set required versions */
checked_import('Pango', '1.0');
checked_import('Vte', '2.91');

const APP_DATA_DIR = Gio.File.new_for_commandline_arg(System.programInvocationName).get_parent();

imports.searchPath.unshift(APP_DATA_DIR.get_path());

const Me = imports.misc.extensionUtils.getCurrentExtension();

Me.dir = APP_DATA_DIR;

const { rxjs } = imports.rxjs;
const { rxutil, settings } = imports;

const Application = GObject.registerClass(
    class Application extends Gtk.Application {
        _init(params) {
            super._init(params);

            this.decorated = true;

            this.add_main_option(
                'undecorated', 0, GLib.OptionFlags.NONE, GLib.OptionArg.NONE, 'Hide window decorations', null
            );
            this.add_main_option(
                'unset-gdk-backend', 0, GLib.OptionFlags.NONE, GLib.OptionArg.NONE, 'Unset GDK_BACKEND variable for subprocesses', null
            );
            this.add_main_option(
                'reset-gdk-backend', 0, GLib.OptionFlags.NONE, GLib.OptionArg.STRING, 'Set GDK_BACKEND variable for subprocesses', null
            );

            this.env_gdk_backend = null;
            this.unset_gdk_backend = false;

            this.connect('startup', this.startup.bind(this));
            this.connect('handle-local-options', this.handle_local_options.bind(this));

            this.window = null;
            this.prefs_dialog = null;
        }

        startup() {
            if (this.unset_gdk_backend)
                GLib.unsetenv('GDK_BACKEND');

            if (this.env_gdk_backend !== null)
                GLib.setenv('GDK_BACKEND', this.env_gdk_backend, true);

            this.rx = rxutil.scope(this, rxutil.signal(this, 'shutdown'));

            const actions = {
                'quit': () => this.quit(),
                'preferences': () => this.preferences(),
            };

            for (const [name, func] of Object.entries(actions))
                this.add_action(this.rx.make_simple_action(name, func));

            const settings_source = Gio.SettingsSchemaSource.new_from_directory(
                APP_DATA_DIR.get_child('schemas').get_path(),
                Gio.SettingsSchemaSource.get_default(),
                false
            );

            this.settings = new settings.Settings({
                gsettings: new Gio.Settings({
                    settings_schema: settings_source.lookup('com.github.amezin.ddterm', true),
                }),
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
                this.add_action(this.settings.gsettings.create_action(key));
            });

            const gtk_settings = Gtk.Settings.get_default();

            this.rx.subscribe(
                this.settings.resolved['theme-variant'],
                theme => {
                    if (theme === 'default')
                        gtk_settings.reset_property('gtk-application-prefer-dark-theme');
                    else if (theme === 'dark')
                        gtk_settings.gtk_application_prefer_dark_theme = true;
                    else if (theme === 'light')
                        gtk_settings.gtk_application_prefer_dark_theme = false;
                    else
                        printerr(`Unknown theme-variant: ${theme}`);
                }
            );

            const menus = Gtk.Builder.new_from_file(APP_DATA_DIR.get_child('menus.ui').get_path());

            const style = Gtk.CssProvider.new();
            style.load_from_path(APP_DATA_DIR.get_child('style.css').get_path());
            Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), style, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

            this.window = new imports.appwindow.AppWindow({
                application: this,
                decorated: this.decorated,
                settings: this.settings,
                menus,
            });

            this.add_action(this.window.lookup_action('toggle'));
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
                'shortcut-win-new-tab': 'win.new-tab',
                'shortcut-win-new-tab-front': 'win.new-tab-front',
                'shortcut-win-new-tab-before-current': 'win.new-tab-before-current',
                'shortcut-win-new-tab-after-current': 'win.new-tab-after-current',
                'shortcut-page-close': 'page.close',
                'shortcut-prev-tab': 'win.prev-tab',
                'shortcut-next-tab': 'win.next-tab',
                'shortcut-move-tab-prev': 'win.move-tab-prev',
                'shortcut-move-tab-next': 'win.move-tab-next',
                'shortcut-set-custom-tab-title': 'page.use-custom-title(true)',
                'shortcut-reset-tab-title': 'page.use-custom-title(false)',
                'shortcut-find': 'terminal.find',
                'shortcut-find-next': 'terminal.find-next',
                'shortcut-find-prev': 'terminal.find-prev',
            };

            for (let i = 0; i < 10; i += 1)
                shortcut_actions[`shortcut-switch-to-tab-${i + 1}`] = `win.switch-to-tab(${i})`;

            const shortcuts_enabled = this.settings['shortcuts-enabled'];

            const append_escape = rxjs.pipe(
                rxjs.combineLatestWith(this.settings['hide-window-on-esc']),
                rxjs.map(([shortcuts, append]) => append ? shortcuts.concat(['Escape']) : shortcuts)
            );

            for (const [key, action] of Object.entries(shortcut_actions)) {
                this.rx.subscribe(
                    rxutil.switch_on(shortcuts_enabled, {
                        true: this.settings[key],
                        false: rxjs.of([]),
                    }).pipe(action === 'win.hide' ? append_escape : rxjs.identity),
                    value => {
                        this.set_accels_for_action(action, value);
                    }
                );
            }

            this.rx.connect(this, 'activate', this.activate.bind(this));
        }

        activate() {
            if (!this.window)  // There was an exception in startup()
                System.exit(1);

            this.window.show();
        }

        handle_local_options(_, options) {
            if (options.contains('undecorated'))
                this.decorated = false;

            if (options.contains('unset-gdk-backend'))
                this.unset_gdk_backend = true;

            this.env_gdk_backend = options.lookup_value('reset-gdk-backend', GLib.VariantType.new('s'));
            if (this.env_gdk_backend !== null)
                this.env_gdk_backend = this.env_gdk_backend.unpack();

            return -1;
        }

        preferences() {
            if (this.prefs_dialog === null) {
                this.prefs_dialog = new imports.prefsdialog.PrefsDialog({
                    transient_for: this.window,
                    settings: this.settings,
                });

                this.rx.subscribe(
                    rxutil.signal(this.prefs_dialog, 'delete-event').pipe(rxjs.take(1)),
                    () => {
                        this.prefs_dialog = null;
                    }
                );
            }

            this.prefs_dialog.show();
        }
    }
);

GLib.set_prgname('com.github.amezin.ddterm');
GLib.set_application_name('Drop Down Terminal');

Gettext.bindtextdomain('ddterm@amezin.github.com', APP_DATA_DIR.get_child('locale').get_path());

const app = new Application({
    application_id: 'com.github.amezin.ddterm',
    flags: Gio.ApplicationFlags.ALLOW_REPLACEMENT,
});
app.run([System.programInvocationName].concat(ARGV));
