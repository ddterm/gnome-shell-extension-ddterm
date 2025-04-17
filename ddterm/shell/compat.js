// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import Gi from 'gi';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
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
