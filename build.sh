#!/bin/sh
# Compat wrapper. usage: OUT=dist sh build.sh  (same as: npm run build)
set -e
cd "$(dirname "$0")"
OUT=${OUT:-dist} node scripts/build.mjs "$@"
