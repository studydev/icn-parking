# Android / iOS GA4 연동

웹의 GA4 측정 ID(`G-...`)는 모바일 SDK 설정에 사용하지 않는다. 두 앱은 Firebase Analytics로 기존 웹과 **같은 GA4 속성**에 전송한다. Azure Application Insights / Log Analytics는 사용자 액티비티 수집에 사용하지 않는다.

## 최초 등록 (현재 모바일 앱 미등록)

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 만들거나 기존 프로젝트를 선택한다.
2. 프로젝트 설정 → 통합 → Google Analytics에서 **웹이 이미 사용하는 GA4 속성**에 연결한다. 새 속성을 만들지 않도록 속성 ID를 확인한다.
3. Android 앱을 추가한다. 패키지 이름은 `com.studydev.icnparking`. Analytics만 사용할 때 SHA 인증서 등록은 필요 없다. `google-services.json`을 다운로드해 `mobile/android/app/google-services.json`에 둔다.
4. iOS 앱을 추가한다. Bundle ID는 `com.studydev.icnparking`. `GoogleService-Info.plist`를 다운로드해 `mobile/ios/App/GoogleService-Info.plist`에 둔다. 위젯에는 등록/설정을 추가하지 않는다.
5. `cd mobile/ios && xcodegen`으로 프로젝트를 다시 생성한다. 설정 파일이 앱 리소스에 포함된다. Android는 다음 빌드에서 Google Services 플러그인이 설정을 처리한다.
6. GA4 관리 → 데이터 스트림에서 기존 웹 + Android + iOS 스트림이 같은 속성에 있는지 확인한다.

설정 파일은 git에서 제외한다. CI/배포에서는 빌드 전 같은 경로에 복원하며, iOS는 **xcodegen 실행 전** 복원한다. 설정 없는 로컬/PR 빌드는 동작하지만 분석을 전송하지 않는다. 출시 빌드에는 두 설정 파일이 반드시 필요하다. 설정 파일은 서버 비밀 키가 아니지만 운영 프로젝트에 잘못 전송하지 않도록 별도로 관리한다.

## 이벤트

| 이벤트 | 시점 | 매개변수 |
| --- | --- | --- |
| `screen_view` | 최초 화면 표시와 탭 전환 | `screen_name`: live/forecast/history/shuttle/settings, `screen_class` |
| `select_terminal` | 표시 터미널 변경 | `terminal`: T1/T2 |
| `view_parking_detail` | 주차 상세 시트 표시/대상 변경 | `item_id`: 구역 ID 또는 그룹/터미널 ID |
| `manual_refresh` | 사용자가 새로고침/재시도 실행 | `terminal` |
| `open_deep_link` | 유효한 앱 딥링크 처리 | 없음 (URL 자체는 보내지 않음) |

첫 실행, 세션, 참여 등은 SDK 자동 이벤트를 사용한다. 자동 화면 보고는 끄고 Compose/SwiftUI 탭을 직접 기록한다. 주기적 갱신은 `manual_refresh`로 기록하지 않는다. `terminal`, `item_id`는 GA4 이벤트 범위 맞춤 측정기준으로 등록하면 탐색 보고서에서 사용할 수 있다. 위젯 표시 자체는 측정하지 않으며 위젯을 눌러 앱을 열 때 딥링크를 기록한다.

광고 ID 수집과 광고 개인화 신호를 끈다. iOS는 IDFA 없는 `FirebaseAnalyticsCore`를 사용하고 IDFV 수집도 끈다. 사용자 ID, 이메일, 위치 권한, 원본 딥링크, 데이터 서버 주소는 이벤트에 넣지 않는다. SDK는 앱 인스턴스 식별자와 앱/기기 정보, 사용 이벤트를 처리하므로 스토어에 ‘데이터 수집 없음’으로 신고하면 안 된다.

## 실기기 수신 확인

- Android: `adb shell setprop debug.firebase.analytics.app com.studydev.icnparking` 후 앱 실행. 종료 시 `adb shell setprop debug.firebase.analytics.app .none.`.
- iOS: Xcode 실행 인자에 `-FIRDebugEnabled` 추가. 종료 시 제거하고 `-FIRDebugDisabled`로 실행.
- Firebase Analytics DebugView에서 화면 이동, T1/T2 변경, 주차 상세, 수동 새로고침을 확인한다. 자동 1분 갱신 때 `manual_refresh`가 증가하지 않는지 확인한다.
- 설정 파일 없는 빌드에서는 수신되지 않는 것이 정상이다. 계정 등록 전에는 실제 GA4 수신을 검증할 수 없다.

공식 문서: [Android 설정](https://firebase.google.com/docs/android/setup), [iOS Analytics 설정](https://firebase.google.com/docs/analytics/ios/get-started), [DebugView](https://firebase.google.com/docs/analytics/debugview).
