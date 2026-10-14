#!/usr/bin/env bash
# Iris → TestFlight (I12). Three modes:
#   apple/scripts/testflight.sh check      # pre-upload check; needs no Apple account
#   apple/scripts/testflight.sh upload     # check, then archive, sign and upload (I12b)
#   apple/scripts/testflight.sh self-test  # the script's own guard rails
#
# check: Secrets.xcconfig present, git-ignored and filled (values never
# printed); a Release build for the simulator; the built bundle has its
# privacy manifest, export-compliance key, icon and version, and none of the
# DEBUG-only surface (Gallery, seeds, launch flags); it launches and stays up
# (screenshot in apple/build/check-launch.png). Warns about iPad orientations.
#
# upload needs, in the environment (never in the repo):
#   IRIS_TEAM_ID    the Apple Developer team ID
#   ASC_KEY_ID      App Store Connect API key ID
#   ASC_ISSUER_ID   its issuer ID
#   ASC_KEY_PATH    path to the AuthKey_<id>.p8 file, outside this repo
#   IRIS_SIM="iPhone 17 Pro" picks the simulator for check.
set -euo pipefail

APPLE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$(cd "$APPLE_DIR/.." && pwd)"
BUILD="$APPLE_DIR/build"
SIM="${IRIS_SIM:-iPhone 17}"
SECRETS="$APPLE_DIR/Iris/Config/Secrets.xcconfig"
KEYS=(TMDB_API_KEY GOOGLE_BOOKS_API_KEY METRON_USERNAME METRON_PASSWORD)
# Names only DEBUG code carries; none may reach a Release binary.
DEBUG_ONLY=(GalleryView seedDemoLibrary seedLargeLibrary DemoAddCatalogue IrisSeed IrisCatalogue IrisScan IrisGallery)

fail() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

