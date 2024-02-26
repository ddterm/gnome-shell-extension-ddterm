#!/usr/bin/env bash

# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: MIT

LICENSE="${LICENSE:-GPL-3.0-or-later}"

for file in "$@";
do
    git log --format="format:%an <%aE> %ad" --date="format:%Y" -- "$file" | sort | uniq | while IFS= read -r line
    do
        year="${line##* }"
        author="${line% *}"
        reuse annotate --year "$year" --copyright "$author" --copyright-style spdx-symbol --license "$LICENSE" $file
    done
done
