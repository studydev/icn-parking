# 출시 실행 절차 (스크립트와 순서)

계정이 준비되기 전에 만들어 둔 도구와, 계정이 열린 뒤 할 일을 순서대로 적는다. 체크리스트와 문구는 `README.md`, `listing.ko.md`를 본다.

## 만들어 둔 것

| 도구 | 하는 일 | 확인한 것 |
|---|---|---|
| `mobile/android/scripts/create-upload-key.sh` | Play 업로드 키 생성(`~/keys/icn-upload.jks`), 비밀번호는 직접 입력, `local.properties`에 기록 | 임시 키로 생성·중복 거부 확인, 서명된 AAB(6.2MB) 빌드·`jarsigner` 검증 |
| `mobile/ios/scripts/archive.sh` | 아카이브 → `.ipa` 내보내기 또는 `--upload`로 TestFlight 업로드 | 릴리스 아카이브 성공(1.0.0, 빌드 1). 내보내기·업로드는 유료 팀 활성화 뒤에만 확인 가능 |
| `mobile/shared/scripts/store-graphics.sh` | Play 아이콘 512×512, 그래픽 이미지 1024×500 → `mobile/store/assets/` | 크기·알파 확인 |
| `mobile/store/capture-screenshots.sh` | iOS(1206×2622)·Android(1080×1920) 스크린샷 → `mobile/store/screenshots/`(git 제외) | 두 플랫폼 모두 실행, 알파 없음 |

`archive.sh`는 빌드 전에 `ICN_DATA_BASE_URL`이 비어 있지 않은지, Firebase 설정 파일(`App/GoogleService-Info.plist`)이 있는지 검사한다(점검용은 `--no-analytics`).

## 순서

**Apple** (Developer Program 활성화 뒤)
1. App Store Connect에서 앱 생성(번들 ID `com.studydev.icnparking`). 앱 정보의 숫자 Apple ID가 App Store ID.
2. `mobile/ios/App/GoogleService-Info.plist` 배치(`docs/MOBILE_ANALYTICS.md`) → `sh mobile/ios/scripts/archive.sh --upload --build-number 1`.
3. TestFlight에서 실기기 확인 → 스크린샷·문구 입력 → App Privacy 신고 → 심사 제출.

**Google**
1. 개발자 계정 설정 완료 후 `sh mobile/android/scripts/create-upload-key.sh`, 키 파일과 비밀번호 백업.
2. `mobile/android/app/google-services.json` 배치 → `cd mobile/android && ./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.
3. 앱 만들기 → 비공개 테스트 트랙에 AAB 업로드 → 테스터 12명이 14일 연속 참여 → 프로덕션 신청.

## 채워야 할 값 (사용자 입력)

- 개인정보처리방침의 **문의 이메일**과 **GA4 데이터 보관 기간**(`privacy-policy.ko.md`에 자리표시자가 남아 있음). 채운 뒤 웹에 게시해 URL을 만든다.
- Play 콘솔 **지원 이메일**(필수).
- `GoogleService-Info.plist`, `google-services.json`(Firebase 콘솔에서 받는다. git 제외).

## 규격 메모

- iOS 스크린샷: Apple 문서상 6.1인치급(1179×2556 또는 1206×2622) 한 세트가 **필수**, 6.9인치(1320×2868 등)는 선택. 앱은 **iPhone 전용**(`TARGETED_DEVICE_FAMILY = 1`)이라 iPad 스크린샷은 필요 없다.
- Android 스크린샷: 긴 변이 짧은 변의 2배를 넘으면 안 된다. 에뮬레이터 기본 1080×2400은 넘으므로 `wm size`로 1080×1920으로 바꿔 찍는다.
- 두 스크린샷 모두 올리기 직전, 대표성 있는 시간대(평일 낮 등)에 다시 찍는다.
- 시스템 디스크가 작아서 빌드 산출물은 모두 `mobile/ios/.build/`(외장 디스크)에 둔다. 시뮬레이터 서비스는 외장 디스크에 직접 쓸 수 없어서 스크린샷은 임시 폴더를 거친다.
