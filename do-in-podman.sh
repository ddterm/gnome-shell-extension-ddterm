#!/usr/bin/env bash

# SPDX-FileCopyrightText: 2021 Aleksandr Mezin <mezin.alexander@gmail.com>
# SPDX-FileContributor: 2023 Zerocool56
#
# SPDX-License-Identifier: GPL-3.0-or-later

IMAGE=ghcr.io/ddterm/ci-docker-image
# renovate: datasource=docker depName=ghcr.io/ddterm/ci-docker-image
IMAGE_VERSION=2025.07.22.0

SCRIPT_REALPATH="$(realpath "$0")"
SCRIPT_DIR="${SCRIPT_REALPATH%/*}"
HOME_DIR="${SCRIPT_DIR}/.container-home"

TTY_FLAG="$(test -t 0 && echo -n -t)"

set -ex

exec podman run --init --rm -i "${TTY_FLAG}" -e HOME="${HOME_DIR}" --security-opt label=disable -v "${SCRIPT_DIR}:${SCRIPT_DIR}" -w "${PWD}" "${IMAGE}:${IMAGE_VERSION}" xvfb-run "$@"
