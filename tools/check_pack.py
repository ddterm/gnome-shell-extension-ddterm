#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import argparse
import tempfile
import subprocess
import sys
import zipfile


def check_pack(zip_file, command):
    with tempfile.TemporaryDirectory() as tmpdir:
        with zipfile.ZipFile(zip_file) as zipf:
            zipf.extractall(tmpdir)

        sys.exit(subprocess.run(command, cwd=tmpdir).returncode)


def cli(*args, **kwargs):
    parser = argparse.ArgumentParser()
    parser.add_argument('zip_file', type=argparse.FileType('rb'))
    parser.add_argument('command', nargs='+')

    check_pack(**vars(parser.parse_args(*args, **kwargs)))


if __name__ == '__main__':
    cli()
