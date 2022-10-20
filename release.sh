#!/bin/bash

IGNORE_DIRTY=0

while [[ $# -gt 0 ]]; do
    case $1 in
        -i|--ignore-dirty)
            IGNORE_DIRTY=1
            shift;;
        *)
            echo Unexpected argument $1
            exit 2;;
    esac
done

set -ex

command -V jq

if [ $IGNORE_DIRTY -ne 1 ] && [ -n "$(git status --porcelain .)" ]; then
    echo Working copy is dirty. Run $0 --ignore-dirty to ignore.
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

git commit -m "[ci skip] Post-release version bump" metadata.json.in
