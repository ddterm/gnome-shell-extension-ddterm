/*
    Copyright © 2024 Aleksandr Mezin

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

import GObject from 'gi://GObject';

import { Application as BaseApplication } from './application.js';
import { AppWindow } from './dev-appwindow.js';

export const Application = GObject.registerClass({
}, class DDTermDevApplication extends BaseApplication {
    _launch_service() {
        return -1;
    }

    _create_window() {
        return new AppWindow({
            application: this,
            decorated: true,
            settings: this.settings,
            terminal_settings: this.terminal_settings,
            extension_dbus: this.extension_dbus,
        });
    }
});
