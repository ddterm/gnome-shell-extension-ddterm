/*
    Copyright © 2024 Aleksandr Mezin

    require() function from GJS internals:
    Copyright © 2020 Evan Welsh

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

var Notification = MessageTray.Notification;
var NotificationSource = MessageTray.Source;

/* exported require Extension Notification NotificationSource */
