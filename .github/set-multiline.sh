#!/usr/bin/env bash

if [ $# -lt 1 ] || [ $# -gt 1 ]; then
    echo "Usage: $0 key"
    exit 1
fi

EOF="$(dd if=/dev/urandom bs=15 count=1 status=none | base64)"

echo "$1<<$EOF"
cat -
echo "$EOF"
