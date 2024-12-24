#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import argparse
import sys
import xml.dom.minidom


def xml_license_extract(input_file, output):
    dom = xml.dom.minidom.parse(input_file)

    output.write(dom.firstChild.data.strip() + '\n')


def xml_license_embed(input_file, output, license):
    dom = xml.dom.minidom.parse(input_file)
    comment = dom.createComment(license.read().strip() + '\n')

    dom.insertBefore(comment, dom.documentElement)
    dom.writexml(output, encoding=output.encoding)


def xml_license(func, **kwargs):
    func(**kwargs)


def cli(*args, **kwargs):
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(required=True)

    extract_parser = subparsers.add_parser('extract')
    extract_parser.add_argument('--output', type=argparse.FileType('w'), default=sys.stdout)
    extract_parser.add_argument('input_file', type=argparse.FileType('r'))
    extract_parser.set_defaults(func=xml_license_extract)

    embed_parser = subparsers.add_parser('embed')
    embed_parser.add_argument('--output', type=argparse.FileType('w'), default=sys.stdout)
    embed_parser.add_argument('--license', type=argparse.FileType('r'), required=True)
    embed_parser.add_argument('input_file', type=argparse.FileType('r'))
    embed_parser.set_defaults(func=xml_license_embed)

    xml_license(**vars(parser.parse_args(*args, **kwargs)))


if __name__ == '__main__':
    cli()
