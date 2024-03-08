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
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { AppControl } from './appcontrol.js';
import { DBusApi } from './dbusapi.js';
import { WindowGeometry } from './geometry.js';
import { Installer } from './install.js';
import { Notifications } from './notifications.js';
import { PanelIconProxy } from './panelicon.js';
import { Service } from './service.js';
import { Subprocess, WaylandSubprocess } from './subprocess.js';
import { WindowManager } from './wm.js';
import { WindowMatch } from './windowmatch.js';

const APP_ID = 'com.github.amezin.ddterm';
const APP_DBUS_PATH = '/com/github/amezin/ddterm';
const WINDOW_PATH_PREFIX = `${APP_DBUS_PATH}/window/`;

function create_subprocess(launcher, settings, app_enable_heap_dump) {
    const argv = [launcher, '--gapplication-service'];

    if (app_enable_heap_dump)
        argv.push('--allow-heap-dump');

    if (settings.get_boolean('force-x11-gdk-backend'))
        argv.push('--allowed-gdk-backends=x11');

    else if (Meta.is_wayland_compositor())
        return new WaylandSubprocess({ journal_identifier: APP_ID, argv });

    return new Subprocess({ journal_identifier: APP_ID, argv });
}

function create_window_matcher(service, rollback) {
    const window_matcher = new WindowMatch({
        subprocess: service.subprocess,
        display: global.display,
        gtk_application_id: APP_ID,
        gtk_window_object_path_prefix: WINDOW_PATH_PREFIX,
    });

    rollback.push(() => {
        window_matcher.disable();
    });

    service.bind_property(
        'subprocess',
        window_matcher,
        'subprocess',
        GObject.BindingFlags.DEFAULT
    );

    return window_matcher;
}

function create_dbus_interface(
    window_geometry,
    window_matcher,
    app_control,
    notifications,
    extension,
    rollback
) {
    const dbus_interface = new DBusApi({
        xml_file_path: extension.dbus_xml_file_path,
        version: `${extension.metadata.version}`,
        revision: extension.revision,
        app_control,
    });

    dbus_interface.connect('refresh-target-rect', () => {
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
        'target-rect',
        dbus_interface,
        'target-rect',
        GObject.BindingFlags.SYNC_CREATE
    );

    dbus_interface.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');

    rollback.push(() => {
        dbus_interface.dbus.unexport();
    });

    return dbus_interface;
}

function create_panel_icon(settings, window_matcher, app_control, gettext_context, rollback) {
    const panel_icon = new PanelIconProxy({ gettext_context });

    rollback.push(() => {
        panel_icon.remove();
    });

    settings.bind(
        'panel-icon-type',
        panel_icon,
        'type-name',
        Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY
    );

    panel_icon.connect('toggle', (_, value) => {
        const window_visible = window_matcher.current_window !== null;

        if (value !== window_visible)
            app_control.toggle(false);
    });

    panel_icon.connect('open-preferences', () => {
        app_control.preferences();
    });

    window_matcher.connect('notify::current-window', () => {
        panel_icon.active = window_matcher.current_window !== null;
    });

    panel_icon.active = window_matcher.current_window !== null;

    return panel_icon;
}

function install(src_dir, launcher, rollback) {
    const installer = new Installer(src_dir, launcher);
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
        if (!Main.sessionMode.isLocked)
            installer.uninstall();
    });
}

