#!/bin/bash

# SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

set -ex

command -V jq

CURRENT_VERSION=$(meson rewrite kwargs info project / 2>&1 | jq -r '.kwargs."project#/".version')
NEXT_VERSION=$(( ${CURRENT_VERSION} + 1 ))

meson rewrite kwargs set project / version "${NEXT_VERSION}"
sed -i "/^pkgver=/c\pkgver=${NEXT_VERSION}" PKGBUILD
meson format -e -i meson.build

git commit -m "Release v${NEXT_VERSION}" meson.build PKGBUILD
git tag "v${NEXT_VERSION}"
