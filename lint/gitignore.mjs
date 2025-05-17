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
    const prefix = minimatchEscape(subdir);

    return ignores.map(
        pattern => pattern.replace(/^(!?)/, match => `${match}${prefix}`)
    );
}

function collectSubdir(rootDir, subdir = '', parentIgnores = []) {
    if (parentIgnores.some(pattern => minimatch(subdir, pattern)))
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
        ignores: collectSubdir(rootDir),
    };
}
