#!/usr/bin/env bash

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

SCRIPT_DIR=$(CDPATH="" cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Using podman because it's necessary for tests anyway
exec "$SCRIPT_DIR/../../do-in-podman.sh" make -C "$SCRIPT_DIR" "$@"
