#!/bin/sh
# 스토어 등록용 스크린샷을 시뮬레이터·에뮬레이터에서 실제 데이터로 찍는다.
#   sh mobile/store/capture-screenshots.sh ios       [--build]
#   sh mobile/store/capture-screenshots.sh android   [--build]
#
# 결과: mobile/store/screenshots/{ios,android}/NN-이름.png (git 제외, 올리기 전에 다시 찍는다)
#   iOS     시뮬레이터(기본 "iPhone 17", 1206×2622). Apple 문서상 이 6.1인치급 한 세트가 필수이고 더 큰 화면은 선택
#           (6.9" 세트를 원하면 IOS_SIM="iPhone 18 Pro Max"; 처음 부팅하면 시스템 디스크를 1GB 이상 쓴다)
#   Android 에뮬레이터 화면을 1080×1920(16:9)로 바꿔 찍는다. Play는 긴 변이 짧은 변의 2배를 넘으면 거부한다.
# --build  앱을 새로 빌드해서 설치(없으면 이미 설치된 앱을 쓴다)
#
# 환경 변수: IOS_SIM(시뮬레이터 이름), ANDROID_SERIAL(기본 emulator-5554). Android는 에뮬레이터만 허용한다
# (연결된 실기기를 실수로 건드리지 않도록).
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
platform="${1:-}"; shift || true
build=0; [ "${1:-}" = "--build" ] && build=1
out="$root/mobile/store/screenshots/$platform"
mkdir -p "$out"
rm -f "$out"/*.png
wait_s="${SCREENSHOT_WAIT:-9}"   # 화면이 실데이터로 그려질 때까지

# 시뮬레이터·에뮬레이터는 시스템 디스크에 데이터를 쓴다. 여유가 2GB 미만이면 시작하지 않는다.
free_kb=$(df -k /System/Volumes/Data | awk 'NR==2 {print $4}')
[ "$free_kb" -gt 2097152 ] || { echo "시스템 디스크 여유가 2GB 미만이라 중단합니다. 먼저 공간을 확보하세요." >&2; exit 1; }

# 알파 채널 제거(두 스토어 모두 알파 없는 PNG/JPEG만 받는다): JPEG(최고 품질)를 거쳐 PNG로
flatten() {
  tmp=$(mktemp).jpg
  sips -s format jpeg -s formatOptions 100 "$1" --out "$tmp" >/dev/null
  sips -s format png "$tmp" --out "$1" >/dev/null
  rm -f "$tmp"
}

report() {
  for f in "$out"/*.png; do
    sips -g pixelWidth -g pixelHeight -g hasAlpha "$f" | awk -v f="$(basename "$f")" 'NR>1 {printf "%s ", $2} END {print " " f}'
  done
}

case "$platform" in
ios)
  ios="$root/mobile/ios"
  sim_name="${IOS_SIM:-iPhone 17}"
  export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
  udid=$(xcrun simctl list devices available | grep -F "$sim_name (" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' | head -1)
  [ -n "$udid" ] || { echo "시뮬레이터를 찾을 수 없습니다: $sim_name" >&2; exit 1; }
  app="$ios/.build/dd-sim/Build/Products/Debug-iphonesimulator/ICNParking.app"
  if [ "$build" = 1 ] || [ ! -d "$app" ]; then
    mkdir -p "$ios/.build/gen"
    (cd "$ios" && xcodegen --quiet --project .build/gen)
    for d in App Widget; do mkdir -p "$ios/.build/gen/$d"; ln -sf "../../../$d/Info.plist" "$ios/.build/gen/$d/Info.plist"; done
    echo "빌드 중... (로그: $ios/.build/sim-build.log)"
    xcodebuild -project "$ios/.build/gen/ICNParking.xcodeproj" -scheme ICNParking -configuration Debug \
      -destination "id=$udid" -derivedDataPath "$ios/.build/dd-sim" -clonedSourcePackagesDirPath "$ios/.build/spm" \
      -packageCachePath "$ios/.build/spm-cache" build > "$ios/.build/sim-build.log" 2>&1 || {
        grep -E "error:" "$ios/.build/sim-build.log" | head -5 >&2; echo "빌드 실패" >&2; exit 1; }
  fi
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null 2>&1 || { echo "시뮬레이터 부팅에 실패했습니다: $sim_name" >&2; exit 1; }
  xcrun simctl ui "$udid" appearance light
  # 상태 표시줄 시각은 지금 시각으로(앱 안의 "지금 HH:MM"과 어긋나 보이지 않게)
  xcrun simctl status_bar "$udid" override --time "$(date +%H:%M)" --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
  xcrun simctl install "$udid" "$app"
  n=0
  work=$(mktemp -d)
  shot() { # 이름 인자...
    n=$((n + 1)); name=$1; shift
    xcrun simctl terminate "$udid" com.studydev.icnparking 2>/dev/null || true
    xcrun simctl launch "$udid" com.studydev.icnparking "$@" >/dev/null
    sleep "$wait_s"
    f=$(printf '%s/%02d-%s.png' "$out" "$n" "$name")
    # 시뮬레이터 서비스는 외장 디스크에 직접 쓸 권한이 없다("Operation not permitted"): 임시 폴더에 찍고 옮긴다
    xcrun simctl io "$udid" screenshot "$work/shot.png" >/dev/null 2>&1 || { echo "스크린샷 실패: $name" >&2; exit 1; }
    mv "$work/shot.png" "$f"
    flatten "$f"
  }
  shot live         -ICNInitialTab live
  shot forecast     -ICNInitialTab forecast
  shot detail       -ICNInitialSheet t1-long-p1
  shot history      -ICNInitialTab history
  shot shuttle      -ICNInitialTab shuttle
  shot settings     -ICNInitialTab settings
  shot widgets      -ICNWidgetGallery YES
  xcrun simctl ui "$udid" appearance dark
  shot live-dark    -ICNInitialTab live
  xcrun simctl ui "$udid" appearance light
  xcrun simctl status_bar "$udid" clear
  rm -rf "$work"
  ;;
android)
  serial="${ANDROID_SERIAL:-emulator-5554}"
  case "$serial" in emulator-*) ;; *) echo "에뮬레이터만 지원합니다(지정한 기기: $serial)." >&2; exit 1 ;; esac
  adb="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
  a() { "$adb" -s "$serial" "$@"; }
  a get-state >/dev/null 2>&1 || { echo "에뮬레이터($serial)가 실행 중이 아닙니다." >&2; exit 1; }
  apk="$root/mobile/android/app/build/outputs/apk/debug/app-debug.apk"
  if [ "$build" = 1 ] || [ ! -f "$apk" ]; then
    (cd "$root/mobile/android" && JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}" ./gradlew :app:assembleDebug -q)
  fi
  a install -r "$apk" >/dev/null
  restore() {
    a shell wm size reset >/dev/null 2>&1 || true
    a shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null 2>&1 || true
  }
  trap restore EXIT
  a shell wm size 1080x1920 >/dev/null
  # 상태 표시줄을 깨끗하게(지금 시각, 배터리 100%, 전파 가득)
  a shell settings put global sysui_demo_allowed 1
  a shell settings put system time_12_24 24   # 앱이 24시간제("20:55")라 상태 표시줄도 맞춘다
  demo() { a shell am broadcast -a com.android.systemui.demo "$@" >/dev/null; }
  demo -e command enter
  demo -e command clock -e hhmm "$(date +%H%M)"
  demo -e command battery -e level 100 -e plugged false
  demo -e command network -e wifi show -e level 4
  demo -e command network -e mobile hide
  demo -e command notifications -e visible false
  n=0
  shot() { # 이름 인자...
    n=$((n + 1)); name=$1; shift
    a shell am force-stop com.studydev.icnparking
    a shell am start -n com.studydev.icnparking/.MainActivity "$@" >/dev/null
    sleep "$wait_s"
    f=$(printf '%s/%02d-%s.png' "$out" "$n" "$name")
    a exec-out screencap -p > "$f"
    flatten "$f"
  }
  shot live      --es tab live
  shot forecast  --es tab forecast
  shot detail    --es sheet t1-long-p1
  shot history   --es tab history
  shot shuttle   --es tab shuttle
  shot settings  --es tab settings
  ;;
*)
  echo "사용법: sh mobile/store/capture-screenshots.sh ios|android [--build]" >&2
  exit 2
  ;;
esac

echo "스크린샷을 저장했습니다: $out"
report
