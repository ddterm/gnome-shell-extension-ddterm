#!/bin/bash

set -ex

command -V jq

if [ -n "$(git status --untracked-files=no --porcelain .)" ]; then
    echo Working copy is dirty
    git status --untracked-files=no .
fi

CURRENT_VERSION=$(jq .version metadata.json)
NEXT_VERSION=$(( ${CURRENT_VERSION} + 1 ))

rm -f *.shell-extension.zip
make pack

git tag v${CURRENT_VERSION}

jq ".version=${NEXT_VERSION}" metadata.json > metadata.json.next
mv -f metadata.json.next metadata.json

git commit -m "Post-release version bump" metadata.json
