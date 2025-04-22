// SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import relativeLinksRule from 'markdownlint-rule-relative-links';

const config = {
    globs: ['**/*.md'],
    gitignore: true,
    ignores: ['tools/heapgraph.md'],
    config: {
        MD033: {
            allowed_elements: ['kbd'],
        },
        'relative-links': true,
    },
    customRules: [relativeLinksRule],
};

export default config;