require_upload_env() {
  local missing=()
  for v in IRIS_TEAM_ID ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH; do [[ -n "${!v:-}" ]] || missing+=("$v"); done
  if (( ${#missing[@]} )); then
    {
      echo "Upload needs an Apple Developer Program account (I12b). Set:"
      for v in "${missing[@]}"; do echo "  $v"; done
      echo "See docs/HANDOFF.md (I12) for where each comes from."
    } >&2
    exit 2
  fi
  [[ -f "$ASC_KEY_PATH" ]] || fail "ASC_KEY_PATH: no file at that path"
  case "$(cd "$(dirname "$ASC_KEY_PATH")" && pwd)/" in
    "$REPO_DIR"/*) fail "ASC_KEY_PATH is inside the repo — keep the .p8 outside it" ;;
  esac
}

check_secrets() {
  [[ -f "$SECRETS" ]] || fail "missing $SECRETS (copy Secrets.example.xcconfig and fill it in)"
  if git -C "$REPO_DIR" ls-files --error-unmatch "$SECRETS" >/dev/null 2>&1; then fail "Secrets.xcconfig is tracked by git"; fi
  git -C "$REPO_DIR" check-ignore -q "$SECRETS" || fail "Secrets.xcconfig is not git-ignored"
  for key in "${KEYS[@]}"; do
    # Counted, never printed.
    [[ "$(grep -cE "^[[:space:]]*$key[[:space:]]*=[[:space:]]*[^[:space:]]" "$SECRETS" || true)" -ge 1 ]] || fail "$key is empty in Secrets.xcconfig"
  done
  ok "Secrets.xcconfig: present, git-ignored, ${#KEYS[@]} keys set"
}

build_release() {
  command -v xcodegen >/dev/null || fail "xcodegen not found — brew install xcodegen"
  xcodegen generate --spec "$APPLE_DIR/project.yml" --project "$APPLE_DIR" --quiet
  xcodebuild build -project "$APPLE_DIR/Iris.xcodeproj" -scheme Iris -configuration Release \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath "$BUILD/DerivedData" \
    CODE_SIGNING_ALLOWED=NO -quiet
  APP="$BUILD/DerivedData/Build/Products/Release-iphonesimulator/Iris.app"
  [[ -d "$APP" ]] || fail "no Release app at $APP"
  ok "Release build"
}

plist_value() { plutil -extract "$1" raw -o - "$APP/Info.plist" 2>/dev/null || true; }

inspect_bundle() {
  [[ -f "$APP/PrivacyInfo.xcprivacy" ]] || fail "PrivacyInfo.xcprivacy is not in the bundle"
  [[ "$(plist_value ITSAppUsesNonExemptEncryption)" == "false" ]] || fail "ITSAppUsesNonExemptEncryption is not false"
  [[ "$(plist_value CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconName)" == "AppIcon" ]] || fail "CFBundleIconName is not AppIcon"
  local want; want="$(sed -nE 's/^[[:space:]]*MARKETING_VERSION:[[:space:]]*"?([^"]+)"?.*/\1/p' "$APPLE_DIR/project.yml" | head -1)"
  [[ "$(plist_value CFBundleShortVersionString)" == "$want" ]] || fail "version is not $want"
  for key in "${KEYS[@]}"; do
    # Present and non-empty in the built plist; the value is never shown.
    [[ -n "$(plist_value "$key")" ]] || fail "$key is empty in the built Info.plist"
  done
  local found=()
  # Strings catch the launch flags; symbols catch code that is compiled in
  # but never called (strings alone missed a Release seedDemoLibrary, I12).
  local text symbols
  text="$(strings -a "$APP/Iris")"
  symbols="$(nm -a "$APP/Iris" 2>/dev/null || true)"
  for name in "${DEBUG_ONLY[@]}"; do
    if grep -q "$name" <<<"$text" || grep -q "$name" <<<"$symbols"; then found+=("$name"); fi
  done
  (( ${#found[@]} == 0 )) || fail "DEBUG-only code in the Release binary: ${found[*]}"
  ok "bundle: privacy manifest, export compliance, AppIcon, v$want, keys set, no DEBUG surface"
  local ipad; ipad="$(plutil -extract 'UISupportedInterfaceOrientations~ipad' json -o - "$APP/Info.plist" 2>/dev/null || echo '[]')"
  local n; n="$(echo "$ipad" | tr ',' '\n' | grep -c UIInterfaceOrientation || true)"
  if (( n < 4 )); then
    echo "! iPad supports $n of 4 orientations: App Store validation may reject the upload (ITMS-90474)." >&2
    echo "  Fix at I12b: add all four for iPad, or make the app iPhone-only (TARGETED_DEVICE_FAMILY 1)." >&2
  fi
}

launch_check() {
  xcrun simctl boot "$SIM" 2>/dev/null || true
  xcrun simctl install "$SIM" "$APP"
  xcrun simctl terminate "$SIM" com.peds24.iris 2>/dev/null || true
  # Simulator apps are host processes: watch the launched pid itself (launchd's
  # list lagged under load and read as a quit).
  local pid; pid="$(xcrun simctl launch "$SIM" com.peds24.iris | awk '{print $NF}')"
  [[ "$pid" =~ ^[0-9]+$ ]] || fail "simctl launch gave no pid"
  sleep 3
  kill -0 "$pid" 2>/dev/null || fail "Iris quit within 3 s of launch"
  mkdir -p "$BUILD"
  xcrun simctl io "$SIM" screenshot "$BUILD/check-launch.png" >/dev/null 2>&1
  ok "launches and stays up on $SIM (apple/build/check-launch.png)"
}

check() {
  check_secrets
  build_release
  inspect_bundle
  launch_check
  echo "✓ Ready for TestFlight but for the account (I12b)"
}

upload() {
  require_upload_env
  check
  local build_number; build_number="$(date +%Y%m%d%H%M)"
  local auth=(-allowProvisioningUpdates -authenticationKeyPath "$ASC_KEY_PATH"
              -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
  # The build number is passed, never written to project.yml.
  xcodebuild archive -project "$APPLE_DIR/Iris.xcodeproj" -scheme Iris -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$BUILD/Iris.xcarchive" \
    DEVELOPMENT_TEAM="$IRIS_TEAM_ID" CURRENT_PROJECT_VERSION="$build_number" "${auth[@]}" -quiet
  local options="$BUILD/ExportOptions.plist"
  cp "$APPLE_DIR/ExportOptions.plist" "$options"
  plutil -insert teamID -string "$IRIS_TEAM_ID" "$options"
  # destination=upload: the export sends the build to App Store Connect.
  xcodebuild -exportArchive -archivePath "$BUILD/Iris.xcarchive" -exportOptionsPlist "$options" \
    -exportPath "$BUILD/export" "${auth[@]}"
  ok "uploaded build $build_number — it appears in TestFlight once processed"
}

self_test() {
  local out status
  set +e
  out="$(env -u IRIS_TEAM_ID -u ASC_KEY_ID -u ASC_ISSUER_ID -u ASC_KEY_PATH "$0" upload 2>&1)"; status=$?
  set -e
  [[ $status -eq 2 ]] || fail "self-test: upload without an account exited $status, not 2"
  for v in IRIS_TEAM_ID ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH; do
    grep -q "  $v" <<<"$out" || fail "self-test: the checklist doesn't name $v"
  done
  set +e
  out="$(IRIS_TEAM_ID=T ASC_KEY_ID=K ASC_ISSUER_ID=I ASC_KEY_PATH="$REPO_DIR/package.json" "$0" upload 2>&1)"; status=$?
  set -e
  [[ $status -ne 0 ]] && grep -q "inside the repo" <<<"$out" || fail "self-test: a key inside the repo wasn't refused"
  ok "self-test: upload refuses to run without an account, and refuses a key inside the repo"
}

case "${1:-}" in
  check) check ;;
  upload) upload ;;
  self-test) self_test ;;
  *) echo "usage: $0 check | upload | self-test" >&2; exit 64 ;;
esac
