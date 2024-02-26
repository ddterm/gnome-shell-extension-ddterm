// SPDX-FileCopyrightText: © 2024 Aleksandr Mezin
//
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

const Gettext = imports.gettext;

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
