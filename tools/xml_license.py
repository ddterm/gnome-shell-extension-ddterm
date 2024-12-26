#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-2.0-or-later

import argparse
import codecs
import sys
import xml.parsers.expat


def xml_license_extract(input_file, output):
    comments = []

    def comment_handler(data):
        if 'SPDX-FileCopyrightText:' in data or 'SPDX-License-Identifier:' in data:
            comments.append(data)

    parser = xml.parsers.expat.ParserCreate()
    parser.CommentHandler = comment_handler
    parser.ParseFile(input_file)

    output.write('\n'.join(comments))


def xml_license_embed(input_file, output, license):
    encoder = codecs.getincrementalencoder('UTF-8')(errors='xmlcharrefreplace')

    def xml_decl_handler(version, encoding, standalone):
        nonlocal encoder

        if encoding:
            output.write(encoder.encode('', final=True))
            encoder = codecs.getincrementalencoder(encoding)(errors='xmlcharrefreplace')

        declarations = []

        if version:
            declarations.append(f'version="{version}"')

        if encoding:
            declarations.append(f'encoding="{encoding}"')

        if standalone != -1:
            declarations.append(f'standalone="{"yes" if standalone else "no"}"')

        output.write(encoder.encode(f'<?xml {" ".join(declarations)}?>'))
        output.write(encoder.encode(f'\n<!--{license.read()}-->'))

    parser = xml.parsers.expat.ParserCreate()
    parser.XmlDeclHandler = xml_decl_handler
    parser.DefaultHandler = lambda data: output.write(encoder.encode(data))
    parser.ParseFile(input_file)

    output.write(encoder.encode('', final=True))


def xml_license(func, **kwargs):
    func(**kwargs)


def cli(*args, **kwargs):
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(required=True)

    extract_parser = subparsers.add_parser('extract')
    extract_parser.add_argument('--output', type=argparse.FileType('w'), default=sys.stdout)
    extract_parser.add_argument('input_file', type=argparse.FileType('rb'))
    extract_parser.set_defaults(func=xml_license_extract)

    embed_parser = subparsers.add_parser('embed')
    embed_parser.add_argument('--output', type=argparse.FileType('wb'), default=sys.stdout.buffer)
    embed_parser.add_argument('--license', type=argparse.FileType('r'), required=True)
    embed_parser.add_argument('input_file', type=argparse.FileType('rb'))
    embed_parser.set_defaults(func=xml_license_embed)

    xml_license(**vars(parser.parse_args(*args, **kwargs)))


if __name__ == '__main__':
    cli()
