// SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import { Animation, ReverseAnimation } from './animation.js';
import { AppControl } from './appcontrol.js';
import { DBusApi } from './dbusapi.js';
import { WindowGeometry } from './geometry.js';
import { Installer } from './install.js';
import { Notifications } from './notifications.js';
import { PanelIconProxy } from './panelicon.js';
import { Service } from './service.js';
import { WindowManager } from './wm.js';
import { WindowMatch } from './windowmatch.js';

const APP_ID = 'com.github.amezin.ddterm';
const APP_DBUS_PATH = '/com/github/amezin/ddterm';
const WINDOW_PATH_PREFIX = `${APP_DBUS_PATH}/window/`;

function create_dbus_interface(
    window_geometry,
    window_matcher,
    app_control,
    notifications,
    extension,
    rollback
) {
    const dbus_interface = new DBusApi({
        version: extension.metadata.version?.toString() ?? null,
        revision: extension.metadata['version-name'] ?? null,
        app_control,
    });

    dbus_interface.connect('update-target-monitor', () => {
        /*
         * Don't want to track mouse pointer continuously, so try to update the
         * index manually in multiple places. Also, Meta.CursorTracker doesn't
         * seem to work properly in X11 session.
         */
        if (!window_matcher.current_window)
            window_geometry.update_monitor();
    });
    dbus_interface.connect('missing-dependencies', (_, packages, files) => {
        notifications.show_missing_dependencies(packages, files);
    });
    dbus_interface.connect('error', (_, message, details) => {
        notifications.show_error(message, details);
    });
    dbus_interface.connect('version-mismatch', () => {
        notifications.show_version_mismatch();
    });

    window_geometry.bind_property(
        'monitor-scale',
        dbus_interface,
        'target-monitor-scale',
        GObject.BindingFlags.SYNC_CREATE
    );
    window_geometry.bind_property(
        'target-rect',
        dbus_interface,
        'target-rect',
        GObject.BindingFlags.SYNC_CREATE
    );

    const flush_handler = window_geometry.connect('updated', () => {
        dbus_interface.dbus.flush();
    });

    rollback.push(() => {
        window_geometry.disconnect(flush_handler);
    });

    dbus_interface.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');

    rollback.push(() => {
        dbus_interface.dbus.unexport();
    });

    return dbus_interface;
}

function create_panel_icon(settings, window_matcher, app_control, icon, gettext_domain, rollback) {
    const panel_icon = new PanelIconProxy({ gicon: icon, gettext_domain });

    rollback.push(() => {
        panel_icon.remove();
    });

    settings.bind(
        'panel-icon-type',
        panel_icon,
        'type-name',
        Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY
    );

    panel_icon.connect('open-preferences', () => {
        app_control.preferences();
    });

    panel_icon.connect('show-about-dialog', () => {
        app_control.about();
    });

    window_matcher.connect('notify::current-window', () => {
        panel_icon.active = window_matcher.current_window !== null;
    });

    panel_icon.connect('notify::active', () => {
        const window_visible = window_matcher.current_window !== null;
        const value = panel_icon.active;

        if (value === window_visible)
            return;

        const promise = value ? app_control.activate(false) : app_control.hide(false);

        promise.catch(
            e => logError(e, 'Failed to toggle ddterm through panel icon')
        ).finally(() => {
            panel_icon.active = window_matcher.current_window !== null;
        });
    });

    panel_icon.active = window_matcher.current_window !== null;

    return panel_icon;
}

function install(extension, rollback) {
    const installer = new Installer(extension.launcher_path);
    installer.install();

    if (GObject.signal_lookup('shutdown', Shell.Global)) {
        const shutdown_handler = global.connect('shutdown', () => {
            installer.uninstall();
        });

        rollback.push(() => {
            global.disconnect(shutdown_handler);
        });
    }

    rollback.push(() => {
        // Don't uninstall desktop/service files because of screen locking
        // GNOME Shell picks up newly installed desktop files with a noticeable delay
        if (Main.sessionMode.isLocked)
            return;

        // Also don't uninstall if ddterm is being disabled only temporarily
        // (because some other extension is being disabled).
        if (!extension.is_deactivating())
            return;

        installer.uninstall();
    });
}

