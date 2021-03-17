#!/bin/bash

set -ex

mkdir -p tmp
DOCKER_BUILDKIT=1 docker build --iidfile tmp/docker.iid .

TTY_FLAG=-t

if [ ! -t 0 ]; then
    TTY_FLAG=
fi

exec docker run --rm -i $TTY_FLAG -u $(id -u):$(id -g) -v "${PWD}:${PWD}" -w "${PWD}" $(cat tmp/docker.iid) xvfb-run "$@"
