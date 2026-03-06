#!/usr/bin/env bash
# Render distribution plugin test images using the genart CLI.
# Usage: bash test-renders/render.sh
#
# Prerequisites:
#   cd ~/genart-dev/cli && npm link   (makes `genart` available globally)
#   — or use: npx --prefix ~/genart-dev/cli genart ...

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

GENART="${GENART_CLI:-genart}"

echo "Rendering algorithm-gallery..."
"$GENART" render "$DIR/algorithm-gallery.genart" -o "$DIR/algorithm-gallery.png"

echo "Rendering circle-packing..."
"$GENART" render "$DIR/circle-packing.genart" -o "$DIR/circle-packing.png"

echo "Done. Output in $DIR/"
