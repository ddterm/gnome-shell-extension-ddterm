// SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: Mohammad Javad Naderi
// SPDX-FileContributor: Juan M. Cruz-Martinez
// SPDX-FileContributor: Jackson Goode
// SPDX-FileContributor: Samuel Bachmann
//
// SPDX-License-Identifier: GPL-3.0-or-later

import './init.js';

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import Handy from 'gi://Handy';

import Gettext from 'gettext';
import Gi from 'gi';
import System from 'system';

import { AboutDialog } from './about.js';
import { AppWindow } from './appwindow.js';
import { get_settings, metadata } from './meta.js';
import { TerminalCommand, WIFEXITED, WEXITSTATUS, WTERMSIG } from './terminal.js';
import { TerminalSettings, TerminalSettingsParser } from './terminalsettings.js';
import { PrefsDialog } from '../pref/dialog.js';
import { DisplayConfig } from '../util/displayconfig.js';

function try_require(namespace, version = undefined) {
    try {
        return Gi.require(namespace, version);
    } catch (ex) {
        logError(ex);
        return null;
    }
}

const GLibUnix = GLib.check_version(2, 79, 2) === null ? try_require('GLibUnix') : null;
const signal_add = GLibUnix?.signal_add_full ?? GLib.unix_signal_add;

const SIGHUP = 1;
const SIGINT = 2;
const SIGTERM = 15;

function is_dbus_interface_error(ex) {
    if (!(ex instanceof GLib.Error))
        return false;

    return ex.matches(Gio.DBusError.quark(), Gio.DBusError.UNKNOWN_METHOD) ||
        ex.matches(Gio.DBusError.quark(), Gio.DBusError.UNKNOWN_OBJECT) ||
        ex.matches(Gio.DBusError.quark(), Gio.DBusError.UNKNOWN_INTERFACE);
}

function create_extension_dbus_proxy(connection) {
    const url = GLib.Uri.resolve_relative(
        import.meta.url,
        '../../data/com.github.amezin.ddterm.Extension.xml',
        GLib.UriFlags.NONE
    );

    const [path] = GLib.filename_from_uri(url);
    const [, bytes] = GLib.file_get_contents(path);
    const info = Gio.DBusInterfaceInfo.new_for_xml(new TextDecoder().decode(bytes));
    const flags =
        Gio.DBusProxyFlags.DO_NOT_AUTO_START |
        Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES |
        Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS;

    return Gio.DBusProxy.new_sync(
        connection,
        flags,
        info,
        'org.gnome.Shell',
        '/org/gnome/Shell/Extensions/ddterm',
        info.name,
        null
    );
}

