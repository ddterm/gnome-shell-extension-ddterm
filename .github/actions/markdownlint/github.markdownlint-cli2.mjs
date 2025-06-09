// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: CC0-1.0

import { resolve } from 'node:path';

export default {
    outputFormatters: [
        [
            'markdownlint-cli2-formatter-sarif',
            { name: resolve(process.env.RUNNER_TEMP, 'markdownlint.sarif') },
        ],
        ['markdownlint-cli2-formatter-pretty'],
    ],
};
