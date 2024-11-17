// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

const Gettext = imports.gettext;
const MessageTray = imports.ui.messageTray;

const gi = imports.gi;

// SPDX-SnippetBegin
// SDPX-SnippetName: require() function from GJS 1.68 modules/esm/gi.js
// SPDX-License-Identifier: MIT OR LGPL-2.0-or-later
// SPDX-SnippetCopyrightText: 2020 Evan Welsh <contact@evanwelsh.com>

function require(namespace, version = undefined) {
    if (version !== undefined) {
        const alreadyLoadedVersion = gi.versions[namespace];
        if (alreadyLoadedVersion !== undefined && version !== alreadyLoadedVersion) {
            throw new Error(`Version ${alreadyLoadedVersion} of GI module ${
                namespace} already loaded, cannot load version ${version}`);
        }
        gi.versions[namespace] = version;
    }

    return gi[namespace];
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
