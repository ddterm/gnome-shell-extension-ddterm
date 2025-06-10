// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import { fileURLToPath } from 'node:url';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import gjs from './lint/eslintrc-gjs.mjs';
import gitIgnores from './lint/gitignore.mjs';

export default [
    gitIgnores(new URL('./', import.meta.url)),
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
            'eqeqeq': [
                'error',
                'smart',
            ],
            'key-spacing': [
                'error',
                { mode: 'minimum', beforeColon: false, afterColon: true },
            ],
            'no-unused-vars': [
                'error',
                {
                    varsIgnorePattern: '(^unused|_$)',
                    argsIgnorePattern: '^(unused|_)',
                    caughtErrors: 'all',
                },
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
            '.github/*.{js,mjs,cjs}',
            '.markdownlint{,-cli2}.{mjs,cjs}',
            '**/eslint.config.{js,mjs,cjs}',
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
];
