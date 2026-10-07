#!/bin/sh
set -e

REAL_HERMESC="${HERMES_REAL_CLI_PATH:-$PODS_ROOT/hermes-engine/destroot/bin/hermesc}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
GLOBALS_FILE="$SCRIPT_DIR/hermes-runtime-globals.js"

if [ ! -x "$REAL_HERMESC" ]; then
  echo "error: Hermes compiler was not found at $REAL_HERMESC" >&2
  exit 1
fi

if [ ! -f "$GLOBALS_FILE" ]; then
  echo "error: Hermes runtime globals file was not found at $GLOBALS_FILE" >&2
  exit 1
fi

# Metro's split-bundle loader contains an intentional eval fallback. Keep all
# other diagnostics and teach Hermes which runtime-provided globals are valid.
exec "$REAL_HERMESC" -Wno-direct-eval -include-globals="$GLOBALS_FILE" "$@"
