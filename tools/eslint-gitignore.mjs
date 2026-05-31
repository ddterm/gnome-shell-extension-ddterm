// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path/posix';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/config-helpers';
import minimatch from 'minimatch';

function ensureTrailingSep(path) {
    if (path.endsWith(sep))
        return path;

    return path + sep;
}

function *collectIgnores(directory, parentIgnores = []) {
    directory = ensureTrailingSep(directory);

    const match = parentIgnores.findLast(({ pattern, basePath }) => {
        basePath = ensureTrailingSep(basePath);

        return directory.startsWith(basePath) && pattern.match(directory.slice(basePath.length));
    });

    if (match && !match.pattern.negate)
        return;

    const ignoreFile = join(directory, '.gitignore');

    if (existsSync(ignoreFile)) {
        const config = includeIgnoreFile(ignoreFile, {
            name: `Imported .gitignore patterns from ${ignoreFile}`,
            gitignoreResolution: true,
        });

        yield config;

        let { ignores, basePath } = config;

        basePath = ensureTrailingSep(basePath);

        parentIgnores = parentIgnores.concat(
            ignores.map(pattern => {
                return {
                    basePath,
                    pattern: new minimatch.Minimatch(pattern, { flipNegate: true }),
                };
            })
        );
    }

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== '.git')
            yield* collectIgnores(join(directory, entry.name), parentIgnores);
    }
}

export default function gitIgnores(rootDir = '.') {
    if (rootDir instanceof URL)
        rootDir = fileURLToPath(rootDir, { windows: false });

    return Array.from(collectIgnores(resolve(rootDir)));
}
