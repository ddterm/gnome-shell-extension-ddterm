// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import minimatch from 'minimatch';

function minimatchEscape(s) {
    return s.replace(/[?*()[\]\\]/g, '\\$&');
}

function getSubdirIgnores(ignoreFile, subdir) {
    if (!existsSync(ignoreFile))
        return [];

    const { ignores } = includeIgnoreFile(ignoreFile);
    const escapedSubdir = minimatchEscape(subdir);

    return ignores.map(pattern => new minimatch.Minimatch(
        pattern.replace(/^!?/, negate => `${negate}${escapedSubdir}`),
        { flipNegate: true }
    ));
}

function collectSubdir(rootDir, subdir = '', parentIgnores = []) {
    const ignored = parentIgnores.findLast(matcher => matcher.match(subdir));

    if (ignored && !ignored.negate)
        return [];

    const absPath = join(rootDir, subdir);
    const ignoreFile = join(absPath, '.gitignore');
    const subdirIgnores = getSubdirIgnores(ignoreFile, subdir);
    const effectiveIgnores = parentIgnores.concat(subdirIgnores);

    return subdirIgnores.concat(
        readdirSync(absPath, { withFileTypes: true })
            .filter(child => child.isDirectory())
            .flatMap(child => collectSubdir(
                rootDir,
                `${join(subdir, child.name)}${sep}`,
                effectiveIgnores
            ))
    );
}

export default function gitIgnores(rootDir = '.') {
    if (rootDir instanceof URL)
        rootDir = fileURLToPath(rootDir);

    rootDir = resolve(rootDir);

    return {
        name: `.gitignore patterns from ${rootDir}`,
        ignores: collectSubdir(rootDir).map(
            matcher => matcher.negate ? `!${matcher.pattern}` : matcher.pattern
        ),
    };
}
