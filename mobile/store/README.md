# 출시 준비

앱 이름 **ICN 공항 주차** · iOS 번들 ID `com.studydev.icnparking`(위젯 `.widget`) · Android 패키지 `com.studydev.icnparking` · 버전 1.0.0 (1)

스크립트와 실행 순서는 [RELEASE.md](RELEASE.md)에 있다. 아래는 체크리스트다.

## 지금 끝난 것

| 항목 | 상태 | 위치 |
|---|---|---|
| 앱 아이콘(P + 이륙하는 비행기, 자체 제작 · 공항 로고 미사용) | iOS 1024 PNG, Android 적응형·테마 아이콘 | `mobile/shared/brand/icon.svg`, `scripts/icon.mjs`, `scripts/icon-ios.sh` |
| 앱 이름(한 곳에서 관리) | `strings.ko.json` `app.name` → iOS·Android | `node mobile/shared/scripts/generate.mjs` |
| 다크 모드 | 전 화면 토큰 라이트/다크 | — |
| VoiceOver·TalkBack 문구 | 배치도·표·그래프·셔틀·위젯 | README Accessibility 기준 |
| 글자 크기 확대 | 헤더·목록·설정만(표·배치도는 고정) | — |
| iOS 개인정보 매니페스트 | 추적 없음, 이용 분석 수집, 사용 API 사유 | `mobile/ios/App/PrivacyInfo.xcprivacy`, `Widget/PrivacyInfo.xcprivacy` |
| Android 릴리스 빌드 | R8 축소 1.9MB, 실행 확인 | `./gradlew assembleRelease` |
| 개인정보처리방침 초안 | 게시 URL 필요 | `privacy-policy.ko.md` |
| 스토어 등록 문구·개인정보 답변 초안 | — | `listing.ko.md` |

## 개발자 계정이 생기면 할 것

**Apple (Apple Developer Program, 연 99달러)**
1. Xcode › Settings › Accounts에 Apple ID 추가 → git 제외 파일 `mobile/ios/Config/Local.xcconfig`에 `DEVELOPMENT_TEAM = <팀 ID>` 추가(`xcodegen`을 다시 돌려도 유지된다).
2. 실제 아이폰 연결해 설치·테스트(위젯 홈 화면 추가, 딥링크 포함).
3. (선택) App Group `group.com.studydev.icnparking`을 앱·위젯에 추가해 캐시·설정 공유.
4. App Store Connect에서 앱 생성 → 개인정보 Firebase Analytics 수집 항목 신고 → 스크린샷·문구(`listing.ko.md`) → TestFlight → 심사.

**Google (Play Console, 1회 25달러)**
1. 업로드 키 만들기(저장소 밖 보관):
   `keytool -genkeypair -v -keystore ~/keys/icn-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
2. `mobile/android/local.properties`(git 제외)에 `icn.uploadKeystore`, `icn.uploadKeystorePassword`, `icn.uploadKeyAlias`, `icn.uploadKeyPassword` 추가 → `./gradlew bundleRelease`(AAB).
   키가 없으면 릴리스 빌드는 **디버그 키로 서명**되며 스토어에 올리면 안 된다.
3. Play Console 앱 생성 → 데이터 보안 Firebase Analytics 수집 항목 신고 → 내부 테스트 → 프로덕션.

## 공통으로 필요한 것

- **개인정보처리방침 URL**: 두 스토어 모두 요구. `web/privacy-policy.html`을 배포한 뒤 `https://icn.igotobook.com/privacy-policy.html`에서 내용을 확인하고 두 스토어에 입력한다. 앱 설정 화면에도 링크가 있다.
- **지원 URL**: GitHub 저장소 또는 웹 사이트.
- **스크린샷**: iPhone은 6.1인치급(1179×2556 또는 1206×2622) 한 세트가 필수이고 6.9인치(1320×2868 등)는 선택(앱이 iPhone 전용이라 iPad는 필요 없다). Android는 긴 변이 짧은 변의 2배를 넘으면 안 되므로 1080×1920으로 찍는다. `sh mobile/store/capture-screenshots.sh ios|android`로 실데이터를 찍고, 올리기 직전에 대표성 있는 시간대로 다시 찍는다.
- 앱 이름·설명에 "인천국제공항공사 공식" 등 제휴로 오해할 표현을 쓰지 않는다(설정 › 운영 주체에 비제휴 안내가 있다).