function bind_keys(settings, app_control, rollback) {
    Main.wm.addKeybinding(
        'ddterm-toggle-hotkey',
        settings,
        Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
        Shell.ActionMode.NORMAL,
        () => {
            app_control.toggle().catch(
                e => logError(e, 'Failed to toggle ddterm by keybinding')
            );
        }
    );

    rollback.push(() => {
        Main.wm.removeKeybinding('ddterm-toggle-hotkey');
    });

    Main.wm.addKeybinding(
        'ddterm-activate-hotkey',
        settings,
        Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
        Shell.ActionMode.NORMAL,
        () => {
            app_control.activate().catch(
                e => logError(e, 'Failed to activate ddterm by keybinding')
            );
        }
    );

    rollback.push(() => {
        Main.wm.removeKeybinding('ddterm-activate-hotkey');
    });
}

function is_wayland_compositor() {
    if (!Meta.is_wayland_compositor)  // Removed in GNOME 50 - Wayland-only
        return true;

    return Meta.is_wayland_compositor();
}

class EnabledExtension {
    #disable_callbacks = [];
    #logger;

    constructor(extension) {
        this.extension = extension;

        try {
            this.#enable();
        } catch (ex) {
            this.disable();
            throw ex;
        }
    }

    disable() {
        while (this.#disable_callbacks.length > 0) {
            try {
                this.#disable_callbacks.pop()();
            } catch (ex) {
                logError(ex);
            }
        }
    }

    #enable() {
        const rollback = this.#disable_callbacks;

        this.settings = this.extension.getSettings();

        this.symbolic_icon = Gio.FileIcon.new(Gio.File.new_for_uri(
            GLib.Uri.resolve_relative(
                import.meta.url,
                '../../data/com.github.amezin.ddterm-symbolic.svg',
                GLib.UriFlags.NONE
            )
        ));

        this.notifications = new Notifications({
            icon: this.symbolic_icon,
            gettext_domain: this.extension,
        });

        rollback.push(() => {
            this.notifications.destroy();
        });

        this.service = new Service({
            bus: Gio.DBus.session,
            bus_name: APP_ID,
            executable: this.extension.launcher_path,
            subprocess: this.extension.app_process,
        });

        rollback.push(() => {
            this.service.unwatch();
        });

        if (is_wayland_compositor()) {
            this.settings.bind(
                'force-x11-gdk-backend',
                this.service,
                'wayland',
                Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.INVERT_BOOLEAN
            );
        }

        this.service.connect('notify::subprocess', service => {
            const { subprocess } = service;

            if (subprocess)
                this.extension.watch_app_process(subprocess);
        });

        this.service.connect('notify::starting', service => {
            if (service.starting) {
                this.notifications.destroy(
                    MessageTray.NotificationDestroyedReason.EXPIRED
                );

                if (!this.extension.check_version_match())
                    this.notifications.show_version_mismatch();
            }
        });

        this.service.connect('error', (service, ex) => {
            const log_collector = service.subprocess?.log_collector;

            if (!log_collector) {
                this.notifications.show_error(ex);
                return;
            }

            log_collector.collect().then(output => {
                this.notifications.show_error(ex, output);
            }).catch(ex2 => {
                logError(ex2, 'Failed to collect logs');
                this.notifications.show_error(ex);
            });
        });

        this.window_geometry = new WindowGeometry();
        this.window_geometry.bind_settings(this.settings);

        rollback.push(() => {
            this.window_geometry.disable();
        });

        this.show_animation = new Animation({
            geometry: this.window_geometry,
        });

        this.show_animation.bind_settings(
            this.settings,
            'show-animation',
            'show-animation-duration'
        );

        this.hide_animation = new ReverseAnimation({
            geometry: this.window_geometry,
        });

        this.hide_animation.bind_settings(
            this.settings,
            'hide-animation',
            'hide-animation-duration'
        );

        this.window_matcher = new WindowMatch({
            service: this.service,
            display: global.display,
            gtk_application_id: APP_ID,
            gtk_window_object_path_prefix: WINDOW_PATH_PREFIX,
        });

        rollback.push(() => {
            this.window_matcher.disable();
        });

        this.app_control = new AppControl({
            service: this.service,
            window_matcher: this.window_matcher,
            window_geometry: this.window_geometry,
            logger: this.logger ?? null,
        });

        rollback.push(() => {
            this.app_control.disable();
        });

        rollback.push(() => {
            // Stop the app only if the extension isn't being disabled because of
            // lock screen. Because when the session switches back to normal mode
            // we want to keep all open terminals.
            if (Main.sessionMode.isLocked)
                return;

            // Also don't terminate the app if ddterm is being disabled only temporarily
            // (because some other extension is being disabled).
            if (!this.extension.is_deactivating())
                return;

            if (!this.app_control.quit())
                this.service.terminate();
        });