export const Application = GObject.registerClass({
    Properties: {
        'window': GObject.ParamSpec.object(
            'window',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gtk.ApplicationWindow
        ),
        'about-dialog': GObject.ParamSpec.object(
            'about-dialog',
            null,
            null,
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.EXPLICIT_NOTIFY,
            Gtk.AboutDialog
        ),
        'prefs-dialog': GObject.ParamSpec.object(
            'prefs-dialog',
            null,
            null,
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
            'debug-module',
            0,
            GLib.OptionFlags.HIDDEN,
            GLib.OptionArg.STRING,
            'Load the specified module on startup (for testing/debug, must be passed from Shell)',
            null
        );

        this.add_main_option(
            'sm-disable',
            0,
            GLib.OptionFlags.HIDDEN,
            GLib.OptionArg.NONE,
            'Disable registration with the session manager',
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

        for (const signal of ['activate', 'startup', 'shutdown'])
            this._trace_signal(signal);

        this._trace_signal('handle-local-options', -1);

        this.connect('notify', (_, pspec) => {
            const name = pspec.get_name();

            console.debug('Application property %O changed: %s', name, this[name]);
        });

        this.connect('activate', () => {
            this.ensure_window_with_terminal().present();
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
                this.command_line(command_line);
                return command_line.get_exit_status();
            } catch (ex) {
                logError(ex);
                command_line.done();
                return 1;
            }
        });

        this.connect('open', (_, files) => {
            for (const file of files)
                this.open_file(file);

            this.activate();
        });

        this.connect('startup', () => {
            try {
                this.startup();
            } catch (ex) {
                logError(ex);
                System.exit(1);
            }
        });
    }

    startup() {
        this.settings = get_settings();

        this.simple_action('quit', () => this.quit());
        this.simple_action('preferences', () => this.preferences());
        this.simple_action('about', () => this.about());

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

        Handy.init();
        this.style_manager = Handy.StyleManager.get_default();

        this.settings.connect(
            'changed::theme-variant',
            this.update_color_scheme.bind(this)
        );

        this.update_color_scheme();

        const css_provider = Gtk.CssProvider.new();

        css_provider.load_from_file(Gio.File.new_for_uri(
            GLib.Uri.resolve_relative(import.meta.url, 'style.css', GLib.UriFlags.NONE)
        ));

        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(),
            css_provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        this.terminal_settings = new TerminalSettings();

        const desktop_settings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });

        new TerminalSettingsParser({
            gsettings: this.settings,
            desktop_settings,
        }).bind_settings(this.terminal_settings);

        this.extension_dbus = create_extension_dbus_proxy(this.get_dbus_connection());

        this.display_config = new DisplayConfig({
            dbus_connection: this.get_dbus_connection(),
        });

        this.connect('shutdown', () => this.display_config.unwatch());
        this.display_config.update_sync();

        this.simple_action('toggle', () => this.ensure_window_with_terminal().toggle());
        this.simple_action('show', () => {
            this.ensure_window_with_terminal().present();
        });
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
            'shortcut-focus-other-pane': 'win.focus-other-pane',
        };

        for (let i = 0; i < 10; i += 1) {
            shortcut_actions[`shortcut-switch-to-tab-${i + 1}`] =
                `notebook.switch-to-tab(${i})`;
        }

        Object.entries(shortcut_actions).forEach(([key, action]) => {
            this.bind_shortcut(action, key);
        });

        const icon_theme = Gtk.IconTheme.get_default();
        const icon_search_path = icon_theme.get_search_path();

        for (const url of ['icons', '../../data']) {
            const abs_url = GLib.Uri.resolve_relative(import.meta.url, url, GLib.UriFlags.NONE);
            const [path] = GLib.filename_from_uri(abs_url);

            icon_search_path.unshift(path);
        }

        icon_theme.set_search_path(icon_search_path);

        this.session_file_path = GLib.build_filenamev([
            GLib.get_user_cache_dir(),
            this.application_id,
            'session',
        ]);

        this.restore_session();
        this.connect('shutdown', () => {
            if (this._save_session_handler) {
                this.window.disconnect(this._save_session_handler);
                this._save_session_handler = null;
            }

            if (this._save_session_source) {
                GLib.Source.remove(this._save_session_source);
                this._save_session_source = null;
            }

            this.save_session();
        });

        // gdm sends SIGHUP to gnome-session's process group to terminate it
        signal_add(GLib.PRIORITY_HIGH, SIGHUP, () => this.quit());
        signal_add(GLib.PRIORITY_HIGH, SIGINT, () => this.quit());
        signal_add(GLib.PRIORITY_HIGH, SIGTERM, () => this.quit());
    }

    _trace_signal(signal, return_value = undefined) {
        this.connect(signal, () => {
            console.debug('Application %O', signal);

            return return_value;
        });

        this.connect_after(signal, () => {
            console.debug('End of application %O', signal);

            return return_value;
        });
    }

    handle_local_options(options) {
        if (options.lookup('version')) {
            this.print_version_info();
            return 0;
        }

        const debug_module = options.lookup('debug-module');

        if (debug_module) {
            const loop = GLib.MainLoop.new(null, false);

            import(debug_module).catch(logError).finally(() => {
                loop.quit();
            });

            loop.run();
        }

        const allowed_gdk_backends = options.lookup('allowed-gdk-backends');

        if (allowed_gdk_backends)
            Gdk.set_allowed_backends(allowed_gdk_backends);

        const sm_disable = options.lookup('sm-disable');

        this.register_session = !sm_disable;

        if (this.flags & Gio.ApplicationFlags.IS_SERVICE)
            return -1;

        if (!options.lookup('no-environment'))
            this.flags |= Gio.ApplicationFlags.SEND_ENVIRONMENT;

        return this._launch_service(options);
    }

    _launch_service(options) {
        this.flags |= Gio.ApplicationFlags.IS_LAUNCHER;

        try {
            Gio.DBus.session.call_sync(
                'org.gnome.Shell',
                '/org/gnome/Shell/Extensions/ddterm',
                'com.github.amezin.ddterm.Extension',
                'Service',
                null,
                null,
                Gio.DBusCallFlags.NO_AUTO_START,
                -1,
                null
            );
        } catch (ex) {
            if (is_dbus_interface_error(ex)) {
                printerr(Gettext.gettext("Can't contact the extension."));
                print(Gettext.gettext(
                    'Please, make sure ddterm GNOME Shell extension is enabled.'
                ));
                return 1;
            }

            logError(ex, "Can't start the service");
            return 1;
        }

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
            command_line.done();
            return;
        }

        const envv = command_line.get_environ();
        const working_directory =
            command_line.create_file_for_arg(options.lookup('working-directory') ?? '');

        const properties = {
            keep_open_after_exit: options.lookup('keep-open'),
        };

        const title = options.lookup('title');
        if (title !== null) {
            properties.terminal_title = title;
            properties.use_custom_title = true;
        }

        const notebook = this.ensure_window().active_notebook;
        properties.command = argv?.length
            ? new TerminalCommand({ argv, envv, working_directory })
            : notebook.get_command_from_settings(working_directory, envv);

        const page = notebook.new_page(-1, properties);
        let wait_handler = null;

        const set_exit_status = value => {
            if (!command_line)
                return;

            if (wait_handler)
                page.terminal.disconnect(wait_handler);

            command_line.set_exit_status(value);
            command_line.done();
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

    get_version() {
        const version = metadata.version?.toString();
        const name = metadata['version-name'];

        if (version && name)
            return `${name} (${version})`;

        return name || version;
    }

    get_extension_version() {
        const result = Gio.DBus.session.call_sync(
            'org.gnome.Shell',
            '/org/gnome/Shell',
            'org.gnome.Shell.Extensions',
            'GetExtensionInfo',
            GLib.Variant.new_tuple([GLib.Variant.new_string(metadata.uuid)]),
            new GLib.VariantType('(a{sv})'),
            Gio.DBusCallFlags.NO_AUTO_START,
            2000,
            null
        );

        const info = result.get_child_value(0);
        const version = info.lookup_value('version', null)?.unpack();
        const name = info.lookup_value('version-name', null)?.unpack();

        if (version && name)
            return `${name} (${version})`;

        return name || version;
    }

    print_version_info() {
        const app_version = this.get_version();

        print(metadata.name, app_version);

        try {
            const ext_version = this.get_extension_version();

            print('Extension', ext_version);

            if (!ext_version) {
                print(Gettext.gettext("Can't read the version of the loaded extension."));
            } else if (app_version !== ext_version) {
                print(Gettext.gettext('Warning: ddterm version has changed'));
                print(Gettext.gettext('Log out, then log in again to load the updated extension.'));
            }
        } catch (ex) {
            logError(ex, "Can't get extension information from GNOME Shell");
        }
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
            display_config: this.display_config,
        });

        this.window.connect('destroy', source => {
            if (source !== this.window)
                return;

            this.window = null;

            if (this._save_session_handler) {
                source.disconnect(this._save_session_handler);
                this._save_session_handler = null;
            }
        });

        this._save_session_handler =
            this.window.connect('session-update', this.schedule_save_session.bind(this));

        return this.window;
    }

    ensure_window_with_terminal() {
        this.ensure_window().ensure_terminal();

        return this.window;
    }

    preferences() {
        if (this.prefs_dialog !== null) {
            this.prefs_dialog.present();
            return;
        }

        this.prefs_dialog = new PrefsDialog({
            application: this,
            transient_for: this.window,
            settings: this.settings,
            display_config: this.display_config,
            gettext_domain: Gettext.domain(metadata['gettext-domain']),
        });

        this.prefs_dialog.connect('destroy', source => {
            if (source === this.prefs_dialog)
                this.prefs_dialog = null;
        });

        this.prefs_dialog.connect('loaded', source => {
            source.present();
        });
    }

    about() {
        if (this.about_dialog === null) {
            this.about_dialog = new AboutDialog({
                transient_for: this.window,
                application: this,
            });

            this.about_dialog.connect('destroy', source => {
                if (source === this.about_dialog)
                    this.about_dialog = null;
            });
        }

        this.about_dialog.present();
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

    update_color_scheme() {
        const mapping = {
            'system': Handy.ColorScheme.PREFER_LIGHT,
            'dark': Handy.ColorScheme.FORCE_DARK,
            'light': Handy.ColorScheme.FORCE_LIGHT,
        };

        const variant = this.settings.get_string('theme-variant');
        const resolved = mapping[variant];

        if (resolved === undefined)
            logError(new Error(`Unknown theme-variant: ${variant}`));
        else
            this.style_manager.color_scheme = resolved;
    }

    restore_session() {
        if (!this.settings.get_boolean('save-restore-session'))
            return;

        try {
            const [, data] = GLib.file_get_contents(this.session_file_path);

            if (!data?.length)
                return;

            const data_variant = GLib.Variant.new_from_bytes(
                new GLib.VariantType('a{sv}'),
                data,
                false
            );

            if (!data_variant.is_normal_form())
                throw new Error('Session data is malformed, probably the file was damaged');

            const win = this.ensure_window();

            GObject.signal_handler_block(win, this._save_session_handler);

            try {
                win.deserialize_state(data_variant);
            } finally {
                GObject.signal_handler_unblock(win, this._save_session_handler);
            }
        } catch (ex) {
            if (!(ex instanceof GLib.Error &&
                ex.matches(GLib.file_error_quark(), GLib.FileError.NOENT))) {
                logError(ex, "Can't restore session. Deleting session file.");
                GLib.unlink(this.session_file_path);
            }
        }
    }

    save_session() {
        if (!this.settings.get_boolean('save-restore-session')) {
            GLib.unlink(this.session_file_path);
            return;
        }

        const data = this.window?.serialize_state();

        if (!data) {
            GLib.unlink(this.session_file_path);
            return;
        }

        const bytes = data?.get_data_as_bytes().toArray() ?? [];

        GLib.mkdir_with_parents(GLib.path_get_dirname(this.session_file_path), 0o700);

        GLib.file_set_contents_full(
            this.session_file_path,
            bytes,
            GLib.FileSetContentsFlags.CONSISTENT | GLib.FileSetContentsFlags.DURABLE,
            0o600
        );
    }

    schedule_save_session() {
        if (this._save_session_source)
            return;

        this._save_session_source = GLib.idle_add(GLib.PRIORITY_LOW, () => {
            this._save_session_source = null;
            this.save_session();

            return GLib.SOURCE_REMOVE;
        });
    }
});
