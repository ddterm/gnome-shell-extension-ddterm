#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-2.0-or-later

import argparse
import contextlib
import os
import shlex
import subprocess
import sys


def terminate_process(popen):
    popen.terminate()

    try:
        popen.wait(timeout=10)
    except subprocess.TimeoutExpired:
        popen.kill()
        raise


def run(command, xvfb_executable):
    with contextlib.ExitStack() as stack:
        display_r, display_w = os.pipe()

        with open(display_r, 'rb', buffering=0, closefd=True) as display_reader:
            try:
                args = (
                    xvfb_executable,
                    '-nolisten',
                    'tcp',
                    '-noreset',
                    '-displayfd',
                    str(display_w)
                )

                print(shlex.join(args), file=sys.stderr)

                xvfb_popen = subprocess.Popen(args, pass_fds=(display_w,))
                stack.enter_context(xvfb_popen)
                stack.callback(terminate_process, xvfb_popen)

            finally:
                os.close(display_w)

            env = dict(os.environb, DISPLAY=b':' + display_reader.read().rstrip())

        subprocess.run(command, env=env)


def cli():
    parser = argparse.ArgumentParser()

    parser.add_argument('command', nargs='+')
    parser.add_argument('--xvfb-executable', default='Xvfb')

    run(**vars(parser.parse_args()))


if __name__ == '__main__':
    cli()
