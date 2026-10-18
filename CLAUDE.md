# icn-parking

## 모바일 앱 (`mobile/`)

- 디자인 기준은 `mobile/design/README.md`와 화면 id 5a~5s. 색·간격은 README 토큰표만 사용.
- 데이터는 `DATA_BASE_URL`의 latest/days/calendar JSON만 읽는다. 새 서버 엔드포인트를 만들지 않는다.
- 데이터 주소는 저장소에 넣지 않는다. iOS는 git 제외 `mobile/ios/Config/Local.xcconfig`(예시 `Local.xcconfig.example`), Android는 git 제외 `mobile/android/local.properties`의 `icn.dataBaseUrl` 또는 환경 변수 `ICN_DATA_BASE_URL`에서 읽는다.
- 예측은 `web/app.js` forecastOf, 셔틀은 `web/shuttle.js` shNext와 결과가 같아야 한다.
- iOS 위젯은 Apple Developer Team 서명이 없어 App Group 없이 공개 파일을 직접 받는다(확장 자체 캐시). Team이 생기면 App Group으로 앱과 캐시·설정 공유를 검토한다. Android 위젯은 앱과 같은 프로세스라 `ParkingServices`를 그대로 쓴다.
- 앱 아이콘은 `mobile/shared/scripts/icon.mjs`가 원본(Android 벡터·`brand/icon.svg` 생성), iOS PNG는 `sh mobile/shared/scripts/icon-ios.sh`. 앱 이름은 `strings.ko.json` `app.name`. 출시 체크리스트는 `mobile/store/README.md`.
- 예측은 지금 + 30분 × 12칸(6시간). 상세 시트 그래프는 지난 2시간 실측 + 6시간 예상, 아래는 선택 주차장이 앞에 오는 시간대별 세로 표.
- 위젯 3종: 소 = 한 곳 숫자, 중 = 한 곳 3시간 그래프(30분 점), 대 = 터미널 × 묶음의 주차장별 지금·1·2·3시간 뒤. 고를 곳은 T1·T2 전체·묶음·19개 주차장. Android 위젯은 설정을 `provideContent` 안에서 `currentState`로 읽고(밖에서 읽으면 다시 설정해도 안 바뀜), 그래프는 알파 비트맵을 토큰 색으로 칠해 라이트·다크를 따른다.
- 히스토리 구역별 선 색은 `tokens.json` `series`(README 토큰표에 사용자 요청으로 추가). 설정의 "웹에서 자세히 보기"는 공개 웹(`settings.webBaseUrl`) 해시 경로로만 연결한다.
- 딥링크: `icnparking://zone/{id}`, `group/{T1|T2}/{short|long|reserved}`, `total/{T1|T2}`, `forecast/{T1|T2}`, `shuttle/{route}/{stop}` (`DeepLink`, 두 플랫폼 같은 규칙).
- iOS는 iPhone 전용이다. xcodegen이 타깃마다 `TARGETED_DEVICE_FAMILY = "1,2"`를 기본으로 넣어 최상단 설정을 덮어쓰므로 앱·위젯 타깃에 각각 `"1"`을 적어 둔다(iPad를 지원하면 iPad 스크린샷이 필요하고 세로 전용 설정이 업로드 검증에 걸린다).
- iOS 17+ SwiftUI, Android minSdk 26 Compose·Material 3. 서드파티 의존성은 먼저 물어본다.
- 작업 후 `xcodebuild test`, `./gradlew testDebugUnitTest` 통과 확인.
- 공통 자원은 `mobile/shared/`가 원본이다. `Generated/`·`generated/` 아래 Swift·Kotlin 파일과 `zones.json`·`shuttle.json`은 손으로 고치지 말고 원본을 고친 뒤 `node mobile/shared/scripts/generate.mjs`로 다시 만든다(`npm test`가 최신 여부를 검사).
- 계산 테스트 기대값(`mobile/shared/fixtures/`)은 웹 코드를 실행해 만든다. 웹 `forecastOf`·`nowAgg`·`shNext`나 `mobile/shared/reference/forecast.mjs`를 바꾸면 `node mobile/shared/scripts/fixtures.mjs`로 다시 만들고 두 플랫폼 테스트를 돌린다.
- 확인 명령(`xcode-select`가 CommandLineTools를 가리키고 JDK는 Android Studio 내장 JBR):
  - iOS 전체(앱·위젯·패키지 테스트): `cd mobile/ios && xcodegen && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -scheme ICNParking -destination 'platform=iOS Simulator,name=iPhone 17' build test`
  - iOS 계산만 빠르게: `cd mobile/ios/ICNParkingCore && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild test -scheme ICNParkingCore -destination 'platform=macOS'`
  - Android: `cd mobile/android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug testDebugUnitTest`
