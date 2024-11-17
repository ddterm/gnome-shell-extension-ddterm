// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

const Gettext = imports.gettext;
const MessageTray = imports.ui.messageTray;

function require(namespace, version = undefined) {
    if (version !== undefined) {
        const prev_version = imports.gi.versions[namespace];

        if (prev_version !== undefined && version !== prev_version) {
            throw new Error(`Version ${prev_version} of GI module ${
                namespace} already loaded, cannot load version ${version}`);
        }

        imports.gi.versions[namespace] = version;
    }

    return imports.gi[namespace];
}

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
