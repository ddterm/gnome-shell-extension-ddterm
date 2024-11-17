#!/bin/bash

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: CC0-1.0

exec script -q -e -c "stty cols 80; $(printf "%q " "$@")"
