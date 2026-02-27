// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';

import { Application as BaseApplication } from './application.js';

export const Application = GObject.registerClass({
}, class DDTermDevApplication extends BaseApplication {
    _launch_service() {
        return -1;
    }

    _create_extension_dbus_proxy() {
        return null;
    }

    ensure_window() {
        const win = super.ensure_window();

        win.hide_on_close = false;
        win.decorated = true;

        return win;
    }
});
