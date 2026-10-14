#!/usr/bin/env bash
# Iris mark → PNGs (I11): renders design/iris/icon/*.svg (from `npm run mark`)
# into the app's asset catalogue — the 1024 px AppIcon in light, dark and
# tinted, and the 200 pt LaunchMark in light and dark. Needs rsvg-convert
# (brew install librsvg). The PNGs are committed; rerun after `npm run mark`.
#   apple/scripts/render-mark.sh
set -euo pipefail

APPLE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ICON_SRC="$APPLE_DIR/../design/iris/icon"
ASSETS="$APPLE_DIR/Iris/Resources/Assets.xcassets"

command -v rsvg-convert >/dev/null || { echo "rsvg-convert not found — brew install librsvg" >&2; exit 1; }

render() { # svg, px, out, [background]
  local args=(-w "$2" -h "$2")
  [[ -n "${4:-}" ]] && args+=(-b "$4")
  rsvg-convert "${args[@]}" "$ICON_SRC/$1" -o "$3"
  echo "wrote ${3#"$APPLE_DIR/"}"
}

# App icons are opaque: the background flag keeps the alpha channel out.
render light.svg 1024 "$ASSETS/AppIcon.appiconset/icon-light.png" '#FFFFFF'
render dark.svg 1024 "$ASSETS/AppIcon.appiconset/icon-dark.png" '#000000'
render tinted.svg 1024 "$ASSETS/AppIcon.appiconset/icon-tinted.png" '#000000'
# The launch mark is 200 pt wide, transparent on LaunchBackground.
for scale in 2 3; do
  render launch-light.svg $((200 * scale)) "$ASSETS/LaunchMark.imageset/launch-light@${scale}x.png"
  render launch-dark.svg $((200 * scale)) "$ASSETS/LaunchMark.imageset/launch-dark@${scale}x.png"
done
