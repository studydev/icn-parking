# 데이터 형식

이 저장소는 특정 운영 데이터 주소나 API 인증키를 포함하지 않습니다. 아래 URL의 `example`은 사용자가 배포한 저장소로 대체하세요.

```text
https://example.blob.core.windows.net/$web/data/
  latest.json
  calendar.json
  days/YYYY-MM-DD.json
```

파일은 `Content-Type: application/json`, `Content-Encoding: gzip`으로 제공됩니다. 브라우저 `fetch`, `requests`, `curl --compressed`처럼 gzip을 처리하는 클라이언트를 사용하세요.

## latest.json

| 필드 | 의미 |
|---|---|
| `v` | 스키마 버전(현재 1) |
| `generated_at` / `last_attempt_at` / `last_ok_at` | UTC 생성·시도·마지막 성공 시각 |
| `slot` | KST 5분 단위 슬롯 |
| `start` | 수집 시작 날짜 |
| `ok`, `error`, `stale` | 성공·실패·원천 갱신 지연 상태 |
| `zones[]` | 구역 메타데이터와 현재 주차 대수 |

구역:

```json
{
  "id": "t1-short-b1",
  "terminal": "T1",
  "category": "단기",
  "name": "단기 지하1층",
  "p": 300,
  "c": 520,
  "slot": "2026-01-01T14:30",
  "flags": []
}
```

예시는 설명용입니다. 실제 구역 정의는 `functions/config/zones.yaml`에서 API의 `floor`와 매핑합니다.

## 날짜별 JSON

```json
{
  "v": 1,
  "date": "2026-01-01",
  "zones": {
    "t1-short-b1": {
      "p": [300, null],
      "c": [520, 520]
    }
  }
}
```

위 예시는 배열 앞부분만 보여줍니다. 실제 `p`·`c` 배열은 각각 288칸입니다.

- 인덱스 0 = 00:00, 1 = 00:05, …, 287 = 23:55 KST
- `p`: 주차 대수, `c`: 총 면수
- `null`: 아직 수집되지 않았거나 누락된 값
- 면수 0: 미운영/닫힌 구역
- 점유율 = `p / c`, 가용 대수 = `max(c - p, 0)`
- `p > c`는 원자료에서 유지합니다. 소비자가 100% 상한 여부를 결정합니다.

과거 날짜는 확정 후 캐시 1일, 최신값·당일 파일·달력은 캐시 60초입니다. 갱신 주기는 5분이며 모든 구역이 같은 슬롯에 유효한 것은 아닐 수 있습니다.

## calendar.json

- `start`: 수집 시작 날짜
- `days`: 존재하는 날짜와 수집 슬롯 수
- 날짜의 `T1` / `T2`: 최고·평균 점유율, 최고 시각, 누락
- `holidays`: 날짜별 공휴일 이름

존재하는 날짜를 알아내려면 컨테이너 목록을 조회하지 말고 `calendar.json`을 읽으세요. 제공된 Bicep 템플릿은 익명 파일 읽기만 허용하고 컨테이너 목록 조회는 허용하지 않습니다.

## 품질 플래그

`STALE`, `OVER`, `CAPCHANGE`, `GAP`, `CLOSED`, `UNKNOWN_ZONE`, `MISSING`을 기록합니다. 원천 타임스탬프가 갱신되지 않은 슬롯은 빈 값으로 표시하며 실측을 임의 보간하지 않습니다.

## 외부 재사용

공개 Blob은 파일 URL을 아는 서버/클라이언트에서 인증 없이 다운로드할 수 있습니다. 그러나 브라우저의 교차 출처 `fetch()`는 스토리지 CORS 설정을 따릅니다. 기본 인프라 템플릿은 배포한 웹앱 주소만 허용합니다.

임의 외부 웹앱에 제공하려면 스토리지의 CORS 허용 출처 정책을 별도로 결정해야 합니다. 이 코드의 MIT 라이선스는 원천 공공데이터의 이용 조건·출처 표시 의무를 대신하지 않습니다.

## 데이터 제공자 API

- 주차: `https://apis.data.go.kr/B551177/StatusOfParking/getTrackingParking`
- 승객 예고: `https://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt`
- 공휴일: `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo`

API 이용 신청, 운영 계정·일일 트래픽, 출처 표시 및 이용 조건은 각 서비스의 공식 안내를 확인하세요. 인증키는 요청 시에만 사용하고 공개 JSON에는 넣지 않습니다.
