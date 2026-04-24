#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: CC0-1.0

import { readFileSync, writeFileSync } from 'node:fs';

import { ArgumentParser } from 'argparse';
import MarkdownIt from 'markdown-it';

class ChangelogError extends Error {
    constructor(message, line = 0, details = {}) {
        super(message);

        this.name = 'ChangelogError';
        this.line = line;
        this.details = details;
    }
}

function plainText(token) {
    if (token.children)
        return token.children.map(child => plainText(child)).join('');

    return token.content ?? '';
}

function* parse(changelog) {
    const lines = changelog.split('\n');
    let tokens = new MarkdownIt().parse(changelog, {});
    let index =
        tokens.findIndex(token => token.tag === 'h2' && token.type === 'heading_open');

    while (index >= 0) {
        const openToken = tokens[index++];
        const inlineContainerToken = tokens[index++];
        const closeToken = tokens[index++];

        console.assert(closeToken.type === 'heading_close');
        console.assert(closeToken.tag === openToken.tag);

        const header = plainText(inlineContainerToken);
        const [, version, date] = /^\s*(\S+)\s*-?\s*(\S+)?/.exec(header);

        tokens = tokens.slice(index);
        index =
            tokens.findIndex(token => token.tag === 'h2' && token.type === 'heading_open');

        const start = openToken.map[0];
        const end = tokens[index]?.map[0] ?? lines.length;
        const content = lines.slice(start, end);

        yield { start, end, header, version, date, content: content.join('\n') };
    }
}

function run({ input, check_version, check_date, ignore_unreleased, print_entry, output }) {
    const changelog = readFileSync(input, 'utf8');
    const parser = parse(changelog);

    let { value: entry, done } = parser.next();

    if (done)
        throw new ChangelogError('Found no version entries');

    if (ignore_unreleased && entry.date === undefined && /\bunreleased\b/i.test(entry.version))
        ({ value: entry, done } = parser.next());

    if (done)
        throw new ChangelogError('Found no released versions');

    if (check_version !== undefined && entry.version !== check_version) {
        throw new ChangelogError(
            `Latest changelog entry does not match the expected version "${check_version}"`,
            entry.start,
            entry
        );
    }

    if (check_date !== undefined && entry.date !== check_date) {
        throw new ChangelogError(
            `Latest changelog entry does not match the expected date "${check_date}"`,
            entry.start,
            entry
        );
    }

    if (print_entry === undefined)
        return;

    while (!done) {
        if (entry.version === print_entry)
            break;

        ({ value: entry, done } = parser.next());
    }

    if (done)
        throw new ChangelogError(`Version "${print_entry}" not found`);

    if (!output || output === '-')
        process.stdout.write(entry.content);
    else
        writeFileSync(output, entry.content, 'utf8');
}

function normalizeVersion(version) {
    version = version.replace(/^[vV]/, '');

    if (!version)
        throw new Error('Failed to parse version');

    return version;
}

function main() {
    const parser = new ArgumentParser();

    parser.add_argument('-i', '--input', {
        default: 'CHANGELOG.md',
        help: 'Input file',
    });

    parser.add_argument('-v', '--check-version', {
        type: normalizeVersion,
        help: 'Check that latest changelog entry matches the specified version',
    });

    parser.add_argument('-d', '--check-date', {
        help: 'Check that latest changelog entry has the specified date',
    });

    parser.add_argument('-u', '--ignore-unreleased', {
        action: 'store_true',
        help: 'If the latest entry is "Unreleased", ignore it and check the next entry',
    });

    parser.add_argument('-p', '--print-entry', {
        type: normalizeVersion,
        help: 'Print changelog entry for the specified version',
    });

    parser.add_argument('-o', '--output', {
        default: '-',
        help: 'Output file',
    });

    run(parser.parse_args());
}

main();
