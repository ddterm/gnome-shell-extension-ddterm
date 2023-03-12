#!/usr/bin/env bash

IMAGE=ghcr.io/ddterm/ci-docker-image
# renovate: datasource=docker depName=ghcr.io/ddterm/ci-docker-image
IMAGE_VERSION=2023.03.11.0

SCRIPT_DIR=$(CDPATH="" cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

TTY_FLAG=$(test -t 0 && echo -n -t)

set -ex

exec podman run --init --rm -i $TTY_FLAG -v "${SCRIPT_DIR}:${SCRIPT_DIR}" -w "${PWD}" "${IMAGE}:${IMAGE_VERSION}" xvfb-run "$@"
