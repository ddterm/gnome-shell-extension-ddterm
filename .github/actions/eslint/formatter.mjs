// SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: CC0-1.0

import codeframe from 'eslint-formatter-codeframe';
import sarif from '@microsoft/eslint-formatter-sarif';

export default function formatter(results, data) {
    console.log(codeframe(results, data));

    return sarif(results, data);
}
