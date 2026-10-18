# Claude Code로 iOS·Android 앱 개발하기 (v5 디자인 기준)

입력: 디자인 패키지 `design_handoff_icn_parking_native/`(README + `ICN Parking App v5.dc.html` + `data/shuttle.json`)와 저장소 `studydev/icn-parking`.
**서버·API 추가 없음.** 앱은 웹과 같은 공개 파일(`latest.json`, `days/YYYY-MM-DD.json`, `calendar.json`)을 읽고, 예측·셔틀 계산을 앱 안에서 웹과 같은 규칙으로 합니다.

## 0. 준비
- macOS + Xcode(iOS 시뮬레이터), Android Studio(SDK·에뮬레이터), JDK 17, `brew install xcodegen`.
- 디자인 패키지를 저장소의 `mobile/design/`에 풀고, 저장소 루트에서 `claude` 실행.
- 루트 `CLAUDE.md`에 규칙 추가:
  - "디자인 기준은 `mobile/design/README.md`와 화면 id 5a~5s. 색·간격은 README 토큰표만 사용."
  - "데이터는 `DATA_BASE_URL`의 latest/days/calendar JSON만 읽는다. 새 서버 엔드포인트를 만들지 않는다."
  - "예측은 `web/app.js` forecastOf, 셔틀은 `web/shuttle.js` shNext와 결과가 같아야 한다."
  - "iOS 17+ SwiftUI, Android minSdk 26 Compose·Material 3. 서드파티 의존성은 먼저 물어본다."
  - "작업 후 `xcodebuild test`, `./gradlew testDebugUnitTest` 통과 확인."

## 1. 단계별 프롬프트
큰 단계는 Plan 모드(Shift+Tab)로 계획을 먼저 확인합니다.

1. **공통 자원** — "`mobile/shared/`에 README 토큰표를 `tokens.json`으로(상태 단계·tint/edge 규칙·테마 라이트/다크·셔틀 노선색), `strings.ko.json`(화면 문구), `zones.json`(`functions/config/zones.yaml`에서 생성 + 배치 순서·짧은 이름·지면선 위치), `shuttle.json`(`web/shuttle.json` 복사)을 만들고 Swift·Kotlin 코드로 생성하는 스크립트를 추가해."
2. **계산 이식 + 테스트 픽스처** — "`web/app.js`의 forecastOf(30분 간격 6칸), 그룹 합계, 운영 중단·현재값 없음·면수 변경 처리와 `web/shuttle.js`의 shPrep/shNext를 Swift·Kotlin으로 옮겨. node로 같은 입력의 기대값 JSON을 `mobile/shared/fixtures/`에 뽑고 두 플랫폼 단위 테스트가 같은 값을 내는지 확인해. 픽스처: 정상·지연·오프라인·운영중단·현재값없음·면수변경·예측불가."
3. **iOS 기반** — "`mobile/ios`에 xcodegen으로 SwiftUI 앱 + WidgetKit 확장 + 테스트 타깃. `DataClient`(URLSession, gzip, latest 60초 / 지난 날짜 파일 영구 디스크 캐시 / 오프라인 시 마지막 응답), Codable 모델."
4. **Android 기반** — "`mobile/android`에 `:app`, `:core`, `:widget`(Glance) Gradle 프로젝트. kotlinx.serialization, OkHttp, 파일 캐시 + DataStore(설정)."
5. **화면** — 탭 하나씩 두 플랫폼 동시에:
   - "실시간 5a/5c/5e/5g: 총계, 단기 슬래브 건물(skew −20°, 두께), 지면선, 장기 구역(주차칸 선·타워 블록·예약 외곽선), 점유율/주차면 토글."
   - "예측 5d/5f/5h: 구역×시간 표, 예측 불가 사유 칸, ▲▼ 색(up/down) 옵션."
   - "상세 시트 5i: iOS `.sheet`+detents, Android `ModalBottomSheet`, 그래프는 Swift Charts / Compose Canvas."
   - "히스토리 5p/5q: 7·14·30일, 단기·장기·예약, 구역 칩 강조, 주말·공휴일 띠(`calendar.json` holidays), 일별 최고 점유율 표."
   - "셔틀 5r/5s: 노선 5개, 선택 승강장 N분 후·그다음 차, 정차 순서 목록, 15초 재계산, 선택 승강장 자동 스크롤, 선택 저장."
   - "설정: 기본 터미널, 안내, 버전."
6. **위젯·딥링크** — "5m 기준 소·중 위젯(15분 갱신). `icnparking://zone/{id}`, `icnparking://shuttle/{route}/{stop}`."
7. **출시 준비** — 다크 모드, VoiceOver/TalkBack 문구(README Accessibility), 앱 이름 "비공식", 공항 로고 미사용, "데이터 수집 없음" 신고.

iOS와 Android를 서브에이전트로 병렬 진행할 수 있습니다: "iOS·Android를 각각 서브에이전트로 구현하고, 끝나면 같은 픽스처의 스크린샷을 디자인 5c·5e와 비교해."

## 2. 빌드·확인 명령
```bash
# iOS
cd mobile/ios && xcodegen
xcodebuild -scheme ICNParking -destination 'platform=iOS Simulator,name=iPhone 16' build test
xcrun simctl io booted screenshot shot-ios.png
xcrun simctl openurl booted icnparking://zone/t1-short-b1

# Android
cd mobile/android && ./gradlew assembleDebug testDebugUnitTest
./gradlew recordRoborazziDebug
adb exec-out screencap -p > shot-android.png
adb shell am start -a android.intent.action.VIEW -d icnparking://shuttle/01/D00017
```
Claude는 스크린샷을 읽을 수 있으니 "shot-ios.png를 디자인 5c와 비교해 색·간격 차이를 고쳐"처럼 시각 검증 루프를 돌립니다.

## 3. 주의할 점
- **CORS 아님**: 네이티브 앱은 브라우저가 아니므로 Blob CORS 설정과 무관. 다만 `DATA_BASE_URL`은 앱 설정값으로 빼 둡니다(웹 `config.js`와 같은 값).
- **트래픽**: 히스토리 30일 = 날짜 파일 최대 31개. 지난 날짜는 확정 후 바뀌지 않으므로 한 번만 받고 캐시.
- **셔틀 시간표 갱신**: `shuttle.json`의 `as_of`가 바뀌면 앱 업데이트. 원격 갱신이 필요하면 웹에 이미 배포된 `shuttle.json` 경로를 읽도록(새 API 아님).
- **예상은 참고값**: 문구 "참고 예상" 유지, IGoTo는 2차.

## 4. 배포
- 서명: Apple Developer 팀·번들 ID, Android 업로드 키스토어(저장소 밖).
- `fastlane`으로 TestFlight / Play 내부 테스트 레인, 비밀값은 CI 시크릿.
- CI(`.github/workflows/mobile.yml`): 공통 픽스처 검증, macOS 러너 iOS 빌드·테스트, Ubuntu 러너 Gradle 테스트.
