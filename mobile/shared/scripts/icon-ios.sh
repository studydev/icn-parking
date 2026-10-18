#!/bin/sh
# iOS 앱 아이콘 PNG(1024, 알파 없음)를 brand/icon.svg에서 만든다. macOS 기본 도구(Quick Look·sips)만 쓴다.
#   sh mobile/shared/scripts/icon-ios.sh
set -eu
root=$(cd "$(dirname "$0")/../../.." && pwd)
out="$root/mobile/ios/App/Assets.xcassets/AppIcon.appiconset"
tmp=$(mktemp -d)
qlmanage -t -s 1024 -o "$tmp" "$root/mobile/shared/brand/icon.svg" >/dev/null
# App Store 아이콘은 알파 채널이 없어야 한다: JPEG(최고 품질)를 거쳐 PNG로
sips -s format jpeg -s formatOptions 100 "$tmp/icon.svg.png" --out "$tmp/icon.jpg" >/dev/null
mkdir -p "$out"
sips -s format png "$tmp/icon.jpg" --out "$out/AppIcon-1024.png" >/dev/null
rm -rf "$tmp"
sips -g pixelWidth -g hasAlpha "$out/AppIcon-1024.png" | tail -2
