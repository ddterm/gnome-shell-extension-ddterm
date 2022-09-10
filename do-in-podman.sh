#!/usr/bin/env bash

SCRIPT_DIR=$(CDPATH="" cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

TTY_FLAG=$(test -t 0 && echo -n -t)

set -ex

exec podman run --init --rm -i $TTY_FLAG -v "${SCRIPT_DIR}:${SCRIPT_DIR}" -w "${PWD}" ghcr.io/ddterm/ci-docker-image:latest xvfb-run "$@"
