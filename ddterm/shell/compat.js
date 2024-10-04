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
import Gi from 'gi';

import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export const require = Gi.require;

export function try_require(namespace, version = undefined) {
    try {
        return require(namespace, version);
    } catch (ex) {
        logError(ex);
        return null;
    }
}

export { Extension };

/*
 * Unfortunately, rebuilding old notifications interface on top of the new interface
 * is easier than building the new one on top of the old one. So will have to use
 * old API for now.
 */
export const Notification = MessageTray.Notification.length === 1 ? GObject.registerClass({
}, class DDTermNotification extends MessageTray.Notification {
    constructor(source, title, banner, params) {
        super({ source, title, body: banner, ...params });
    }

    setUrgency(urgency) {
        super.urgency = urgency;
    }

    setForFeedback(value) {
        super.for_feedback = value;
    }
}) : MessageTray.Notification;

export const NotificationSource = MessageTray.Source.length === 1 ? GObject.registerClass({
}, class DDTermNotificationSource extends MessageTray.Source {
    constructor(title, icon_name) {
        super({ title, icon_name });
    }

    showNotification(notification) {
        this.addNotification(notification);
    }
}) : MessageTray.Source;
