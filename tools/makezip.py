#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import argparse
import pathlib
import zipfile


def find_relative_path(path, relative_to):
    path = path.absolute()

    if not relative_to:
        relative_to = [pathlib.Path.cwd()]

    for basepath in relative_to:
        basepath = basepath.absolute()

        try:
            return path.relative_to(basepath).as_posix()
        except ValueError as ex:
            pass

    raise ValueError(f'{str(path)!r} is not a subpath of any of {[str(p) for p in relative_to]}')


def makezip(output, inputs, relative_to=None):
    if not relative_to:
        relative_to = [pathlib.Path.cwd()]

    with zipfile.ZipFile(
        output,
        mode='w',
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as out:
        for infile in inputs:
            out.write(infile, arcname=find_relative_path(infile, relative_to))


def cli(*args, **kwargs):
    parser = argparse.ArgumentParser()
    parser.add_argument('--relative-to', type=pathlib.Path, default=[], action='append')
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('inputs', type=pathlib.Path, nargs='+')

    makezip(**vars(parser.parse_args(*args, **kwargs)))


if __name__ == '__main__':
    cli()
