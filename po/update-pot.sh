#!/usr/bin/env bash

SCRIPT_DIR=$(CDPATH="" cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
MAKEFILE_DIR="$SCRIPT_DIR/.."

remove_potcdate() {
    sed -f "$SCRIPT_DIR/remove-potcdate.sin" "$@"
}

set -ex

# Update .pot file(s), but keep existing POT-Creation-Date if nothing else changed

for POTFILE in "$SCRIPT_DIR"/*.pot
do
    mv "$POTFILE" "$POTFILE~"  # backup
    make -C "$MAKEFILE_DIR" "$(realpath --relative-to="$MAKEFILE_DIR" "$POTFILE")"
    # Compare ignoring POT-Creation-Date
    if diff <(remove_potcdate "$POTFILE~") <(remove_potcdate "$POTFILE")
    then
        mv "$POTFILE~" "$POTFILE"  # restore old file if no changes
        exit 0
    fi
done

make -C "$MAKEFILE_DIR" msgmerge-fuzzy
