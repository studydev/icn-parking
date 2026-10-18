#!/bin/sh
# App Store 제출용 아카이브를 만들고 .ipa로 내보내거나 App Store Connect에 올린다.
#   sh mobile/ios/scripts/archive.sh [--build-number N] [--archive-only] [--upload] [--no-analytics]
#
#   (기본)           아카이브 → .build/export/ 에 .ipa 내보내기
#   --upload         내보내는 대신 App Store Connect(TestFlight)로 바로 올린다
#   --archive-only   아카이브까지만(유료 팀 승인 전에도 서명·빌드 점검용)
#   --build-number N 빌드 번호(CURRENT_PROJECT_VERSION). 같은 버전을 다시 올릴 때마다 올려야 한다
#   --no-analytics   GoogleService-Info.plist 없이 진행(점검용. 출시 빌드에는 쓰지 말 것)
#
# 모든 산출물은 mobile/ios/.build/ (git 제외, 외장 디스크)에 만든다. 시스템 디스크를 쓰지 않으려고
# 패키지 내려받기 캐시와 DerivedData도 그 안에 둔다.
set -eu

ios=$(cd "$(dirname "$0")/.." && pwd)
cd "$ios"
build="$ios/.build"
mode=export; build_number=""; need_analytics=1
while [ $# -gt 0 ]; do
  case "$1" in
    --upload) mode=upload ;;
    --archive-only) mode=archive ;;
    --no-analytics) need_analytics=0 ;;
    --build-number) build_number="${2:?--build-number 뒤에 숫자가 필요합니다}"; shift ;;
    *) echo "알 수 없는 옵션: $1" >&2; exit 2 ;;
  esac
  shift
done

# --- 출시 빌드 점검 -------------------------------------------------------------
local_cfg="$ios/Config/Local.xcconfig"
[ -f "$local_cfg" ] || { echo "Config/Local.xcconfig가 없습니다(Local.xcconfig.example 참고)." >&2; exit 1; }
cfg() { awk -F'=' -v k="$1" '$1 ~ "^[[:space:]]*"k"[[:space:]]*$" { sub(/^[[:space:]]+/, "", $2); sub(/[[:space:]]+$/, "", $2); print $2 }' "$local_cfg" | tail -1; }
team="${ICN_TEAM_ID:-$(cfg DEVELOPMENT_TEAM)}"
[ -n "$team" ] || { echo "DEVELOPMENT_TEAM이 없습니다. Local.xcconfig에 팀 ID를 넣으세요." >&2; exit 1; }
# 데이터 주소가 비어 있으면 앱이 "데이터 주소가 설정되지 않았어요"만 보여 준다: 빌드 전에 막는다
[ -n "$(cfg ICN_DATA_BASE_URL)" ] || { echo "ICN_DATA_BASE_URL이 비어 있습니다. 이대로 출시하면 앱이 데이터를 못 읽습니다." >&2; exit 1; }
if [ "$need_analytics" = 1 ] && [ ! -f "$ios/App/GoogleService-Info.plist" ]; then
  echo "App/GoogleService-Info.plist가 없습니다(docs/MOBILE_ANALYTICS.md 참고)." >&2
  echo "분석 없이 점검만 하려면 --no-analytics 를 붙이세요." >&2
  exit 1
fi
free_kb=$(df -k /System/Volumes/Data | awk 'NR==2 {print $4}')
[ "$free_kb" -gt 3145728 ] || echo "경고: 시스템 디스크 여유가 3GB 미만입니다(Xcode 캐시가 쓸 수 있음)." >&2

# --- 프로젝트 생성: Xcode 창이 열어 둔 파일과 충돌하지 않게 .build/gen 에 따로 만든다 ---
mkdir -p "$build/gen"
xcodegen --quiet --project "$build/gen"
for d in App Widget; do
  mkdir -p "$build/gen/$d"
  ln -sf "../../../$d/Info.plist" "$build/gen/$d/Info.plist"
done

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
archive="$build/archive/ICNParking.xcarchive"
rm -rf "$archive"
extra=""
[ -n "$build_number" ] && extra="CURRENT_PROJECT_VERSION=$build_number"

echo "아카이브 중... (로그: $build/archive.log)"
# shellcheck disable=SC2086
xcodebuild -project "$build/gen/ICNParking.xcodeproj" -scheme ICNParking -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$archive" \
  -derivedDataPath "$build/dd-archive" -clonedSourcePackagesDirPath "$build/spm" -packageCachePath "$build/spm-cache" \
  -allowProvisioningUpdates $extra archive > "$build/archive.log" 2>&1 || {
    grep -E "error:" "$build/archive.log" | head -8 >&2
    echo "아카이브 실패. 전체 로그: $build/archive.log" >&2
    exit 1
  }
echo "아카이브 완료: $archive"
/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleShortVersionString' "$archive/Info.plist" | sed 's/^/  버전 /'
/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleVersion' "$archive/Info.plist" | sed 's/^/  빌드 /'
/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:SigningIdentity' "$archive/Info.plist" | sed 's/^/  서명 /'
[ "$mode" = archive ] && { echo "--archive-only: 내보내기는 건너뜁니다."; exit 0; }

# --- 내보내기 / 업로드 ----------------------------------------------------------
dest=export; [ "$mode" = upload ] && dest=upload
opts="$build/ExportOptions.plist"
cat > "$opts" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$dest</string>
  <key>teamID</key><string>$team</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
EOF
echo "내보내기($dest) 중... (로그: $build/export.log)"
xcodebuild -exportArchive -archivePath "$archive" -exportPath "$build/export" -exportOptionsPlist "$opts" \
  -allowProvisioningUpdates > "$build/export.log" 2>&1 || {
    grep -E "error:|Error" "$build/export.log" | head -8 >&2
    echo "내보내기 실패. 전체 로그: $build/export.log" >&2
    echo "유료 팀(Apple Developer Program)이 아직 활성화되지 않았거나 App Store Connect에 앱이 없을 때 실패합니다." >&2
    exit 1
  }
if [ "$mode" = upload ]; then echo "App Store Connect에 업로드했습니다. TestFlight에 처리되면 나타납니다."
else echo "내보내기 완료: $build/export"; ls "$build/export"; fi
