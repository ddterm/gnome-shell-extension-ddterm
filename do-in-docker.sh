#!/usr/bin/env bash

IMAGE=ghcr.io/ddterm/ci-docker-image
# renovate: datasource=docker depName=ghcr.io/ddterm/ci-docker-image
IMAGE_VERSION=2024.05.03.0

SCRIPT_REALPATH="$(realpath "$0")"
SCRIPT_DIR="${SCRIPT_REALPATH%/*}"
HOME_DIR="${SCRIPT_DIR}/.container-home"
TTY_FLAG="$(test -t 0 && echo -n -t)"
UID_GID="$(id -u):$(id -g)"

if [[ " $(groups) " =~ " docker " ]]; then
    docker_cmd=(docker)
else
    docker_cmd=(sudo -g docker docker)
fi

set -ex

exec "${docker_cmd[@]}" run --init --rm -i "${TTY_FLAG}" -u "${UID_GID}" -e HOME="${HOME_DIR}" --security-opt label=disable -v "${SCRIPT_DIR}:${SCRIPT_DIR}" -w "${PWD}" "${IMAGE}:${IMAGE_VERSION}" xvfb-run "$@"
