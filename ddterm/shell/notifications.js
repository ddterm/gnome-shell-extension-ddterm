/*
    Copyright © 2023 Aleksandr Mezin

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

/* exported SharedSource SharedNotification */

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;

class SharedBase {
    constructor(factory) {
        this._factory = factory;
        this._instance = null;
    }

    get() {
        if (this._instance)
            return this._instance;

        this._instance = this._factory();

        this._instance.connect('destroy', () => {
            this._instance = null;
        });

        return this._instance;
    }

    destroy(reason = MessageTray.NotificationDestroyedReason.SOURCE_CLOSED) {
        this._instance?.destroy(reason);
    }
}

var SharedSource = class SharedSource extends SharedBase {
    constructor(title, icon_name) {
        super(() => {
            const source = new MessageTray.Source(title, icon_name);
            Main.messageTray.add(source);
            return source;
        });
    }
};

var SharedNotification = class SharedNotification extends SharedBase {
    constructor(source, title, banner, params) {
        super(() => new MessageTray.Notification(source.get(), title, banner, params));
    }

    show() {
        const notification = this.get();

        notification.source.showNotification(notification);
    }
};
