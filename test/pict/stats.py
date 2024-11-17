#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import argparse
import collections


def stats(input_file):
    header = next(input_file).rstrip('\n').split('\t')
    count = [collections.defaultdict(lambda: 0) for _ in range(len(header))]

    for line in input_file:
        for value, counter in zip(line.rstrip('\n').split('\t'), count, strict=True):
            counter[value] += 1

    for name, counter in zip(header, count):
        print(name, ':', dict(counter))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input_file', type=argparse.FileType('r'))

    stats(**vars(parser.parse_args()))


if __name__ == '__main__':
    main()
