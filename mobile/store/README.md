# 출시 준비

앱 이름 **ICN 공항 주차** · iOS 번들 ID `com.studydev.icnparking`(위젯 `.widget`) · Android 패키지 `com.studydev.icnparking` · 버전 1.0.0 (1)

## 지금 끝난 것

| 항목 | 상태 | 위치 |
|---|---|---|
| 앱 아이콘(P + 이륙하는 비행기, 자체 제작 · 공항 로고 미사용) | iOS 1024 PNG, Android 적응형·테마 아이콘 | `mobile/shared/brand/icon.svg`, `scripts/icon.mjs`, `scripts/icon-ios.sh` |
| 앱 이름(한 곳에서 관리) | `strings.ko.json` `app.name` → iOS·Android | `node mobile/shared/scripts/generate.mjs` |
| 다크 모드 | 전 화면 토큰 라이트/다크 | — |
| VoiceOver·TalkBack 문구 | 배치도·표·그래프·셔틀·위젯 | README Accessibility 기준 |
| 글자 크기 확대 | 헤더·목록·설정만(표·배치도는 고정) | — |
| iOS 개인정보 매니페스트 | 추적 없음, 수집 없음, 사용 API 사유 | `mobile/ios/App/PrivacyInfo.xcprivacy`, `Widget/PrivacyInfo.xcprivacy` |
| Android 릴리스 빌드 | R8 축소 1.9MB, 실행 확인 | `./gradlew assembleRelease` |
| 개인정보처리방침 초안 | 게시 URL 필요 | `privacy-policy.ko.md` |
| 스토어 등록 문구·개인정보 답변 초안 | — | `listing.ko.md` |

## 개발자 계정이 생기면 할 것

**Apple (Apple Developer Program, 연 99달러)**
1. Xcode › Settings › Accounts에 Apple ID 추가 → `mobile/ios/project.yml`의 `settings.base`에 `DEVELOPMENT_TEAM: <팀 ID>` 추가 → `xcodegen`.
2. 실제 아이폰 연결해 설치·테스트(위젯 홈 화면 추가, 딥링크 포함).
3. (선택) App Group `group.com.studydev.icnparking`을 앱·위젯에 추가해 캐시·설정 공유.
4. App Store Connect에서 앱 생성 → 개인정보 "데이터 수집 안 함" → 스크린샷·문구(`listing.ko.md`) → TestFlight → 심사.

**Google (Play Console, 1회 25달러)**
1. 업로드 키 만들기(저장소 밖 보관):
   `keytool -genkeypair -v -keystore ~/keys/icn-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
2. `mobile/android/local.properties`(git 제외)에 `icn.uploadKeystore`, `icn.uploadKeystorePassword`, `icn.uploadKeyAlias`, `icn.uploadKeyPassword` 추가 → `./gradlew bundleRelease`(AAB).
   키가 없으면 릴리스 빌드는 **디버그 키로 서명**되며 스토어에 올리면 안 된다.
3. Play Console 앱 생성 → 데이터 보안 "수집·공유 없음" → 내부 테스트 → 프로덕션.

## 공통으로 필요한 것

- **개인정보처리방침 URL**: 수집이 없어도 두 스토어 모두 요구. `privacy-policy.ko.md`를 웹(예: 지금 사이트의 정적 페이지 또는 GitHub Pages)에 게시하고 문의 이메일을 채운다.
- **지원 URL**: GitHub 저장소 또는 웹 사이트.
- **스크린샷**: iPhone 6.9"(1320×2868 또는 1290×2796), Android 폰. 시뮬레이터·에뮬레이터에서 실데이터로 찍는다.
- 앱 이름·설명에 "인천국제공항공사 공식" 등 제휴로 오해할 표현을 쓰지 않는다(설정 › 운영 주체에 비제휴 안내가 있다).
