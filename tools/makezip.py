#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import argparse
import contextlib
import os.path
import pathlib
import zipfile


def find_relative_path(path, base_dirs):
    for basepath in base_dirs:
        with contextlib.suppress(ValueError):
            return path.relative_to(basepath).as_posix()

    raise ValueError(f'{str(path)!r} is not a subpath of any of {[str(p) for p in base_dirs]}')


def normalize_path(path):
    return pathlib.Path(os.path.abspath(path))


def makezip(output, inputs, relative_to=None):
    if not relative_to:
        relative_to = [pathlib.Path.cwd()]

    inputs = [normalize_path(p) for p in inputs]
    relative_to = [normalize_path(p) for p in relative_to]

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
