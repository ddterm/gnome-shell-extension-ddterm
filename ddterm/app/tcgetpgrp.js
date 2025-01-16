// SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

/* There's no way to call tcgetpgrp from GJS, as far as I know. So here we are */

const TARGET_FD = 101;
const PERL_CODE = `use POSIX; print tcgetpgrp(${TARGET_FD});`;
const PY_CODE = `
from __future__ import print_function
import os
print(os.tcgetpgrp(${TARGET_FD}))
`;

export class InterpreterNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InterpreterNotFoundError';
    }
}

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

export function tcgetpgrp(fd) {
    const argv = find_interpreter();
    const launcher = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.STDOUT_PIPE);

    try {
        launcher.take_fd(dup(fd), TARGET_FD);

        const subprocess = launcher.spawnv(argv);
        const [, stdout] = subprocess.communicate_utf8(null, null);
        subprocess.wait_check(null);

        return parseInt(stdout, 10);
    } finally {
        launcher.close();
    }
}
