#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: MIT

import argparse
import json
import os.path
import pathlib
import re
import sys


CONTRIBUTOR_RE = re.compile(r'.*<\S+@\S+>.*\d{4,4}')
LICENSE_RE = re.compile(r'SPDX-License-Identifier:\s*(.*?)')
COPYRIGHT_RE = re.compile(
    r'(?:SPDX-FileCopyrightText:|Copyright|©)(?:\s*Copyright)?(?:\s*\([Cc]\)|\s*©)?\s*(.*?)'
)


def print_kv(key, value, output):
    print(key, '=', json.dumps(value, indent=2), file=output)


def unpack_list(v):
    if len(v) == 1:
        return v[0]

    return v


def process_file(po_file, domain, output):
    poname = os.path.basename(po_file.name)
    langname, _ = os.path.splitext(poname)
    moname = f'{langname}/LC_MESSAGES/{domain}.mo'

    print('', file=output)
    print('[[annotations]]', file=output)
    print_kv('path', [poname, moname], output)

    licenses = []
    copyrights = []
    contributors = []

    for line in po_file:
        line = line.strip()

        if not line:
            continue

        if not line.startswith('#'):
            break

        line = line[1:].strip()
        license_match = LICENSE_RE.fullmatch(line)

        if license_match:
            licenses.append(license_match[1])
            continue

        copyright_match = COPYRIGHT_RE.fullmatch(line)

        if copyright_match:
            copyrights.append(copyright_match[1])
            continue

        if CONTRIBUTOR_RE.match(line):
            contributors.append(line.rstrip('.'))

    if licenses:
        print_kv('SPDX-License-Identifier', unpack_list(licenses), output)

    if copyrights:
        print_kv('SPDX-FileCopyrightText', unpack_list(copyrights), output)

    if contributors:
        print_kv('SPDX-FileContributor', unpack_list(contributors), output)


def run(po_dir, domain, output):
    print('version = 1', file=output)

    with output:
        for po_file_name in sorted(po_dir.glob('*.po')):
            with open(po_file_name, 'r') as po_file:
                process_file(po_file, domain, output)


def cli():
    parser = argparse.ArgumentParser()

    parser.add_argument('po_dir', type=pathlib.Path)
    parser.add_argument('-d', '--domain', default='ddterm@amezin.github.com')
    parser.add_argument('-o', '--output', type=argparse.FileType('w'), default=sys.stdout)

    run(**vars(parser.parse_args()))


if __name__ == '__main__':
    cli()
