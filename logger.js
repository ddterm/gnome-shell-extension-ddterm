/*
    Copyright © 2022 Aleksandr Mezin

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

const { GLib } = imports.gi;

function _log(domain, syslog_identifier, level, message) {
    let stack = new Error().stack;
    let caller = stack.split('\n')[1];

    let [code, line] = caller.split(':');
    let [func, file] = code.split(/\W*@/);

    GLib.log_structured(domain, level, {
        'MESSAGE': message,
        'SYSLOG_IDENTIFIER': syslog_identifier,
        'CODE_FILE': file,
        'CODE_FUNC': func,
        'CODE_LINE': line,
    });
}

const LEVELS = {
    'error': GLib.LogLevelFlags.LEVEL_ERROR,
    'critical': GLib.LogLevelFlags.LEVEL_CRITICAL,
    'warning': GLib.LogLevelFlags.LEVEL_WARNING,
    'message': GLib.LogLevelFlags.LEVEL_MESSAGE,
    'info': GLib.LogLevelFlags.LEVEL_INFO,
    'debug': GLib.LogLevelFlags.LEVEL_DEBUG,
};

function context(domain, syslog_identifier) {
    return Object.fromEntries(
        Object.entries(LEVELS).map(
            ([name, level]) => [name, _log.bind(globalThis, domain, syslog_identifier, level)]
        )
    );
}

/* exported context */
