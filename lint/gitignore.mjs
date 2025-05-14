// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import ignore from 'ignore';

function* gitIgnores(rootDir, dir, stack) {
    const fullDir = path.join(rootDir, dir);
    const ignoreFile = path.join(fullDir, '.gitignore');
    const rules = ignore();

    try {
        rules.add(fs.readFileSync(ignoreFile, 'utf8'));
    } catch (ex) {
        if (ex.code !== 'ENOENT')
            throw ex;
    }

    stack.push({ rules, dirname: path.basename(dir) });

    const children = fs.readdirSync(fullDir, { withFileTypes: true });

    for (const child of children) {
        const isDir = child.isDirectory();
        const name = child.name + (isDir ? '/' : '');

        let relPath = name;
        let i = stack.length - 1;

        while (i >= 0) {
            if (stack[i].rules.ignores(relPath)) {
                yield path.join(dir, name);
                break;
            }

            relPath = path.join(stack[i].dirname, relPath);
            i -= 1;
        }

        if (i === -1 && isDir)
            yield* gitIgnores(rootDir, relPath, stack);
    }

    stack.pop();
}

export default function gitIgnoredFiles(rootDir) {
    if (rootDir instanceof URL)
        rootDir = fileURLToPath(rootDir);

    return gitIgnores(rootDir, '', []);
}
