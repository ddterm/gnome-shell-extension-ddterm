#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-2.0-or-later

import argparse
import os.path
import pathlib
import zipfile


def makezip(output, inputs, include, relative_to):
    inputs = [pathlib.Path(os.path.abspath(p)) for p in inputs]
    relative_to = pathlib.Path(os.path.abspath(relative_to))

    with zipfile.ZipFile(
        output,
        mode='w',
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as out:
        for infile in inputs:
            out.write(infile, arcname=infile.relative_to(relative_to).as_posix())

        for infile, arcname in include:
            out.write(infile, arcname=arcname.as_posix())


def cli(*args, **kwargs):
    parser = argparse.ArgumentParser()
    parser.add_argument('--relative-to', type=pathlib.Path, default=pathlib.Path.cwd())
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--include', type=pathlib.Path, nargs=2, default=[], action='append')
    parser.add_argument('inputs', type=pathlib.Path, nargs='+')

    makezip(**vars(parser.parse_args(*args, **kwargs)))


if __name__ == '__main__':
    cli()
