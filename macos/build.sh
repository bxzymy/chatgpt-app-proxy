#!/usr/bin/env bash
# Build a native AppKit menu-bar application using the macOS JXA runtime.
# No Xcode, npm install, sudo, system proxy, or TUN configuration is used.
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
[[ $(uname -s) == Darwin ]] || { printf 'This application builds on macOS only.\n' >&2; exit 1; }

destination=${1:-"$PWD/dist"}
mkdir -p -- "$destination"
destination=$(cd -- "$destination" && pwd)
bundle="$destination/App Proxy.app"
build_dir=$(mktemp -d "$destination/.app-proxy-build.XXXXXX")
trap 'rm -rf -- "$build_dir"' EXIT

cat macos/ProxyAssistant/Core.js macos/ProxyAssistant/Platform.js macos/ProxyAssistant/App.js > "$build_dir/main.js"
if [[ -e "$bundle" ]]; then
  identifier=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$bundle/Contents/Info.plist" 2>/dev/null || true)
  [[ "$identifier" == local.appproxy.assistant ]] || { printf 'Refusing to overwrite an unrelated app: %s\n' "$bundle" >&2; exit 1; }
fi
staged_bundle="$build_dir/App Proxy.app"
/usr/bin/osacompile -l JavaScript -s -o "$staged_bundle" "$build_dir/main.js"

plist="$staged_bundle/Contents/Info.plist"
set_value() {
  /usr/libexec/PlistBuddy -c "Delete :$1" "$plist" >/dev/null 2>&1 || true
  /usr/libexec/PlistBuddy -c "Add :$1 $2 $3" "$plist"
}
set_value CFBundleIdentifier string local.appproxy.assistant
set_value CFBundleName string 'App Proxy'
set_value CFBundleDisplayName string '应用代理助手'
set_value CFBundleShortVersionString string 1.0.0
set_value CFBundleVersion string 1
set_value LSUIElement bool true
set_value LSMinimumSystemVersion string 13.0
set_value NSHighResolutionCapable bool true
for key in CFBundleIconName LSMinimumSystemVersionByArchitecture NSAppleEventsUsageDescription NSAppleMusicUsageDescription NSCalendarsUsageDescription NSCameraUsageDescription NSContactsUsageDescription NSHomeKitUsageDescription NSMicrophoneUsageDescription NSPhotoLibraryUsageDescription NSRemindersUsageDescription NSSiriUsageDescription NSSystemAdministrationUsageDescription; do
  /usr/libexec/PlistBuddy -c "Delete :$key" "$plist" >/dev/null 2>&1 || true
done

mkdir -p "$staged_bundle/Contents/Resources/Source"
cp macos/ProxyAssistant/Core.js macos/ProxyAssistant/Platform.js macos/ProxyAssistant/App.js "$staged_bundle/Contents/Resources/Source/"
cp docs/macos.zh-CN.md "$staged_bundle/Contents/Resources/README.zh-CN.md"
cp docs/macos.md "$staged_bundle/Contents/Resources/README.md"
mkdir -p "$staged_bundle/Contents/Resources/images/macos"
cp docs/images/macos/*.png "$staged_bundle/Contents/Resources/images/macos/"
if [[ -f macos/Resources/AppProxy.icns ]]; then
  cp macos/Resources/AppProxy.icns "$staged_bundle/Contents/Resources/AppProxy.icns"
  set_value CFBundleIconFile string AppProxy.icns
fi
/usr/bin/codesign --force --sign - "$staged_bundle" >/dev/null
/usr/bin/codesign --verify --deep --strict "$staged_bundle"
if [[ -e "$bundle" ]]; then /bin/mv -- "$bundle" "$build_dir/previous.app"; fi
if ! /bin/mv -- "$staged_bundle" "$bundle"; then
  if [[ -d "$build_dir/previous.app" ]]; then /bin/mv -- "$build_dir/previous.app" "$bundle"; fi
  exit 1
fi
printf 'Built: %s\n' "$bundle"
printf 'Double-click the app to use it. No Terminal window is needed.\n'
