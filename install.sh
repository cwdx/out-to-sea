#!/bin/sh
# Installs the latest Out to Sea into /Applications:
#   curl -fsSL https://raw.githubusercontent.com/cwdx/out-to-sea/main/install.sh | sh
set -eu

[ "$(uname -s)" = Darwin ] || { echo "Out to Sea's app is for macOS; on other systems open https://sea.cwdx.md" >&2; exit 1; }
case "$(uname -m)" in arm64) arch=arm64 ;; x86_64) arch=x64 ;; *) echo "Unsupported Mac: $(uname -m)" >&2; exit 1 ;; esac
# a Rosetta shell reports x86_64 on Apple silicon
[ "$arch" = x64 ] && [ "$(sysctl -in sysctl.proc_translated)" = 1 ] && arch=arm64

url=$(curl -fsSL https://api.github.com/repos/cwdx/out-to-sea/releases/latest | sed -n "s/.*\"browser_download_url\": *\"\([^\"]*-$arch\.dmg\)\".*/\1/p" | head -1)
[ -n "$url" ] || { echo "No download for $arch in the latest release" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'hdiutil detach -quiet "$tmp/mnt" 2>/dev/null || true; rm -rf "$tmp"' EXIT
echo "Downloading $(basename "$url")"
curl -fsSL -o "$tmp/sea.dmg" "$url"
hdiutil attach -quiet -nobrowse -mountpoint "$tmp/mnt" "$tmp/sea.dmg"
app=$(find "$tmp/mnt" -maxdepth 1 -name "*.app" | head -1)
[ -n "$app" ] || { echo "No app in the disk image" >&2; exit 1; }

# a running copy is asked to quit and waited for, or the open below would only bring the old one forward as it exits
osascript -e 'quit app "OutToSea"' 2>/dev/null || true
for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -f "OutToSea.app/Contents/MacOS" >/dev/null || break; sleep 1; done
pkill -f "OutToSea.app/Contents/MacOS" 2>/dev/null || true
rm -rf "/Applications/$(basename "$app")"
ditto "$app" "/Applications/$(basename "$app")"
# downloaded with curl it carries no quarantine flag, but a copy from a browser download might
xattr -dr com.apple.quarantine "/Applications/$(basename "$app")" 2>/dev/null || true
echo "Installed /Applications/$(basename "$app")"
open "/Applications/$(basename "$app")"
