// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import globals from 'globals';
import ignore from 'ignore';
import importPlugin from 'eslint-plugin-import';
import gjs from './lint/eslintrc-gjs.mjs';

const baseDir = fileURLToPath(new URL('./', import.meta.url));

function* gitIgnores(dir = '', stack = undefined) {
    if (!stack)
        stack = [];

    const fullDir = path.join(baseDir, dir);
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
            yield* gitIgnores(relPath, stack);
    }

    stack.pop();
}

export default [
    importPlugin.flatConfigs.recommended,
    ...gjs,
    {
        settings: {
            'import/resolver': fileURLToPath(new URL('./lint/import-resolver.js', import.meta.url)),
            'import/core-modules': ['gettext', 'gi', 'system', 'console'],
        },
        rules: {
            'max-len': [
                'error',
                100,
                { ignoreUrls: true },
            ],
            'consistent-return': 'error',
            'key-spacing': [
                'error',
                { mode: 'minimum', beforeColon: false, afterColon: true },
            ],
            'object-curly-spacing': [
                'error',
                'always',
            ],
            'prefer-arrow-callback': 'error',
            'no-multiple-empty-lines': [
                'error',
                { max: 1 },
            ],
            'jsdoc/require-jsdoc': 'off',
        },
    },
    {
        files: [
            'ddterm/shell/**',
            'tests/{shell,extension,settings}hook.js',
        ],
        languageOptions: {
            globals: {
                global: 'readonly',
            },
        },
    },
    {
        files: ['**/eslint.config.{js,mjs,cjs}'],
        languageOptions: {
            globals: globals.node,
        },
        settings: {
            'import/resolver': 'node',
            'import/core-modules': [],
        },
    },
    {
        files: [
            'lint/import-resolver.js',
            '.github/eslint-formatter.js',
        ],
        languageOptions: {
            sourceType: 'commonjs',
            globals: globals.node,
        },
    },
    {
        files: [
            'lint/*.{js,mjs,cjs}',
            '.github/eslint-formatter.js',
            '.markdownlint{,-cli2}.{mjs,cjs}',
        ],
        languageOptions: {
            globals: globals.node,
        },
        settings: {
            'import/resolver': 'node',
            'import/core-modules': [],
        },
    },
    {
        files: [
            'bin/launcher.js',
            'tools/translate-esm.js',
        ],
        languageOptions: {
            sourceType: 'script',
        },
    },
    {
        files: ['ddterm/pref/util.js'],
        rules: {
            quotes: [
                'error',
                'single',
                { allowTemplateLiterals: true },
            ],
        },
    },
    {
        ignores: Array.from(gitIgnores()),
    },
];
