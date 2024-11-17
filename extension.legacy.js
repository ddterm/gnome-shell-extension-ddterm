// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

const Me = imports.misc.extensionUtils.getCurrentExtension();
const impl = Me.imports.ddterm.shell.extension;

function init(meta) {
    imports.misc.extensionUtils.initTranslations();

    return new impl.DDTermExtension(meta);
}

/* exported init */
