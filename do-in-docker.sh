#!/bin/bash

TTY_FLAG=$(test -t 0 && echo -n -t)
UID_GID=$(id -u):$(id -g)

set -ex

exec docker run --init --rm -i $TTY_FLAG -u $UID_GID -v "${PWD}:${PWD}" -w "${PWD}" ghcr.io/amezin/gnome-shell-pod-34:master xvfb-run "$@"
