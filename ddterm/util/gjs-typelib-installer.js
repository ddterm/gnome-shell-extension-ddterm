// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: MIT

import Gi from 'gi';

// Stub

export function require(versions) {
    return Object.entries(versions).map(
        ([name, version]) => Gi.require(name, version)
    );
}

export class MissingDependencies extends Error {}

export function findTerminalInstallCommand() {
    return null;
}
