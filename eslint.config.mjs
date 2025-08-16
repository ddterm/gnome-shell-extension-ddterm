// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import { fileURLToPath } from 'node:url';
import { defineConfig } from '@eslint/config-helpers';
import globals from 'globals';
import gnome from 'eslint-config-gnome';
import importPlugin from 'eslint-plugin-import';
import gitIgnores from './lint/gitignore.mjs';

export default defineConfig([
    gitIgnores(new URL('./', import.meta.url)),
    importPlugin.flatConfigs.recommended,
    gnome.configs.recommended,
    {
        settings: {
            'import/resolver': fileURLToPath(
                new URL('./lint/import-resolver.cjs', import.meta.url)
            ),
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
            'bin/*.js',
            'tools/*.js',
        ],
        languageOptions: {
            sourceType: 'script',
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
]);
