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

/* exported Extension */

const { GLib, GObject, Gio, Meta, Shell } = imports.gi;
const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { appcontrol, dbusapi, notifications, subprocess } = Me.imports.ddterm.shell;
const { translations } = Me.imports.ddterm.util;
const { Installer } = Me.imports.ddterm.shell.install;
const { PanelIconProxy } = Me.imports.ddterm.shell.panelicon;
const { Service } = Me.imports.ddterm.shell.service;
const { WindowManager } = Me.imports.ddterm.shell.wm;
const { WindowMatch } = Me.imports.ddterm.shell.windowmatch;

const APP_ID = 'com.github.amezin.ddterm';
const APP_WMCLASS = 'Com.github.amezin.ddterm';
const APP_DBUS_PATH = '/com/github/amezin/ddterm';
const WINDOW_PATH_PREFIX = `${APP_DBUS_PATH}/window/`;

function create_subprocess(launcher, settings, app_enable_heap_dump) {
    const argv = [launcher, '--gapplication-service'];

    if (app_enable_heap_dump)
        argv.push('--allow-heap-dump');

    if (settings.get_boolean('force-x11-gdk-backend'))
        argv.push('--allowed-gdk-backends=x11');

    else if (Meta.is_wayland_compositor())
        return new subprocess.WaylandSubprocess({ journal_identifier: APP_ID, argv });

    return new subprocess.Subprocess({ journal_identifier: APP_ID, argv });
}

function create_window_matcher(service, window_manager, rollback) {
    const window_matcher = new WindowMatch({
        subprocess: service.subprocess,
        display: global.display,
        gtk_application_id: APP_ID,
        gtk_window_object_path_prefix: WINDOW_PATH_PREFIX,
        wm_class: APP_WMCLASS,
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

    window_matcher.connect('notify::current-window', () => {
        if (window_matcher.current_window)
            window_manager.manage_window(window_matcher.current_window);
    });

    if (window_matcher.current_window)
        window_manager.manage_window(window_matcher.current_window);

    return window_matcher;
}

function create_dbus_interface(window_manager, app_control, extension, rollback) {
    const dbus_interface = new dbusapi.Api({ revision: extension.revision });

    dbus_interface.connect('toggle', () => app_control.toggle());
    dbus_interface.connect('activate', () => app_control.activate());
    dbus_interface.connect('service', () => app_control.ensure_running());
    dbus_interface.connect('refresh-target-rect', () => {
        /*
         * Don't want to track mouse pointer continuously, so try to update the
         * index manually in multiple places. Also, Meta.CursorTracker doesn't
         * seem to work properly in X11 session.
         */
        if (!window_manager.current_window)
            window_manager.update_monitor_index();
    });

    window_manager.bind_property(
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

function create_panel_icon(settings, window_manager, app_control, rollback) {
    const panel_icon = new PanelIconProxy();

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
        const window_visible = window_manager.current_window !== null;

        if (value !== window_visible)
            app_control.toggle(false);
    });

    panel_icon.connect('open-preferences', () => {
        app_control.preferences();
    });

    window_manager.connect('notify::current-window', () => {
        panel_icon.active = window_manager.current_window !== null;
    });

    panel_icon.active = window_manager.current_window !== null;

    return panel_icon;
}

function install(launcher, rollback) {
    const installer = new Installer(Me.dir.get_child('ddterm'), launcher);
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

        this.settings = imports.misc.extensionUtils.getSettings();

        const notification_source = new notifications.SharedSource(
            translations.gettext('Drop Down Terminal'),
            'utilities-terminal'
        );

        rollback.push(() => {
            notification_source.destroy();
        });

        const revision_mismatch_notification = new notifications.SharedNotification(
            notification_source,
            translations.gettext('Drop Down Terminal'),
            translations.gettext(
                'Warning: ddterm version has changed. ' +
                'Log out, then log in again to load the updated extension.'
            )
        );

        rollback.push(() => {
            revision_mismatch_notification.destroy();
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
            if (!this.extension.check_revision_match())
                revision_mismatch_notification.show();

            return this.extension.start_app_process(this.settings);
        });

        this.window_manager = new WindowManager({ settings: this.settings });

        rollback.push(() => {
            this.window_manager.disable();
        });

        this.app_control = new appcontrol.AppControl({
            service: this.service,
            window_manager: this.window_manager,
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

        this.window_manager.connect('notify::current-window', () => {
            this._set_skip_taskbar();
        });

        const skip_taskbar_handler = this.settings.connect('changed::window-skip-taskbar', () => {
            this._set_skip_taskbar();
        });

        rollback.push(() => {
            this.settings.disconnect(skip_taskbar_handler);
        });

        create_dbus_interface(this.window_manager, this.app_control, this.extension, rollback);
        create_window_matcher(this.service, this.window_manager, rollback);
        bind_keys(this.settings, this.app_control, rollback);
        create_panel_icon(this.settings, this.window_manager, this.app_control, rollback);
        install(this.extension.launcher_path, rollback);
    }

    _set_skip_taskbar() {
        const win = this.window_manager.current_window;

        if (win?.get_client_type() !== Meta.WindowClientType.WAYLAND)
            return;

        const wayland_client = this.service.subprocess.wayland_client;

        if (this.settings.get_boolean('window-skip-taskbar'))
            wayland_client.hide_from_window_list(win);
        else
            wayland_client.show_in_window_list(win);
    }
}

var Extension = class DDTermExtension {
    constructor() {
        this.launcher_path = GLib.build_filenamev([Me.path, 'bin', APP_ID]);
        this.revision_file_path = GLib.build_filenamev([Me.path, 'revision.txt']);
        this.revision = this.read_revision();

        this.app_process = null;
        this.enabled_state = null;
        this.app_enable_heap_dump = false;
    }

    read_revision() {
        return Shell.get_file_contents_utf8_sync(this.revision_file_path).trim();
    }

    check_revision_match() {
        return this.revision === this.read_revision();
    }

    start_app_process(settings) {
        this.app_process = create_subprocess(
            this.launcher_path,
            settings,
            this.app_enable_heap_dump
        );

        this.app_process?.wait().then(() => {
            this.app_process = null;
        });

        return this.app_process;
    }

    enable() {
        this.enabled_state = new EnabledExtension(this);
    }

    disable() {
        this.enabled_state?.disable();
        this.enabled_state = null;
    }
};
