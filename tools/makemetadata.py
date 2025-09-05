#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-2.0-or-later

"""
Generate metadata.json for a GNOME Shell extension.

Optionally, get default values for name, description, URL and version from package.json.
"""

import argparse
import json
import sys


# https://gjs.guide/extensions/overview/anatomy.html#version-name
VERSION_NAME_MAX_LEN = 16


def makemetadata(output, package_json, git_revision_file, **kwargs):
    kwargs = {
        key: value for key, value in kwargs.items() if value is not None
    }

    if package_json:
        package_json_data = json.load(package_json)

        if 'name' in package_json_data:
            kwargs.setdefault('name', package_json_data['name'])

        if 'description' in package_json_data:
            kwargs.setdefault('description', package_json_data['description'])

        if 'homepage' in package_json_data:
            kwargs.setdefault('url', package_json_data['homepage'])

        if 'version' in package_json_data:
            kwargs.setdefault('version-name', package_json_data['version'])

    if git_revision_file:
        git_revision = git_revision_file.read().strip()
        kwargs['version-name'] = f"{kwargs['version-name']} {git_revision}"[:VERSION_NAME_MAX_LEN]

    json.dump(kwargs, output, indent=2)
    output.flush()


def cli(*args, **kwargs):
    parser = argparse.ArgumentParser(description=__doc__)

    parser.add_argument('--output', type=argparse.FileType('w'), default=sys.stdout)
    parser.add_argument('--package-json', type=argparse.FileType('r'))
    parser.add_argument('--git-revision-file', type=argparse.FileType('r'))

    # https://gjs.guide/extensions/overview/anatomy.html#metadata-json-required

    parser.add_argument('--uuid', required=True)
    parser.add_argument('--name')
    parser.add_argument('--version-name', dest='version-name')
    parser.add_argument('--ego-version', dest='version')
    parser.add_argument('--description')
    parser.add_argument('--url')
    parser.add_argument('--gettext-domain', dest='gettext-domain')
    parser.add_argument('--settings-schema', dest='settings-schema')

    parser.add_argument(
        '--shell-version',
        dest='shell-version',
        required=True,
        nargs='+',
        action='extend'
    )

    parser.add_argument(
        '--session-modes',
        nargs='+',
        action='extend',
        dest='session-modes'
    )

    makemetadata(**vars(parser.parse_args(*args, **kwargs)))


if __name__ == '__main__':
    cli()
