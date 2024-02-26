// SPDX-FileCopyrightText: © 2024 Aleksandr Mezin
//
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

/* exported getCurrentExtension */

const Me = {};

/* fake current extension object to make 'Me.imports' and 'Me.dir' work in application context */

function getCurrentExtension() {
    return Me;
}
