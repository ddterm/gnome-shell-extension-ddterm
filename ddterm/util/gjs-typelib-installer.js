// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: MIT

import Gi from 'gi';

// Minimal stub for https://github.com/ddterm/gjs-typelib-installer,
// used when the subproject is disabled (-Dtypelib_installer=false).

export function require(versions) {
    const found = {};
    const missing = new Set();

    for (const [name, version] of Object.entries(versions)) {
        try {
            found[name] = Gi.require(name, version);
        } catch (error) {
            logError(error);
            missing.add(`${name}-${version}.typelib`);
        }
    }

    if (missing.size > 0)
        throw new MissingDependencies(missing);

    return found;
}

export class MissingDependencies extends Error {
    constructor(files) {
        super(`Missing typelib files: ${Array.from(files).join(', ')}.`);

        this.name = 'MissingDependencies';
        this.packages = new Set();
        this.files = new Set(files);
    }
}

export function findTerminalInstallCommand() {
    return null;
}
