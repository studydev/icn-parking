#!/bin/sh
# Google Play 등록용 이미지를 brand/ 의 SVG에서 만든다. macOS 기본 도구(Quick Look·sips)만 쓴다.
#   sh mobile/shared/scripts/store-graphics.sh
#   - play-icon-512.png        앱 아이콘 512×512 (32비트 PNG, 1024KB 이하)
#   - play-feature-graphic.png 그래픽 이미지 1024×500 (알파 없는 PNG)
# (iOS App Store 아이콘은 icon-ios.sh가 만든다)
set -eu
root=$(cd "$(dirname "$0")/../../.." && pwd)
out="$root/mobile/store/assets"
tmp=$(mktemp -d)
mkdir -p "$out"

qlmanage -t -s 512 -o "$tmp" "$root/mobile/shared/brand/icon.svg" >/dev/null
cp "$tmp/icon.svg.png" "$out/play-icon-512.png"

# Quick Look은 가로로 긴 SVG를 제멋대로 키워 자른다. 정사각 캔버스(1024×1024)의 세로 가운데(262~762)에 배너를 놓고
# 그린 뒤, sips의 가운데 자르기로 1024×500만 남긴다(sips --cropOffset은 이 환경에서 적용되지 않았다).
sed 's|viewBox="0 0 1024 500" width="1024" height="500"|viewBox="0 -262 1024 1024" width="1024" height="1024"|' \
  "$root/mobile/shared/brand/feature-graphic.svg" > "$tmp/feature-graphic.svg"
qlmanage -t -s 1024 -o "$tmp" "$tmp/feature-graphic.svg" >/dev/null
sips -c 500 1024 "$tmp/feature-graphic.svg.png" --out "$tmp/fg-crop.png" >/dev/null
# 알파 채널 제거: JPEG(최고 품질)를 거쳐 PNG로
sips -s format jpeg -s formatOptions 100 "$tmp/fg-crop.png" --out "$tmp/fg.jpg" >/dev/null
sips -s format png "$tmp/fg.jpg" --out "$out/play-feature-graphic.png" >/dev/null
rm -rf "$tmp"

for f in play-icon-512.png play-feature-graphic.png; do
  sips -g pixelWidth -g pixelHeight -g hasAlpha "$out/$f" | awk -v f="$f" 'NR>1 {printf "%s ", $2} END {print "  " f}'
done
ls -l "$out" | awk 'NR>1 {print $5 " bytes  " $9}'