        this.window_matcher.connect('notify::current-window', () => {
            this.#create_window_manager();
        });

        rollback.push(() => {
            this.window_manager?.disable();
        });

        this.#create_window_manager();

        this.window_matcher.connect('notify::current-window', () => {
            this.#set_skip_taskbar();
        });

        const skip_taskbar_handler = this.settings.connect('changed::window-skip-taskbar', () => {
            this.#set_skip_taskbar();
        });

        rollback.push(() => {
            this.settings.disconnect(skip_taskbar_handler);
        });

        create_dbus_interface(
            this.window_geometry,
            this.window_matcher,
            this.app_control,
            this.notifications,
            this.extension,
            rollback
        );

        bind_keys(
            this.settings,
            this.app_control,
            rollback
        );

        create_panel_icon(
            this.settings,
            this.window_matcher,
            this.app_control,
            this.symbolic_icon,
            this.extension,
            rollback
        );

        install(this.extension, rollback);
    }

    #set_skip_taskbar() {
        const win = this.window_matcher.current_window;

        if (win?.get_client_type() !== Meta.WindowClientType.WAYLAND)
            return;

        if (this.settings.get_boolean('window-skip-taskbar'))
            this.service.hide_from_window_list(win);
        else
            this.service.show_in_window_list(win);
    }

    #create_window_manager() {
        this.window_manager?.disable();
        this.window_manager = null;

        const win = this.window_matcher.current_window;

        if (!win)
            return;

        this.window_manager = new WindowManager({
            window: win,
            settings: this.settings,
            geometry: this.window_geometry,
            show_animation: this.show_animation,
            hide_animation: this.hide_animation,
        });

        this.window_manager.logger = this.logger;
        this.window_manager.connect('hide-request', () => this.app_control.hide(false));
    }

    get logger() {
        return this.#logger;
    }

    set logger(logger) {
        this.#logger = logger;

        if (this.window_manager)
            this.window_manager.logger = logger;

        if (this.app_control)
            this.app_control.logger = logger;
    }
}

export default class DDTermExtension extends Extension {
    #app_extra_args = [];
    #app_extra_env = [];
    #logger = null;

    constructor(meta) {
        super(meta);

        this.launcher_path = GLib.build_filenamev([this.path, 'bin', APP_ID]);
        this.metadata_path = GLib.build_filenamev([this.path, 'metadata.json']);

        this.app_process = null;
        this.enabled_state = null;
    }

    get logger() {
        return this.#logger;
    }

    set logger(logger) {
        this.#logger = logger;

        if (this.enabled_state)
            this.enabled_state.logger = logger;
    }

    get app_extra_args() {
        return this.#app_extra_args;
    }

    set app_extra_args(value) {
        this.#app_extra_args = value;

        if (this.enabled_state)
            this.enabled_state.service.extra_argv = value;
    }

    get app_extra_env() {
        return this.#app_extra_env;
    }

    set app_extra_env(value) {
        this.#app_extra_env = value;

        if (this.enabled_state)
            this.enabled_state.service.extra_env = value;
    }

    check_version_match() {
        const metadata_updated =
            JSON.parse(Shell.get_file_contents_utf8_sync(this.metadata_path));

        return this.metadata.version === metadata_updated.version &&
            this.metadata['version-name'] === metadata_updated['version-name'];
    }

    watch_app_process(app_process) {
        this.app_process = app_process;

        app_process.wait_check().then(() => {
            log(`${this.launcher_path} exited cleanly`);
        }).catch(ex => {
            const service = this.enabled_state?.service;

            if (service?.starting && service?.subprocess === app_process)
                return;

            logError(ex, this.launcher_path);
        }).finally(() => {
            if (this.app_process === app_process)
                this.app_process = null;
        });
    }

    enable() {
        this.enabled_state = new EnabledExtension(this);
        this.enabled_state.logger = this.logger;
        this.enabled_state.service.extra_argv = this.app_extra_args;
        this.enabled_state.service.extra_env = this.app_extra_env;
    }

    disable() {
        this.enabled_state?.disable();
        this.enabled_state = null;
    }

    is_deactivating() {
        const info = Main.extensionManager.lookup(this.uuid);

        if (!info)
            return true;

        if (info.state === (ExtensionState.ACTIVE ?? ExtensionState.ENABLED))
            return false;

        if (info.state === (ExtensionState.ACTIVATING ?? ExtensionState.ENABLING))
            return false;

        return true;
    }
}
