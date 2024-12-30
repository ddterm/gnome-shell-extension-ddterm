// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import fs from 'node:fs';
import globals from 'globals';
import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import { load } from 'js-yaml';

const config = load(fs.readFileSync(new URL('./eslintrc-gjs.yml', import.meta.url), 'utf8'));

export default [
    js.configs.recommended,
    {
        plugins: {
            jsdoc,
        },
        rules: config.rules,
        languageOptions: {
            ...config.parserOptions,
            globals: {
                ...Object.fromEntries(
                    Object.entries(config.env).flatMap(
                        ([k, v]) => v ? Object.entries(globals[k]) : []
                    )
                ),
                ...config.globals,
            },
        },
        settings: config.settings,
    },
];
