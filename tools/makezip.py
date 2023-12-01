#!/usr/bin/env python3

import argparse
import os.path
import zipfile


def makezip(output, inputs, relative_to):
    with zipfile.ZipFile(
        output,
        mode='w',
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as out:
        for infile in inputs:
            out.write(infile, arcname=os.path.relpath(infile, relative_to))


def cli(*args, **kwargs):
    parser = argparse.ArgumentParser()
    parser.add_argument('--relative-to', default=os.curdir)
    parser.add_argument('--output', required=True)
    parser.add_argument('inputs', nargs='+')

    makezip(**vars(parser.parse_args(*args, **kwargs)))


if __name__ == '__main__':
    cli()
