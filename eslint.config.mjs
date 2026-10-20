// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
// SPDX-FileContributor: spi
//
// SPDX-License-Identifier: GPL-2.0-or-later

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, globalIgnores } from 'eslint/config';
import { ConfigArray } from '@eslint/config-array';
import { includeIgnoreFile } from '@eslint/config-helpers';
import globals from 'globals';
import gnome from 'eslint-config-gnome';
import importPlugin from 'eslint-plugin-import';

function *collectIgnores(
    basePath = import.meta.dirname,
    parentIgnores = new ConfigArray([globalIgnores(['**/node_modules/', '.git/'])], { basePath })
) {
    const ignoreFile = join(basePath, '.gitignore');

    if (existsSync(ignoreFile)) {
        const config = includeIgnoreFile(ignoreFile, {
            name: `Imported .gitignore patterns from ${ignoreFile}`,
            gitignoreResolution: true,
        });

        parentIgnores =
            new ConfigArray([parentIgnores, config], { extraConfigTypes: ['array'], basePath });

        yield config;
    }

    for (const entry of readdirSync(basePath, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            const entryPath = join(basePath, entry.name);

            if (!parentIgnores.normalizeSync().isDirectoryIgnored(entryPath))
                yield* collectIgnores(entryPath, parentIgnores);
        }
    }
}

export default defineConfig([
    ...collectIgnores(),
    {
        files: [
            '**/*.js',
        ],
        extends: [
            importPlugin.flatConfigs.recommended,
        ],
        settings: {
            'import/resolver': fileURLToPath(
                new URL('./tools/eslint-import-resolver.cjs', import.meta.url)
            ),
            'import/core-modules': ['gettext', 'gi', 'system', 'console', 'cairo'],
        },
    },
    gnome.configs.recommended,
    {
        rules: {
            'max-len': [
                'error',
                100,
                { ignoreUrls: true },
            ],
            'consistent-return': 'error',
            'object-curly-spacing': [
                'error',
                'always',
            ],
            'prefer-arrow-callback': 'error',
            'prefer-const': ['error', {
                destructuring: 'all',
            }],
            'prefer-destructuring': 'error',
            'no-multiple-empty-lines': [
                'error',
                { max: 1 },
            ],
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
        files: [
            'bin/*.js',
            'tools/*.js',
        ],
        languageOptions: {
            sourceType: 'script',
        },
    },
    {
        files: [
            'tools/heapgraph.js',
        ],
        languageOptions: {
            sourceType: 'module',
        },
    },
    {
        files: [
            '**/*.{mjs,cjs}',
        ],
        languageOptions: {
            globals: globals.node,
        },
    },
]);
