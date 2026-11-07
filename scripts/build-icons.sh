#!/usr/bin/env bash
# Render an app's assets/icon.svg into the PNGs the app and packages need:
#   assets/icons/<N>x<N>.png  (hicolor sizes for the desktop entry)
#   assets/tray.png, assets/tray-unread.png (tray, with a red unread dot)
# Usage: scripts/build-icons.sh <assets-dir>   (requires ImageMagick 7: magick)
set -euo pipefail
dir="${1:?usage: build-icons.sh <assets-dir>}"
svg="$dir/icon.svg"
[[ -f "$svg" ]] || { echo "missing $svg" >&2; exit 1; }
mkdir -p "$dir/icons"
for n in 16 24 32 48 64 128 256 512; do
  magick -background none -density 384 "$svg" -resize "${n}x${n}" "$dir/icons/${n}x${n}.png"
done
cp "$dir/icons/512x512.png" "$dir/icon.png"
magick -background none -density 384 "$svg" -resize 64x64 "$dir/tray.png"
magick "$dir/tray.png" -fill '#dc2626' -stroke white -strokewidth 3 -draw 'circle 50,14 50,1' "$dir/tray-unread.png"
echo "icons written to $dir"
