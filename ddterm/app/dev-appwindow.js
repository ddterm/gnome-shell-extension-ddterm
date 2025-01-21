// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';

import { AppWindow as BaseAppWindow } from './appwindow.js';

export const AppWindow = GObject.registerClass({
}, class DDTermDevAppWindow extends BaseAppWindow {
    _hide_on_close() {
    }

    _setup_size_sync() {
    }
});
