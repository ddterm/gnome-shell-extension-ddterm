#!/bin/bash

set -ex

command -V jq

if [ -n "$(git status --porcelain .)" ]; then
    echo Working copy is dirty
    git status .
    exit 1
fi

CURRENT_VERSION=$(jq .version metadata.json.in)
NEXT_VERSION=$(( ${CURRENT_VERSION} + 1 ))

rm -f *.shell-extension.zip
make
make pack

git tag v${CURRENT_VERSION}

jq ".version=${NEXT_VERSION}" metadata.json.in > metadata.json.next
mv -f metadata.json.next metadata.json.in
make metadata.json

git commit -m "Post-release version bump" metadata.json.in