function bind_keys(settings, app_control, rollback) {
    Main.wm.addKeybinding(
        'ddterm-toggle-hotkey',
        settings,
        Meta.KeyBindingFlags.NONE,
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
        Meta.KeyBindingFlags.NONE,
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

class EnabledExtension {
    constructor(extension) {
        this.extension = extension;
        this._disable_callbacks = [];

        try {
            this._enable();
        } catch (ex) {
            this.disable();
            throw ex;
        }
    }

    disable() {
        while (this._disable_callbacks.length > 0) {
            try {
                this._disable_callbacks.pop()();
            } catch (ex) {
                logError(ex);
            }
        }
    }

    _enable() {
        const rollback = this._disable_callbacks;

        this.settings = this.extension.getSettings();

        this.notifications = new Notifications({ gettext_context: this.extension });

        rollback.push(() => {
            this.notifications.destroy();
        });

        this.service = new Service({
            bus: Gio.DBus.session,
            bus_name: APP_ID,
            subprocess: this.extension.app_process,
        });

        rollback.push(() => {
            this.service.unwatch();
        });

        this.service.connect('activate', () => {
            this.notifications.destroy(
                MessageTray.NotificationDestroyedReason.EXPIRED
            );

            if (!this.extension.check_revision_match())
                this.notifications.show_version_mismatch();

            try {
                return this.extension.start_app_process(this.settings);
            } catch (ex) {
                logError(ex, 'Failed to launch application/service process');

                this.notifications.show_error(
                    this.extension.gettext('Failed to launch ddterm application'),
                    ex
                );

                return null;
            }
        });

        this.window_geometry = new WindowGeometry();
        this.window_geometry.bind_settings(this.settings);

        rollback.push(() => {
            this.window_geometry.disable();
        });

        this.window_matcher = create_window_matcher(this.service, rollback);

        this.app_control = new AppControl({
            service: this.service,
            window_matcher: this.window_matcher,
            window_geometry: this.window_geometry,
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

            if (!this.app_control.quit())
                this.service.terminate();
        });

        this.window_matcher.connect('notify::current-window', () => {
            this._create_window_manager();
        });

        rollback.push(() => {
            this.window_manager?.disable();
        });

        this._create_window_manager();

        this.window_matcher.connect('notify::current-window', () => {
            this._set_skip_taskbar();
        });

        const skip_taskbar_handler = this.settings.connect('changed::window-skip-taskbar', () => {
            this._set_skip_taskbar();
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
            this.extension,
            rollback
        );

        install(
            this.extension.install_src_dir,
            this.extension.launcher_path,
            rollback
        );
    }

    _set_skip_taskbar() {
        const win = this.window_matcher.current_window;

        if (win?.get_client_type() !== Meta.WindowClientType.WAYLAND)
            return;

        const wayland_client = this.service.subprocess.wayland_client;

        if (this.settings.get_boolean('window-skip-taskbar'))
            wayland_client.hide_from_window_list(win);
        else
            wayland_client.show_in_window_list(win);
    }

    _create_window_manager() {
        this.window_manager?.disable();
        this.window_manager = null;

        const win = this.window_matcher.current_window;

        if (!win)
            return;

        this.window_manager = new WindowManager({
            window: win,
            settings: this.settings,
            geometry: this.window_geometry,
        });

        this.window_manager.debug = this.debug;
        this.window_manager.connect('hide-request', () => this.app_control.hide(false));
    }

    get debug() {
        return this._debug;
    }

    set debug(func) {
        this._debug = func;

        if (this.window_manager)
            this.window_manager.debug = func;
    }
}

export default class DDTermExtension extends Extension {
    constructor(meta) {
        super(meta);

        this.install_src_dir = GLib.build_filenamev([this.path, 'ddterm']);
        this.launcher_path = GLib.build_filenamev([this.path, 'bin', APP_ID]);
        this.dbus_xml_file_path = GLib.build_filenamev(
            [this.path, 'ddterm', 'com.github.amezin.ddterm.Extension.xml']
        );

        this.revision_file_path = GLib.build_filenamev([this.path, 'revision.txt']);
        this.revision = this.read_revision();

        this.app_process = null;
        this.enabled_state = null;
        this.app_enable_heap_dump = false;
        this._debug = null;
    }

    get debug() {
        return this._debug;
    }

    set debug(func) {
        this._debug = func;

        if (this.enabled_state)
            this.enabled_state.debug = func;
    }

    read_revision() {
        return Shell.get_file_contents_utf8_sync(this.revision_file_path).trim();
    }

    check_revision_match() {
        return this.revision === this.read_revision();
    }

    start_app_process(settings) {
        const app_process = create_subprocess(
            this.launcher_path,
            settings,
            this.app_enable_heap_dump
        );

        this.app_process = app_process;

        app_process.wait_check().then(() => {
            log(`${this.launcher_path} exited cleanly`);
        }).catch(ex => {
            logError(ex, this.launcher_path);

            if (!app_process.log_collector) {
                this.enabled_state?.notifications.show_error(ex);
                return;
            }

            app_process.log_collector?.collect().then(output => {
                this.enabled_state?.notifications.show_error(ex, output);
            }).catch(ex2 => {
                logError(ex2, 'Failed to collect logs');
                this.enabled_state?.notifications.show_error(ex);
            });
        }).finally(() => {
            if (this.app_process === app_process)
                this.app_process = null;
        });

        return app_process;
    }

    enable() {
        this.enabled_state = new EnabledExtension(this);
    }

    disable() {
        this.enabled_state?.disable();
        this.enabled_state = null;
    }
}
