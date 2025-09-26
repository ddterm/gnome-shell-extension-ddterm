#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-2.0-or-later

"""
Fix and verify metadata.json for a GNOME Shell extension.
"""

import argparse
import json
import re


# https://gjs.guide/extensions/overview/anatomy.html#version-name
VERSION_NAME_MAX_LEN = 16
VERSION_NAME_RE = re.compile(r'^(?!^[. ]+$)[a-zA-Z0-9 .]{1,16}$')


def fixmetadata(input, output):
    data = json.load(input)

    data['version-name'] = data['version-name'][:VERSION_NAME_MAX_LEN]

    if not VERSION_NAME_RE.match(data['version-name']):
        raise ValueError(f'version-name {data['version-name']} does not match {VERSION_NAME_RE}')

    json.dump(data, output, indent=2)
    output.flush()


def cli(*args, **kwargs):
    parser = argparse.ArgumentParser(description=__doc__)

    parser.add_argument('input', type=argparse.FileType('r'))
    parser.add_argument('output', type=argparse.FileType('w'))

    fixmetadata(**vars(parser.parse_args(*args, **kwargs)))


if __name__ == '__main__':
    cli()
