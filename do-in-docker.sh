#!/usr/bin/env bash

IMAGE=ghcr.io/ddterm/ci-docker-image
# renovate: datasource=docker depName=ghcr.io/ddterm/ci-docker-image
IMAGE_VERSION=2023.03.11.0

SCRIPT_DIR=$(CDPATH="" cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

TTY_FLAG=$(test -t 0 && echo -n -t)
UID_GID=$(id -u):$(id -g)

if [[ " $(groups) " =~ " docker " ]]; then
    docker_cmd=(docker)
else
    docker_cmd=(sudo -g docker docker)
fi

set -ex

exec "${docker_cmd[@]}" run --init --rm -i $TTY_FLAG -u $UID_GID -v "${SCRIPT_DIR}:${SCRIPT_DIR}" -w "${PWD}" "${IMAGE}:${IMAGE_VERSION}" xvfb-run "$@"
