// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs');

const checkstyleFormatter = require('eslint-formatter-checkstyle');
const stylishFormatter = require('eslint-formatter-stylish');

function formatter(results = [], data) {
    const checkstyle = checkstyleFormatter(results, data);
    fs.writeFileSync('./eslint.xml', checkstyle, 'utf8');

    return stylishFormatter(results, data);
}

module.exports = formatter;
