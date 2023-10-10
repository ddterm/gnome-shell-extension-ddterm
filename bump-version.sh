#!/bin/bash

set -ex

command -V jq

CURRENT_VERSION=$(jq .version metadata.json.in)
NEXT_VERSION=$(( ${CURRENT_VERSION} + 1 ))

git tag v${CURRENT_VERSION}

jq ".version=${NEXT_VERSION}" metadata.json.in > metadata.json.next
mv -f metadata.json.next metadata.json.in

sed -i "/^pkgver=/c\pkgver=${NEXT_VERSION}" PKGBUILD

git commit -m "[ci skip] Post-release version bump" metadata.json.in PKGBUILD
