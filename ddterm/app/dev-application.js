// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';

import { Application as BaseApplication } from './application.js';

export class Application extends BaseApplication {
    static [GObject.GTypeName] = 'DDTermDevApplication';

    static {
        GObject.registerClass(this);
    }

    _launch_service() {
        return -1;
    }

    _create_extension_dbus_proxy() {
        return null;
    }

    _ensure_window() {
        const win = super._ensure_window();

        win.hide_on_close = false;
        win.decorated = true;

        return win;
    }
}
