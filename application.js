'use strict';

imports.gi.versions.GLib = '2.0';
imports.gi.versions.GObject = '2.0';
imports.gi.versions.Gio = '2.0';
imports.gi.versions.Gdk = '3.0';
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Pango = '1.0';
imports.gi.versions.Vte = '2.91';

const System = imports.system;
const { GLib, GObject, Gio, Gtk, Gdk } = imports.gi;

const APP_DATA_DIR = Gio.File.new_for_commandline_arg(System.programInvocationName).get_parent();

imports.searchPath.unshift(APP_DATA_DIR.get_path());

const { util } = imports;

util.APP_DATA_DIR = APP_DATA_DIR;

const Application = GObject.registerClass(
    class Application extends Gtk.Application {
        _init(params) {
            super._init(params);

            this.decorated = true;

            this.add_main_option(
                'undecorated', 0, GLib.OptionFlags.NONE, GLib.OptionArg.NONE, 'Hide window decorations', null
            );

            this.connect('startup', this.startup.bind(this));
            this.connect('activate', this.activate.bind(this));
            this.connect('handle-local-options', this.handle_local_options.bind(this));

            this.window = null;
            this.prefs_dialog = null;
        }

        startup() {
            this.simple_action('quit', this.quit.bind(this));

            const settings_source = Gio.SettingsSchemaSource.new_from_directory(
                APP_DATA_DIR.get_child('schemas').get_path(),
                Gio.SettingsSchemaSource.get_default(),
                false
            );

            this.settings = new Gio.Settings({
                settings_schema: settings_source.lookup('com.github.amezin.ddterm', true),
            });

            const desktop_settings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.interface',
            });

            const menus = Gtk.Builder.new_from_file(APP_DATA_DIR.get_child('menus.ui').get_path());

            const style = Gtk.CssProvider.new();
            style.load_from_path(APP_DATA_DIR.get_child('style.css').get_path());
            Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), style, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

            this.window = new imports.appwindow.AppWindow({
                application: this,
                decorated: this.decorated,
                settings: this.settings,
                desktop_settings,
                menus,
            });

            this.add_action(this.window.toggle_action);
            this.add_action(this.window.hide_action);

            this.simple_action('preferences', this.preferences.bind(this));

            this.add_action(this.settings.create_action('window-above'));
            this.add_action(this.settings.create_action('window-stick'));
            this.add_action(this.settings.create_action('hide-when-focus-lost'));
            this.add_action(this.settings.create_action('hide-window-on-esc'));
            this.add_action(this.settings.create_action('shortcuts-enabled'));
            this.add_action(this.settings.create_action('scroll-on-output'));
            this.add_action(this.settings.create_action('scroll-on-keystroke'));

            this.gtk_settings = Gtk.Settings.get_default();
            this.settings.connect('changed::theme-variant', this.update_theme.bind(this));
            this.update_theme();

            this.setup_shortcut('shortcut-window-hide', 'win.hide');
            this.setup_shortcut('shortcut-terminal-copy', 'terminal.copy');
            this.setup_shortcut('shortcut-terminal-copy-html', 'terminal.copy-html');
            this.setup_shortcut('shortcut-terminal-paste', 'terminal.paste');
            this.setup_shortcut('shortcut-terminal-select-all', 'terminal.select-all');
            this.setup_shortcut('shortcut-terminal-reset', 'terminal.reset');
            this.setup_shortcut('shortcut-terminal-reset-and-clear', 'terminal.reset-and-clear');
            this.setup_shortcut('shortcut-win-new-tab', 'win.new-tab');
            this.setup_shortcut('shortcut-page-close', 'page.close');
            this.setup_shortcut('shortcut-prev-tab', 'win.prev-tab');
            this.setup_shortcut('shortcut-next-tab', 'win.next-tab');
            this.setup_shortcut('shortcut-set-custom-tab-title', 'page.use-custom-title(true)');
            this.setup_shortcut('shortcut-reset-tab-title', 'page.use-custom-title(false)');

            for (let i = 0; i < 10; i += 1)
                this.setup_shortcut(`shortcut-switch-to-tab-${i + 1}`, `win.switch-to-tab(${i})`);
        }

        simple_action(name, func) {
            const action = new Gio.SimpleAction({
                name,
            });
            action.connect('activate', func);
            this.add_action(action);
            return action;
        }

        activate() {
            if (!this.window)  // There was an exception in startup()
                System.exit(1);

            this.window.show();
        }

        handle_local_options(_, options) {
            if (options.contains('undecorated'))
                this.decorated = false;

            return -1;
        }

        preferences() {
            if (this.prefs_dialog === null) {
                this.prefs_dialog = new imports.prefsdialog.PrefsDialog({
                    transient_for: this.window,
                    settings: this.settings,
                });

                this.prefs_dialog.connect('delete-event', () => this.prefs_dialog.hide_on_delete());
            }

            this.prefs_dialog.show();
        }

        quit() {
            super.quit();
        }

        update_shortcut(key, action) {
            const accels = this.settings.get_boolean('shortcuts-enabled') ? this.settings.get_strv(key) : [];

            if (action === 'win.hide' && this.settings.get_boolean('hide-window-on-esc'))
                accels.push('Escape');

            this.set_accels_for_action(action, accels);
        }

        setup_shortcut(key, action) {
            const update_fn = this.update_shortcut.bind(this, key, action);
            this.settings.connect(`changed::${key}`, update_fn);
            this.settings.connect('changed::shortcuts-enabled', update_fn);
            update_fn();
        }

        update_theme() {
            const theme = this.settings.get_string('theme-variant');
            if (theme === 'system')
                this.gtk_settings.reset_property('gtk-application-prefer-dark-theme');
            else if (theme === 'dark')
                this.gtk_settings.gtk_application_prefer_dark_theme = true;
            else if (theme === 'light')
                this.gtk_settings.gtk_application_prefer_dark_theme = false;
        }
    }
);

GLib.set_prgname('com.github.amezin.ddterm');
GLib.set_application_name('Drop Down Terminal');

const app = new Application({
    application_id: 'com.github.amezin.ddterm',
    flags: Gio.ApplicationFlags.ALLOW_REPLACEMENT,
});
app.run([System.programInvocationName].concat(ARGV));
