#!/usr/bin/env bash

set -euo pipefail

MANIFEST_VERSION=$(jq -r '.version' manifest.json)

if [ "v$MANIFEST_VERSION" != "$GITHUB_REF_NAME" ]; then
    echo "Version mismatch: manifest=v$MANIFEST_VERSION, tag=$GITHUB_REF_NAME" >&2
    exit 1
fi
