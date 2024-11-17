#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import argparse
import os
import stat
import sys


def capture_stdout(output, argv):
    mode = stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IWGRP | stat.S_IROTH | stat.S_IWOTH
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    os.dup2(fd, sys.stdout.fileno())
    os.execvp(argv[0], argv)


def cli(*args, **kwargs):
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('argv', nargs='+')

    capture_stdout(**vars(parser.parse_args(*args, **kwargs)))


if __name__ == '__main__':
    cli()
