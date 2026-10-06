#!/usr/bin/env bash
# Iris native test runner: regenerate the Xcode project, run IrisCore's
# tests on the Mac, then the app's UI tests on an iOS simulator.
#   apple/scripts/test.sh              # everything
#   apple/scripts/test.sh --core-only  # IrisCore only (no simulator)
#   IRIS_SIM="iPhone 17 Pro" apple/scripts/test.sh
set -euo pipefail

APPLE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SIM="${IRIS_SIM:-iPhone 17}"

command -v xcodegen >/dev/null || { echo "xcodegen not found — brew install xcodegen" >&2; exit 1; }

echo "▸ IrisCore (swift test)"
swift test --package-path "$APPLE_DIR/IrisCore"

[[ "${1:-}" == "--core-only" ]] && exit 0

if ! xcrun simctl list devices available | grep -q "    $SIM ("; then
  echo "Simulator \"$SIM\" is not installed. Available iPhones:" >&2
  xcrun simctl list devices available | grep -E "^\s+iPhone" | sed -E 's/ \(.*//' >&2
  echo "Set IRIS_SIM to one of these." >&2
  exit 1
fi

echo "▸ Generating Iris.xcodeproj"
xcodegen generate --spec "$APPLE_DIR/project.yml" --project "$APPLE_DIR" --quiet

echo "▸ Iris UI tests on $SIM"
xcodebuild test \
  -project "$APPLE_DIR/Iris.xcodeproj" \
  -scheme Iris \
  -destination "platform=iOS Simulator,name=$SIM" \
  -derivedDataPath "$APPLE_DIR/DerivedData" \
  -quiet
echo "✓ All Iris tests passed"
