#!/usr/bin/env bash

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
    echo "Usage: $0 key value"
    exit 1
fi

EOF="$(dd if=/dev/urandom bs=15 count=1 status=none | base64)"

echo "$1<<$EOF"
[ -z "$2" ] || echo "$2"
echo "$EOF"
