#!/bin/bash

set -ex

TTY_FLAG=-t

if [ ! -t 0 ]; then
    TTY_FLAG=
fi

exec docker run --rm -i $TTY_FLAG -u $(id -u):$(id -g) -v "${PWD}:${PWD}" -w "${PWD}" ghcr.io/amezin/gnome-shell-extension-ddterm-ci-docker-image:master "$@"
