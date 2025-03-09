// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

const { Meta } = imports.gi;

const Gettext = imports.gettext;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;

const gi = imports.gi;

// SPDX-SnippetBegin
// SDPX-SnippetName: require() function from GJS 1.76 modules/esm/gi.js
// SPDX-SnippetCopyrightText: 2020 Evan Welsh <contact@evanwelsh.com>

function require(namespace, version = undefined) {
    let oldVersion = gi.versions[namespace];
    if (version !== undefined)
        gi.versions[namespace] = version;

    try {
        const module = gi[namespace];

        if (version !== undefined && version !== module.__version__) {
            throw new Error(`Version ${module.__version__} of GI module ${
                namespace} already loaded, cannot load version ${version}`);
        }

        return module;
    } catch (error) {
        // Roll back change to versions object if import failed
        gi.versions[namespace] = oldVersion;
        throw error;
    }
}

// SPDX-SnippetEnd

/* exported require */

function try_require(namespace, version = undefined) {
    try {
        return require(namespace, version);
    } catch (ex) {
        logError(ex);
        return null;
    }
}

/* exported try_require */

var Extension = class Extension {
    constructor(meta) {
        this.uuid = meta.uuid;
        this.dir = meta.dir;
        this.path = meta.path;
        this.metadata = meta.metadata;

        Object.assign(this, Gettext.domain(this.metadata['gettext-domain'] ?? this.uuid));
    }

    getSettings() {
        return imports.misc.extensionUtils.getSettings();
    }
};

/* exported Extension */

var Notification = MessageTray.Notification;

/* exported Notification */

var NotificationSource = MessageTray.Source;

/* exported NotificationSource */

var ExtensionState = {
    ...ExtensionUtils.ExtensionState,
    ACTIVE: ExtensionUtils.ExtensionState.ENABLED,
    INACTIVE: ExtensionUtils.ExtensionState.DISABLED,
    ACTIVATING: ExtensionUtils.ExtensionState.ENABLING,  // is undefined on GNOME Shell <44
    DEACTIVATING: ExtensionUtils.ExtensionState.DISABLING,  // is undefined on GNOME Shell <44
};

/* exported ExtensionState */

function is_extension_deactivating(extension) {
    if (!ExtensionUtils.ExtensionState.DISABLING) {
        // On GNOME Shell before 44, DISABLING state is not defined,
        // and the extension is ACTIVE until the end of disable().
        // So always assume it's deactivating.
        return true;
    }

    const info = Main.extensionManager.lookup(extension.uuid);

    if (!info)
        return true;

    return info.state !== ExtensionUtils.ExtensionState.ENABLED &&
        info.state !== ExtensionUtils.ExtensionState.ENABLING;
}

/* exported is_extension_deactivating */

function get_windows(display) {
    return Meta.get_window_actors(display).map(actor => actor.meta_window);
}

/* exported get_windows */
