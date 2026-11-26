#!/usr/bin/env bash
# Run on macOS after macos/build.sh. ditto preserves app bundle metadata and modes.
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
[[ $(uname -s) == Darwin ]] || { printf 'macOS packaging requires macOS.\n' >&2; exit 1; }
version=$(tr -d '\r\n' < VERSION)
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { printf 'Invalid VERSION.\n' >&2; exit 1; }
output=${1:-"$PWD/dist/releases/v$version"}
mkdir -p -- "$output"
output=$(cd -- "$output" && pwd)
bundle="$PWD/dist/App Proxy.app"
[[ -d $bundle ]] || { printf 'Build the macOS app before packaging.\n' >&2; exit 1; }
actual=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$bundle/Contents/Info.plist")
[[ $actual == "$version" ]] || { printf 'The app version differs from VERSION. Rebuild it.\n' >&2; exit 1; }
executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$bundle/Contents/Info.plist")
/usr/bin/codesign --verify --deep --strict "$bundle"
/usr/bin/lipo -verify_arch arm64 x86_64 "$bundle/Contents/MacOS/$executable"
name="AppProxy-$version-macOS-universal"
archive="$output/$name.zip"
[[ ! -e $archive ]] || { printf 'Refusing to overwrite an existing release: %s\n' "$archive" >&2; exit 1; }
mkdir -p "$PWD/.build"
stage=$(mktemp -d "$PWD/.build/release-macos.XXXXXX")
# This uniquely created directory is the only directory removed by this script.
trap 'rm -rf -- "$stage"' EXIT
package="$stage/$name"
mkdir -p "$package"
/usr/bin/ditto "$bundle" "$package/App Proxy.app"
cp release/README.macos.md "$package/README.md"
cp release/README.macos.zh-CN.md "$package/README.zh-CN.md"
cp LICENSE "$package/LICENSE"
commit=$(git rev-parse HEAD)
dirty=false
[[ -z $(git status --porcelain --untracked-files=normal) ]] || dirty=true
printf '{"version":"%s","platform":"macOS","architecture":"arm64 x86_64","sourceCommit":"%s","sourceDirty":%s,"builtAtUtc":"%s","signature":"ad-hoc; not notarized"}\n' \
  "$version" "$commit" "$dirty" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$package/BUILD-INFO.json"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$package" "$archive"
# Verify the application extracted from the final ZIP, including its signature and slices.
/usr/bin/ditto -x -k "$archive" "$stage/extracted"
extracted="$stage/extracted/$name/App Proxy.app"
/usr/bin/codesign --verify --deep --strict "$extracted"
/usr/bin/lipo -verify_arch arm64 x86_64 "$extracted/Contents/MacOS/$executable"
[[ -f "$stage/extracted/$name/README.zh-CN.md" && -f "$stage/extracted/$name/LICENSE" ]]
printf 'Packaged and verified: %s\n' "$archive"
