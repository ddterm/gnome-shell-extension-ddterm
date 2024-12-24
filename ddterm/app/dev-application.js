// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';

import { Application as BaseApplication } from './application.js';
import { AppWindow } from './dev-appwindow.js';

export const Application = GObject.registerClass({
}, class DDTermDevApplication extends BaseApplication {
    _launch_service() {
        return -1;
    }

    ensure_window() {
        if (this.window)
            return this.window;

        this.window = new AppWindow({
            application: this,
            settings: this.settings,
            terminal_settings: this.terminal_settings,
            extension_dbus: this.extension_dbus,
            display_config: this.display_config,
        });

        this.window.connect('destroy', source => {
            if (source === this.window)
                this.window = null;
        });

        return this.window;
    }
});
