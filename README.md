# ICN Parking

인천공항 T1·T2 주차 구역의 실측 데이터를 5분 간격으로 수집하고, 과거 흐름과 참고용 예상을 보여주는 반응형 웹 대시보드입니다.

**MIT 라이선스**로 사용·수정·상업적 이용·재배포할 수 있습니다. 라이선스 고지는 유지해 주세요. 원천 공공데이터와 외부 시간표의 이용 조건은 코드의 MIT 라이선스와 별개입니다([NOTICE](NOTICE)).

## 주요 기능

- 단기·장기(주차타워 포함)·예약 카테고리 선택과 구역별 그래프
- 점유율/가용 대수, 지난 1~4주 비교, 현재값 오프셋을 적용한 연결 예측
- 날짜별 5분 히트맵, 기간별 흐름·시간대 평균
- 기본 100% 상한과 실제 초과값 표시 옵션
- 셔틀 다음 출발, 승강장·정차 순서·정적 시간표·직접 그린 안내도
- 모바일/데스크톱 보기 전환 및 브라우저 내 선택 저장
- 배포 시 생성되는 검색용 canonical·robots·sitemap 및 선택적 소유 확인 태그

예상값은 공식 예측이 아닙니다. 셔틀 출발 안내는 정적 시간표를 기준으로 하며 실시간 차량 위치가 아닙니다.

## 문서

| 문서 | 내용 |
|---|---|
| [사용 설명서](docs/USAGE.md) | 로컬 실행, 실제 API 수집, 화면 사용법, 설정 |
| [배포 설명서](docs/DEPLOYMENT.md) | Azure 신규 설치, 기존 리소스 연결, GitHub Actions·OIDC·Secrets |
| [운영 비용 참고](docs/COSTS.md) | 비용 참고 이미지, 실제·예측 금액, 월 약 4,500원 참고 예상, 운영 점검 |
| [데이터 형식](docs/DATA.md) | 공개 JSON 스키마, 시간·누락·점유율 계산, 외부 접근 |
| [기여 안내](CONTRIBUTING.md) | 브랜치·PR·테스트 및 배포 설정 취급 |
| [라이선스](LICENSE) | MIT |

## 빠르게 실행하기

Node.js 20 이상과 Python 3.12가 필요합니다. 데모 실행에는 Azure 계정이나 API 키가 필요하지 않습니다.

```bash
git clone https://github.com/studydev/icn-parking.git
cd icn-parking
python3.12 -m venv .venv
.venv/bin/python -m pip install -r functions/requirements.txt pytest
npm ci --ignore-scripts

.venv/bin/python scripts/make_demo_data.py --out /tmp/parking-demo
.venv/bin/python scripts/serve_local.py --data /tmp/parking-demo/web/data
```

브라우저에서 `http://localhost:8080/`을 엽니다. 데모는 합성 데이터이며 운영 데이터로 업로드하면 안 됩니다.

```bash
npm test
.venv/bin/python -m pytest -q tests
npm run build
```

`dist/`는 기본적으로 특정 운영 서버에 연결하지 않는 정적 빌드입니다. 실제 데이터 주소·사이트 URL은 [배포 설정](docs/DEPLOYMENT.md)으로 전달합니다.

## 구성

```text
web/              바닐라 JS + SVG 대시보드, 배포 중립 템플릿
functions/        Python Azure Functions 수집기와 Local/Blob 저장소
infra/            매개변수 기반 Bicep 템플릿
scripts/          로컬 실행·데모·정적 빌드·배포·검증
tests/            Node 내장 테스트와 pytest
.github/workflows PR 검증과 main 병합 후 배포
```

- Functions `collect`: 주차 API를 5분마다 수집
- Functions `exog`: 승객 예고/특일 데이터를 정기 수집
- Blob private 컨테이너: 수집 원본·정규화 기록·내부 상태
- Blob 공개 컨테이너: `latest.json`, `calendar.json`, 날짜별 기록
- Static Web Apps: 웹 화면(데이터 수집과 분리)

## 운영 정보 분리

공개 저장소에는 운영 도메인, 스토리지 주소, Azure 구독/리소스 ID, API 키, 검색 인증값을 포함하지 않습니다.

- 로컬 설정: `.env` 또는 환경변수(커밋 제외)
- GitHub 배포 설정: GitHub Secrets
- `scripts/build-web.mjs`: 설정을 배포 결과물에만 주입
- GitHub Actions PR 빌드: 운영 Secrets 없이 테스트와 중립 빌드만 수행
- `main` 병합: 검증 성공 후 활성화된 배포만 실행
- 인프라 생성: 자동 배포와 분리된 수동 작업

공개 파일의 예시 URL은 예약된 `example.org` 도메인을 사용합니다. 공개 데이터 제공자 주소(`data.go.kr`, `airport.kr`)와 Azure 표준 역할 정의 ID는 운영 리소스 정보가 아닙니다.

원본 비공개 배포 이력이나 로컬 원자료는 이 저장소에 포함되지 않습니다.
