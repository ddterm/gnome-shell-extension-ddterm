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

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import Gettext from 'gettext';
import System from 'system';

import { AppWindow } from './appwindow.js';
import './encoding.js';
import { GtkThemeManager } from './gtktheme.js';
import { HeapDumper } from './heapdump.js';
import { metadata } from './meta.js';
import { PrefsDialog } from './prefsdialog.js';
import { get_settings } from './settings.js';
import { TerminalCommand } from './terminal.js';
import { TerminalSettings, TerminalSettingsParser } from './terminalsettings.js';
import { WIFEXITED, WEXITSTATUS, WTERMSIG } from './waitstatus.js';

function schedule_gc() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        System.gc();
        return GLib.SOURCE_REMOVE;
    });
}

function get_file(relative_path) {
    return Gio.File.new_for_uri(
        GLib.Uri.resolve_relative(import.meta.url, relative_path, GLib.UriFlags.NONE)
    );
}

export const Application = GObject.registerClass({
    Properties: {
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

        this.add_main_option(
            'activate-only',
            0,
            GLib.OptionFlags.HIDDEN,
            GLib.OptionArg.NONE,
            Gettext.gettext('Start the application, but do not show the window'),
            null
        );

        this.add_main_option(
            'allowed-gdk-backends',
            0,
            GLib.OptionFlags.HIDDEN,
            GLib.OptionArg.STRING,
            Gettext.gettext('Comma-separated list of backends that GDK should try to use'),
            null
        );

        this.add_main_option(
            'allow-heap-dump',
            0,
            GLib.OptionFlags.HIDDEN,
            GLib.OptionArg.NONE,
            Gettext.gettext('Enable HeapDump D-Bus interface (for testing/debug)'),
            null
        );

        this.add_main_option(
            'version',
            0,
            GLib.OptionFlags.NONE,
            GLib.OptionArg.NONE,
            Gettext.gettext('Show version information and exit'),
            null
        );

        this.add_main_option(
            GLib.OPTION_REMAINING,
            0,
            GLib.OptionFlags.NONE,
            GLib.OptionArg.STRING_ARRAY,
            Gettext.gettext('Run the specified command'),
            null
        );

        this.set_option_context_parameter_string('[-- COMMAND…]');
        this.flags |=
            Gio.ApplicationFlags.HANDLES_COMMAND_LINE |
            Gio.ApplicationFlags.HANDLES_OPEN;

        this.add_main_option(
            'wait',
            0,
            GLib.OptionFlags.NONE,
            GLib.OptionArg.NONE,
            Gettext.gettext('Wait for the command to exit, and return its exit code'),
            null
        );

        this.add_main_option(
            'working-directory',
            0,
            GLib.OptionFlags.NONE,
            GLib.OptionArg.STRING,
            Gettext.gettext('Set the working directory'),
            null
        );

        this.add_main_option(
            'title',
            0,
            GLib.OptionFlags.NONE,
            GLib.OptionArg.STRING,
            Gettext.gettext('Set tab title'),
            null
        );

        this.add_main_option(
            'keep-open',
            0,
            GLib.OptionFlags.NONE,
            GLib.OptionArg.NONE,
            Gettext.gettext('Keep the terminal open after the command has exited'),
            null
        );

        this.add_main_option(
            'no-environment',
            0,
            GLib.OptionFlags.NONE,
            GLib.OptionArg.NONE,
            Gettext.gettext('Do not pass the environment'),
            null
        );

        this.add_main_option(
            'tab',
            0,
            GLib.OptionFlags.NONE,
            GLib.OptionArg.NONE,
            Gettext.gettext('Open a new tab'),
            null
        );

        this.connect('activate', () => {
            this.ensure_window_with_terminal().present_with_time(Gdk.CURRENT_TIME);
        });

        this.connect('handle-local-options', (_, options) => {
            try {
                return this.handle_local_options(options);
            } catch (ex) {
                logError(ex);
                return 1;
            }
        });

        this.connect('command-line', (_, command_line) => {
            try {
                return this.command_line(command_line);
            } catch (ex) {
                logError(ex);
                return 1;
            } finally {
                // https://gitlab.gnome.org/GNOME/glib/-/issues/596
                schedule_gc();
            }
        });

        this.connect('open', (_, files) => {
            for (const file of files)
                this.open_file(file);

            this.activate();
        });

        this.connect('startup', this.startup.bind(this));
    }

    startup() {
        this.settings = get_settings();

        this.simple_action('quit', () => {
            this.save_session();
            this.quit();
        });

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

        this.theme_manager = new GtkThemeManager({
            'gtk-settings': Gtk.Settings.get_default(),
        });

        this.settings.bind(
            'theme-variant',
            this.theme_manager,
            'theme-variant',
            Gio.SettingsBindFlags.GET
        );

        const css_provider = Gtk.CssProvider.new();
        css_provider.load_from_file(get_file('style.css'));

        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(),
            css_provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        this.terminal_settings = new TerminalSettings();

        new TerminalSettingsParser({
            gsettings: this.settings,
        }).bind_settings(this.terminal_settings);

        this.simple_action('toggle', () => this.ensure_window_with_terminal().toggle());
        this.simple_action('show', () => this.ensure_window_with_terminal().show());
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
            'shortcut-move-tab-prev': 'page.move-prev',
            'shortcut-move-tab-next': 'page.move-next',
            'shortcut-split-horizontal': 'page.split-layout("horizontal-split")',
            'shortcut-split-vertical': 'page.split-layout("vertical-split")',
            'shortcut-move-tab-to-other-pane': 'page.move-to-other-pane',
            'shortcut-split-position-inc': 'win.split-position-inc',
            'shortcut-split-position-dec': 'win.split-position-dec',
            'shortcut-set-custom-tab-title': 'page.use-custom-title(true)',
            'shortcut-reset-tab-title': 'page.use-custom-title(false)',
            'shortcut-find': 'terminal.find',
            'shortcut-find-next': 'terminal.find-next',
            'shortcut-find-prev': 'terminal.find-prev',
            'shortcut-font-scale-increase': 'terminal.font-scale-increase',
            'shortcut-font-scale-decrease': 'terminal.font-scale-decrease',
            'shortcut-font-scale-reset': 'terminal.font-scale-reset',
        };

        for (let i = 0; i < 10; i += 1) {
            shortcut_actions[`shortcut-switch-to-tab-${i + 1}`] =
                `notebook.switch-to-tab(${i})`;
        }

        Object.entries(shortcut_actions).forEach(([key, action]) => {
            this.bind_shortcut(action, key);
        });

        Gtk.IconTheme.get_default().append_search_path(get_file('icons').get_path());

        this.session_file_path = GLib.build_filenamev([
            GLib.get_user_cache_dir(),
            this.application_id,
            'session',
        ]);

        try {
            this.restore_session();
        } catch (ex) {
            if (!(ex instanceof GLib.Error &&
                ex.matches(GLib.file_error_quark(), GLib.FileError.NOENT)))
                logError(ex, "Can't restore session");
        }

        this.connect('query-end', () => {
            const cookie = this.inhibit(
                null,
                Gtk.ApplicationInhibitFlags.LOGOUT,
                Gettext.gettext('Saving session...')
            );

            try {
                this.save_session();
            } finally {
                this.uninhibit(cookie);
            }
        });
    }

    vfunc_dbus_register(connection, object_path) {
        if (this.allow_heap_dump) {
            this.heap_dump_dbus_interface = new HeapDumper();
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
            this.print_version_info();
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

        if (!options.lookup('no-environment'))
            this.flags |= Gio.ApplicationFlags.SEND_ENVIRONMENT;

        return options.lookup('activate-only') ? 0 : -1;
    }

    command_line(command_line) {
        const options = command_line.get_options_dict();
        const argv = options.lookup(GLib.OPTION_REMAINING, 'as', true);

        const has_tab_options =
            options.contains('working-directory') ||
            options.contains('title') ||
            options.contains('wait') ||
            options.contains('keep-open');

        if (!argv?.length && !options.lookup('tab') && !has_tab_options) {
            this.activate();
            return 0;
        }

        const envv = command_line.get_environ();
        const working_directory =
            command_line.create_file_for_arg(options.lookup('working-directory') ?? '');

        const properties = {
            keep_open_after_exit: options.lookup('keep-open'),
        };

        const title = options.lookup('title');
        if (title !== null) {
            properties.title = title;
            properties.use_custom_title = true;
        }

        const notebook = this.ensure_window().active_notebook;
        properties.command = argv?.length
            ? new TerminalCommand({ argv, envv, working_directory })
            : notebook.get_command_from_settings(working_directory, envv);

        const page = notebook.new_page(-1, properties);
        let exit_status = 0;
        let wait_handler = null;

        const set_exit_status = value => {
            if (!command_line)
                return;

            if (wait_handler)
                page.terminal.disconnect(wait_handler);

            exit_status = value;
            command_line.set_exit_status(value);

            // https://gitlab.gnome.org/GNOME/glib/-/issues/596
            command_line = null;
            schedule_gc();
        };

        const wait = options.lookup('wait');

        if (wait) {
            wait_handler = page.terminal.connect('child-exited', (terminal_, status) => {
                if (WIFEXITED(status))
                    set_exit_status(WEXITSTATUS(status));
                else
                    set_exit_status(128 + WTERMSIG(status));
            });
        }

        page.spawn((terminal_, pid, error) => {
            if (error || !wait)
                set_exit_status(error ? 1 : 0);
        });

        this.activate();
        return exit_status;
    }

    open_file(file) {
        if (file.query_file_type(Gio.FileQueryInfoFlags.NONE, null) === Gio.FileType.DIRECTORY) {
            const notebook = this.ensure_window().active_notebook;
            const command = notebook.get_command_from_settings(file);

            notebook.new_page(-1, { command }).spawn();
        } else {
            const argv = [file.get_path()];
            const command = new TerminalCommand({ argv });
            const notebook = this.ensure_window().active_notebook;
            const page = notebook.new_page(-1, {
                command,
                keep_open_after_exit: true,
            });

            page.spawn();
        }

        this.activate();
    }

    print_version_info() {
        const [ok_, bytes] = get_file('../../revision.txt').load_contents(null);
        const revision = new TextDecoder().decode(bytes).trim();
        print(metadata.name, metadata.version, 'revision', revision);

        try {
            const ext_version = this.extension_dbus.get_cached_property('Version')?.unpack();
            const ext_revision = this.extension_dbus.get_cached_property('Revision')?.unpack();
            print('Extension', ext_version, 'revision', ext_revision);

            if (revision !== ext_revision) {
                print(Gettext.gettext(
                    'Warning: ddterm version has changed. ' +
                    'Log out, then log in again to load the updated extension.'
                ));
            }
        } catch (ex) {
            logError(ex, "Can't get version information from the extension");
        }
    }

    get extension_dbus() {
        if ('_extension_dbus' in this)
            return this._extension_dbus;

        const [ok_, bytes] =
            get_file('../com.github.amezin.ddterm.Extension.xml').load_contents(null);

        const extension_dbus_factory = Gio.DBusProxy.makeProxyWrapper(
            new TextDecoder().decode(bytes)
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

        this.window = new AppWindow({
            application: this,
            decorated: false,
            settings: this.settings,
            terminal_settings: this.terminal_settings,
            extension_dbus: this.extension_dbus,
        });

        this.window.connect('destroy', source => {
            if (source === this.window)
                this.window = null;
        });

        return this.window;
    }

    ensure_window_with_terminal() {
        this.ensure_window().ensure_terminal();

        return this.window;
    }

    preferences() {
        if (this.prefs_dialog === null) {
            this.prefs_dialog = new PrefsDialog({
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

    restore_session() {
        const [ok_, data] = GLib.file_get_contents(this.session_file_path);

        if (data?.length) {
            const data_variant = GLib.Variant.new_from_bytes(
                new GLib.VariantType('a{sv}'),
                data,
                false
            );

            this.ensure_window().deserialize_state(data_variant);
        }

        GLib.unlink(this.session_file_path);
    }

    save_session() {
        const data = this.window?.serialize_state();
        const bytes = data?.get_data_as_bytes().toArray() ?? [];

        GLib.mkdir_with_parents(GLib.path_get_dirname(this.session_file_path), 0o700);

        GLib.file_set_contents_full(
            this.session_file_path,
            bytes,
            GLib.FileSetContentsFlags.CONSISTENT | GLib.FileSetContentsFlags.DURABLE,
            0o600
        );
    }
});
