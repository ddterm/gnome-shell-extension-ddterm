// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import Meta from 'gi://Meta';

import Gi from 'gi';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js';

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

const ExtensionStateCompat = {
    ...ExtensionState,
    ACTIVE: ExtensionState.ACTIVE ?? ExtensionState.ENABLED,
    INACTIVE: ExtensionState.INACTIVE ?? ExtensionState.DISABLED,
    ACTIVATING: ExtensionState.ACTIVATING ?? ExtensionState.ENABLING,
    DEACTIVATING: ExtensionState.DEACTIVATING ?? ExtensionState.DISABLING,
};

export { ExtensionStateCompat as ExtensionState };

export function is_extension_deactivating(extension) {
    const info = Main.extensionManager.lookup(extension.uuid);

    if (!info)
        return true;

    return info.state !== ExtensionStateCompat.ACTIVE &&
        info.state !== ExtensionStateCompat.ACTIVATING;
}

export function get_windows(display) {
    const actors = Meta.get_window_actors
        ? Meta.get_window_actors(display)
        : display.get_compositor().get_window_actors();

    return actors.map(actor => actor.meta_window);
}
