#!/usr/bin/env node

// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: CC0-1.0

import * as semver from 'semver';

for (const input of process.argv.slice(2)) {
    const { major, minor, patch, prerelease } = semver.parse(input);
    const numericPreid = prerelease[0]?.toString().match(/^[0-9]/);
    const main = [major];

    if (minor || patch || numericPreid) {
        main.push(minor);

        if (patch || numericPreid)
            main.push(patch);
    }

    console.log(main.concat(prerelease).join('.'));
}
