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

const { GLib, Gio } = imports.gi;

/* There's no way to call tcgetpgrp from GJS, as far as I know. So here we are */

const TARGET_FD = 101;
const PERL_CODE = `use POSIX; print tcgetpgrp(${TARGET_FD});`;
const PY_CODE = `
    from __future__ import print_function
    import os
    print(os.tcgetpgrp(${TARGET_FD}))
`;

var InterpreterNotFoundError = class InterpreterNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InterpreterNotFoundError';
    }
};

function find_program(variants) {
    for (let name of variants) {
        const found = GLib.find_program_in_path(name);

        if (found)
            return found;
    }

    return null;
}

function find_interpreter() {
    const perl = find_program(['perl']);

    if (perl)
        return [perl, '-e', PERL_CODE];

    const python = find_program(['python3', 'python2', 'python']);

    if (python)
        return [python, '-c', PY_CODE];

    throw new InterpreterNotFoundError('Perl or Python interpreter not found');
}

function dup(fd) {
    const duper = Gio.UnixFDList.new();
    duper.append(fd);
    return duper.steal_fds()[0];
}

function tcgetpgrp(fd) {
    const argv = find_interpreter();

    const launcher = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.STDOUT_PIPE);
    launcher.take_fd(dup(fd), TARGET_FD);

    const subprocess = launcher.spawnv(argv);
    const [_, stdout] = subprocess.communicate_utf8(null, null);
    subprocess.wait_check(null);

    return parseInt(stdout, 10);
}

/* exported tcgetpgrp InterpreterNotFoundError */
