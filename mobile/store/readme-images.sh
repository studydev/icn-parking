#!/bin/sh
# README에 싣는 앱 대표 이미지(플랫폼별 5장)를 만든다 → docs/images/mobile/
#   sh mobile/store/readme-images.sh
#
# 재료는 mobile/store/screenshots/ (git 제외): capture-screenshots.sh 로 찍은 화면과, Android 위젯 모음에 쓰는
# 홈 화면 두 페이지(widgets-page2.png = 소+중, widgets-page3.png = 대). 위젯은 에뮬레이터 홈 화면에 올려 찍는다
# (compose-widgets.swift 머리말 참고). iOS 위젯은 홈 화면 대신 앱 안의 위젯 미리보기(-ICNWidgetGallery) 화면을 쓴다.
# 5장: 실시간 · 예측 · 상세(그래프·시간대별 표) · 히스토리 · 위젯(소·중·대). 폭 540px로 줄여 저장소 용량을 아낀다.
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
shots="$root/mobile/store/screenshots"
out="$root/docs/images/mobile"
work="$root/mobile/ios/.build/readme"   # 외장 디스크(git 제외)
mkdir -p "$out" "$work/mc"

for f in ios/01-live ios/02-forecast ios/03-detail ios/04-history ios/07-widgets \
         android/01-live android/02-forecast android/03-detail android/04-history android/widgets-page2 android/widgets-page3; do
  [ -f "$shots/$f.png" ] || { echo "없는 파일: $shots/$f.png (capture-screenshots.sh 로 먼저 찍으세요)" >&2; exit 1; }
done

tool="$work/compose-widgets"
if [ ! -x "$tool" ] || [ "$root/mobile/store/compose-widgets.swift" -nt "$tool" ]; then
  swiftc -O -module-cache-path "$work/mc" "$root/mobile/store/compose-widgets.swift" -o "$tool"
fi

# 위젯 이미지
"$tool" crop "$shots/ios/07-widgets.png" "$work/ios-widgets.png" 14 190 1178 2230   # 상태 표시줄·가장자리 제외, 마지막 카드까지
"$tool" android "$shots/android/widgets-page2.png" "$shots/android/widgets-page3.png" "$work/android-widgets.png"

shrink() { # 입력 출력
  sips --resampleWidth 540 "$1" --out "$2" >/dev/null
}
n=0
for name in live forecast detail history; do
  n=$((n + 1))
  case $name in live) i=01-live ;; forecast) i=02-forecast ;; detail) i=03-detail ;; history) i=04-history ;; esac
  shrink "$shots/ios/$i.png" "$out/ios-$n-$name.png"
  shrink "$shots/android/$i.png" "$out/android-$n-$name.png"
done
shrink "$work/ios-widgets.png" "$out/ios-5-widgets.png"
shrink "$work/android-widgets.png" "$out/android-5-widgets.png"

for f in "$out"/*.png; do
  sips -g pixelWidth -g pixelHeight "$f" | awk -v f="$(basename "$f")" 'NR>1 {printf "%s ", $2} END {print " " f}'
done
du -ch "$out"/*.png | tail -1
