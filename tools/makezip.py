#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-2.0-or-later

"""
Create a zip archive from a list of files and their target names/paths within
the archive.
"""

import argparse
import pathlib
import zipfile


def makezip(output, entries):
    with zipfile.ZipFile(
        output,
        mode='w',
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as out:
        for infile, arcname in entries:
            out.write(infile, arcname=arcname.as_posix())


def cli(*args, **kwargs):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', '-o', type=pathlib.Path, required=True)

    parser.add_argument(
        '--entry',
        '-e',
        dest='entries',
        metavar=('FILE', 'ENTRY_NAME'),
        type=pathlib.Path,
        nargs=2,
        default=[],
        action='append',
        required=True,
    )

    makezip(**vars(parser.parse_args(*args, **kwargs)))


if __name__ == '__main__':
    cli()
