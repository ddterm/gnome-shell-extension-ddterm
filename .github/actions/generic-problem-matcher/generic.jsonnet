// SPDX-FileCopyrightText: 2025 Aleksandr Mezin
// SPDX-License-Identifier: CC0-1.0

local ncgroup(x) = '(?:' + x + ')';
local optgroup(x) = ncgroup(x) + '?';
local escapes = ncgroup(@'\x1b\[' + optgroup('[0-9]+' + ncgroup(';[0-9]+') + '*') + 'm') + '*';

{
    problemMatcher: [
        {
            owner: 'generic',
            pattern: [
                {
                    regexp: std.join(escapes, [
                        '^',
                        @'\s*',
                        optgroup(@'\.\.') + @'([^\s\x1b:]+)',  // filename
                        ':',
                        @'(\d+)',  // line
                        optgroup(std.join(escapes, [
                            ':',
                            @'(\d+)',  // column
                        ])),
                        ncgroup(@':|\s'),
                        @'\s*',
                        optgroup(std.join(escapes, [
                            '((?i)warning|error)',  // severity
                            ':?',
                            @'\s*',
                        ])),
                        '(.+?)',  // message
                        '$',
                    ]),
                    file: 1,
                    line: 2,
                    column: 3,
                    severity: 4,
                    message: 5
                }
            ]
        },
        {
            owner: 'generic-nolocation',
            pattern: [
                {
                    regexp: std.join(escapes, [
                        '^',
                        @'\s*',
                        optgroup(std.join(escapes, [
                            optgroup(@'\.\.') + @'([^\s\x1b:]+)',  // filename
                            ncgroup(@':|\s'),
                            @'\s*',
                        ])),
                        '((?i)warning|error)',  // severity
                        ':?',
                        @'\s*',
                        '(.+?)',  // message
                        '$',
                    ]),
                    file: 1,
                    severity: 2,
                    message: 3
                }
            ]
        }
    ]
}
