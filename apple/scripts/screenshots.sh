#!/usr/bin/env bash
# Regenerate the Iris kit's reference screenshots (spec §4.3, §8 I6) into
# docs/design/iris/: <Component>-{light,dark,ax5}.png from the debug Gallery.
#   apple/scripts/screenshots.sh                         # all ten components
#   apple/scripts/screenshots.sh IrisCover,IrisProgress  # just these
#   IRIS_SIM="iPhone 17 Pro" apple/scripts/screenshots.sh
#   IRIS_SCREENSHOT_OUT=/tmp/shots apple/scripts/screenshots.sh   # elsewhere
set -euo pipefail

APPLE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$(cd "$APPLE_DIR/.." && pwd)"
OUT="${IRIS_SCREENSHOT_OUT:-$REPO_DIR/docs/design/iris}"
SIM="${IRIS_SIM:-iPhone 17}"

command -v xcodegen >/dev/null || { echo "xcodegen not found — brew install xcodegen" >&2; exit 1; }
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

xcodegen generate --spec "$APPLE_DIR/project.yml" --project "$APPLE_DIR" --quiet
xcrun simctl boot "$SIM" 2>/dev/null || true
# A fixed, clean status bar so screenshots diff only when the UI does.
xcrun simctl status_bar "$SIM" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
trap 'xcrun simctl status_bar "$SIM" clear' EXIT

TEST_RUNNER_IRIS_SCREENSHOT_DIR="$OUT" TEST_RUNNER_IRIS_SCREENSHOT_ONLY="${1:-}" xcodebuild test \
  -project "$APPLE_DIR/Iris.xcodeproj" \
  -scheme Iris \
  -destination "platform=iOS Simulator,name=$SIM" \
  -derivedDataPath "$APPLE_DIR/DerivedData" \
  -only-testing:IrisUITests/GalleryTests/testCaptureGalleryScreenshots \
  -quiet

echo "✓ Screenshots in $OUT"
