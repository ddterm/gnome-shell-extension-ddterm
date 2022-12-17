#!/usr/bin/env bash

SCRIPT_DIR=$(CDPATH="" cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Using podman because it's necessary for tests anyway
exec "$SCRIPT_DIR/../../do-in-podman.sh" tox -c "$SCRIPT_DIR/.." --sitepackages -r -e pip-compile
