# mobile/shared

iOS·Android 앱이 함께 쓰는 원본 자원. 디자인 기준은 [`../design/README.md`](../design/README.md).

| 파일 | 종류 | 내용 |
|---|---|---|
| `tokens.json` | 원본 | 혼잡 단계(경계·이름·색), tint/edge/셔틀 카드 혼합 규칙, 라이트·다크 테마, 셔틀 노선색, 간격·반경·그림자 |
| `strings.ko.json` | 원본 | 화면 문구. `{name}` 자리는 생성 코드에서 `String` 매개변수 |
| `layout.json` | 원본 | 짧은 이름, 단기 층 순서·지면선, 장기 2열 배치, 예측 표 순서, 그룹, 터미널별 셔틀 노선 순서 |
| `zones.json` | 생성 | `functions/config/zones.yaml` + `layout.json` |
| `shuttle.json` | 생성 | `web/shuttle.json` 복사(앱 번들 자원) |

생성 코드:

- iOS `mobile/ios/ICNParkingCore/Sources/ICNParkingCore/Generated/{Tokens,Strings,Zones}.swift`
- Android `mobile/android/core/src/main/kotlin/com/studydev/icnparking/core/generated/{Tokens,Strings,Zones}.kt`

```bash
node mobile/shared/scripts/generate.mjs          # 다시 생성
node mobile/shared/scripts/generate.mjs --check  # 최신 여부만 확인 (npm test에 포함)
```

## 계산 픽스처

| 경로 | 내용 |
|---|---|
| `reference/forecast.mjs` | 웹 `forecastOf`·`nowAgg`·`capacityPredictionIssue` 참조 구현. 칸 위치만 매개변수(웹 1시간 / 앱 30분) |
| `scripts/fixtures.mjs` | 시나리오 입력 생성 → 실제 `web/app.js`·`web/shuttle.js`를 vm에서 실행해 참조 구현과 대조 → 기대값 기록 |
| `fixtures/forecast/*.json` | 정상·지연·오프라인·운영중단·현재값없음·면수변경·예측불가·경계(되짚기·보정값·자정) |
| `fixtures/shuttle/next.json` | 전 노선·승강장 × 11개 시각의 `shNext` 결과, `shPrep`이 거부하는 travel 3건 |
| `fixtures/freshness.json`, `fixtures/time.json` | 상단 줄 상태(정상·지연·오프라인), KST·날짜 계산 |
| `fixtures/history.json` | 히스토리 시간 묶음·그룹 전체·요약·일별 표(`reference/history.mjs`, 웹에 같은 화면 없음 → README 규칙) |
| `fixtures/shuttle/text.json` | 셔틀 카드·목록 문구(`reference/shuttle-text.mjs`, 디자인 wTxt 규칙) |

```bash
node mobile/shared/scripts/fixtures.mjs          # 다시 생성(웹과 다르면 멈춤)
node mobile/shared/scripts/fixtures.mjs --check  # npm test에 포함
```

앱 테스트(`mobile/ios/ICNParkingCore`, `mobile/android/core`)는 이 파일을 복사하지 않고 그대로 읽는다. 예측은 30분 칸(앱 값)과 1시간 칸(웹과 직접 동등)을 모두 확인한다.

## 색

tint·edge 색은 생성 시점에 디자인과 같은 식(채널별 `color × w + base × (1 − w)` 반올림)으로 미리 계산해 두 플랫폼이 같은 값을 쓴다. 생성기는 zones.yaml의 모든 구역이 화면에 한 번씩 배치되는지, 셔틀 노선이 `shuttle.json`·노선색에 있는지 검사하고 어긋나면 멈춘다.
