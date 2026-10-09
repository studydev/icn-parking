# 배포 설명서

사용법과 화면 기능은 [USAGE.md](USAGE.md), 데이터 스키마는 [DATA.md](DATA.md)에 있습니다. 이 문서에는 실제 운영 리소스 정보가 아닌 변수명과 예시만 포함합니다.

## 1. 구성과 배포 경계

```text
공공데이터 API → Azure Functions → Blob private / 공개 data
                                   ↓
                            Static Web Apps
```

- 웹 배포는 화면 파일만 업데이트합니다. 기존 주차 기록은 삭제·재생성하지 않습니다.
- 수집기 배포는 Functions 코드를 업데이트합니다. API 키는 Functions의 Key Vault 참조 설정에 남습니다.
- 인프라 변경은 별도 수동 작업입니다. PR 병합 시 Storage/Key Vault/RBAC를 자동 재생성하지 않습니다.
- 스토리지의 `private`·함수 배포 패키지 컨테이너는 비공개입니다. `$web`은 익명 Blob 읽기만 허용합니다.
- 운영 URL, Azure 리소스명/ID, 검색 인증값, API 키는 `.env` 또는 GitHub Secrets에만 넣습니다.

## 2. 준비

- Azure CLI, Bicep CLI, Node.js 20 이상
- 수집기 로컬 배포 시 Azure Functions Core Tools v4
- Apple Silicon에서 Rosetta가 없다면 Docker Desktop(SWA CLI의 x64 배포 도구 실행용)
- 실제 데이터 제공 API의 활용 신청과 Decoding 키
- Azure 구독 및 리소스 그룹 생성/배포 권한

```bash
cp .env.example .env
az login
az bicep version
```

`.env`에는 자신의 설정만 입력하세요. 예시:

```dotenv
RG=rg-my-parking
APP_NAME=airport
LOCATION=koreacentral
SWA_LOCATION=eastasia
SUBSCRIPTION=
DATA_GO_KR_KEY=
ALERT_EMAIL=
WEB_DOMAIN=parking.example.org
PUBLIC_SITE_URL=https://parking.example.org/
DATA_BASE_URL=
NAVER_SITE_VERIFICATION=
BING_SITE_VERIFICATION=
```

`APP_NAME`은 3~9자의 영문 소문자/숫자이고 첫 글자는 영문자여야 합니다. 리소스 이름은 이 접두사와 배포 리소스 그룹의 고유 suffix로 생성됩니다. 구독 ID나 알림 이메일을 예시 파일에 실제 값으로 커밋하지 마세요.

## 3. 새 Azure 환경 설치

```bash
scripts/deploy.sh infra
scripts/deploy.sh site
scripts/deploy.sh functions
scripts/deploy.sh web
```

또는 `scripts/deploy.sh all`을 사용할 수 있습니다. `infra`는 적용 전 `what-if`를 출력합니다. 이 작업은 비용이 발생하는 Azure 리소스를 생성하므로 결과를 검토하세요.

Bicep은 다음을 구성합니다.

- Static Web Apps, Flex Consumption Functions(Python 3.12)
- Blob Storage와 공개 데이터용 CORS
- Key Vault의 API 키, 수집기의 관리 ID
- Application Insights, 수집 중단·함수 실행 알림, 월 비용 예산

초기 배포 계정은 리소스 생성과 역할 할당 권한이 필요합니다. 기존 예산은 첫 시작일을 유지합니다. 리소스 삭제·권한·비용 정책은 운영자의 책임입니다.

커스텀 도메인은 자신의 DNS와 Azure Static Web Apps Custom Domains에서 별도로 연결합니다. `WEB_DOMAIN`은 HTTPS 웹 Origin을 스토리지 CORS에 추가하는 용도이며 DNS를 자동 변경하지 않습니다.

## 4. 정적 웹 빌드

운영 정보는 소스가 아니라 빌드 결과물에만 들어갑니다.

```bash
DATA_BASE_URL='https://example.blob.core.windows.net/$web/data/' \
PUBLIC_SITE_URL='https://parking.example.org/' \
NAVER_SITE_VERIFICATION='' \
BING_SITE_VERIFICATION='' \
npm run build
```

`dist/`에 다음이 생성됩니다.

- 데이터 주소를 사용하는 `config.js`
- 사이트 URL에 맞춘 canonical, robots, sitemap
- 선택적 네이버/Bing 소유 확인 태그
- 해당 데이터 Origin만 허용하는 CSP `connect-src`

설정이 없는 기본 빌드는 상대 `./data/`만 사용합니다. 실제 사이트 URL이 없으면 잘못된 sitemap을 배포하지 않도록 sitemap을 생략합니다. URL은 HTTPS이고 인증정보·쿼리(SAS 포함)·fragment가 없어야 합니다. 공개 웹 설정에 API 인증키나 비공개 저장소 주소를 넣지 마세요.

빌드 디렉터리는 비어 있어야 합니다. 재빌드하려면 이전 `dist/`만 지우세요. `dist/`는 Git에서 제외됩니다.

## 5. GitHub Actions: PR → 검증 → 병합 → 배포

[CI workflow](../.github/workflows/ci.yml)의 동작:

1. PR: Node·Python 테스트, 정적 빌드, Bicep 컴파일, 전체 Git 이력 비밀정보 검사
2. 테스트용 `web-preview` artifact는 운영 설정 없이 생성
3. `main` 병합(push): 동일한 검증을 다시 통과한 후 활성화된 배포 수행
4. `production` environment에서만 운영 배포 설정 사용
5. 배포 후 웹·robots·sitemap·공개 데이터 응답 확인

Fork의 PR에는 운영 Secrets를 전달하지 않습니다. `pull_request_target`으로 외부 코드를 실행하지 않습니다. CI/CD actions는 수정되지 않는 commit SHA로 고정합니다.

### 저장소 Variables(비밀 아닌 on/off 값)

| Variable | 의미 |
|---|---|
| `DEPLOY_WEB_ENABLED` | `true`이면 main 병합 후 웹 배포 |
| `DEPLOY_FUNCTIONS_ENABLED` | `true`이면 main 병합 후 수집기 배포 |

초기 Fork에는 값을 설정하지 않아 배포가 비활성입니다. 검증은 Secrets 없이 실행됩니다. 필요한 Secrets가 없는 상태에서 배포를 켜면 명확히 실패하며 성공으로 처리하지 않습니다.

### GitHub Secrets

Settings → Secrets and variables → Actions에서 다음을 설정합니다. `production` environment Secrets로 관리해도 됩니다.

| Secret | 사용 작업 |
|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | 웹 배포 토큰 |
| `AZURE_STATIC_WEB_APPS_HOSTNAME` | 선택적 기본 호스트명(공개 Actions 로그의 리소스명 마스킹) |
| `PUBLIC_SITE_URL` | 운영 사이트 루트 HTTPS URL |
| `DATA_BASE_URL` | 공개 데이터 디렉터리 HTTPS URL |
| `NAVER_SITE_VERIFICATION` | 선택적 소유 확인 토큰 |
| `BING_SITE_VERIFICATION` | 선택적 소유 확인 토큰 |
| `AZURE_CLIENT_ID` | 수집기 배포용 Entra 애플리케이션 ID |
| `AZURE_TENANT_ID` | Entra 테넌트 ID |
| `AZURE_SUBSCRIPTION_ID` | Azure 구독 ID |
| `FUNCTION_APP_NAME` | 배포 대상 함수 이름 |

리소스 ID/URL도 공개 워크플로의 `vars`나 소스에 쓰지 않고 Secrets로 관리합니다. 토큰 값은 CLI 로그, PR 본문, 테스트 fixture에 붙이지 마세요.

웹 배포 토큰만으로 웹을 배포할 수 있으며 별도 Azure 로그인은 필요하지 않습니다.

```bash
# 토큰은 stdin으로 전달하면 터미널 기록/프로세스 인자 노출을 줄일 수 있습니다.
az staticwebapp secrets list --name "$SWA_NAME" --resource-group "$RG" \
  --query properties.apiKey -o tsv |
  gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --repo OWNER/REPOSITORY
gh secret set PUBLIC_SITE_URL --repo OWNER/REPOSITORY
gh secret set DATA_BASE_URL --repo OWNER/REPOSITORY
gh variable set DEPLOY_WEB_ENABLED --body true --repo OWNER/REPOSITORY
```

### 수집기 OIDC(클라이언트 secret 불필요)

배포 전용 Entra 애플리케이션/서비스 주체에 GitHub federated credential을 등록합니다.

```text
issuer:   https://token.actions.githubusercontent.com
subject:  repo:OWNER@OWNER_ID/REPOSITORY@REPOSITORY_ID:environment:production
audience: api://AzureADTokenExchange
```

새 저장소는 OIDC `sub`에 변경되지 않는 owner/repository ID를 포함할 수 있습니다.
구형 설정에서는 `repo:OWNER/REPOSITORY:environment:production` 형태를 사용합니다.
Azure federated credential의 subject는 **해당 저장소 토큰의 실제 subject와 정확히 같아야** 합니다.
`azure/login` 로그의 `Federated token details → subject claim`으로 확인하세요. 실제 Azure 리소스 ID를 공개 문서에 붙이지 마세요.

```bash
gh api repos/OWNER/REPOSITORY --jq '{owner_id: .owner.id, repository_id: .id}'
```

수집기 코드 배포에는 대상 Function App 범위의 `Website Contributor`만 부여합니다. 수집기 관리 ID의 Blob/Key Vault 접근 권한과 배포 주체의 코드 배포 권한은 별개입니다.

`production` environment는 `main`만 배포할 수 있게 제한하세요. PR의 `Validate`를 필수 상태 검사로 설정하고, 운영 환경에 필요하면 수동 승인도 추가할 수 있습니다.

수집기 키는 공개 GitHub에서 요구하지 않습니다. 기존 Function App에 설정된 `DATA_GO_KR_KEY` Key Vault 참조를 유지합니다.

## 6. 수동 인프라 workflow

[Provision infrastructure](../.github/workflows/provision.yml)는 `workflow_dispatch`에서 `provision`을 명시적으로 입력할 때만 실행됩니다.

다음 Secrets가 추가로 필요합니다.

- `AZURE_PROVISION_CLIENT_ID`, `PROVISION_PRINCIPAL_ID`
- `RESOURCE_GROUP`, `APP_NAME`, `AZURE_LOCATION`, `SWA_LOCATION`
- `WEB_DOMAIN`, `DATA_GO_KR_KEY`, `ALERT_EMAIL`

이 주체에는 대상 리소스 그룹의 Contributor와 역할 할당 권한이 필요합니다. 일상 수집기 배포 주체에 인프라 관리 권한을 추가하지 마세요. 관리자를 통해 별도 설치하거나 로컬 배포해도 됩니다.

## 7. 기존 운영 환경 연결

기존 리소스를 이용할 때는 신규 인프라 workflow를 실행하지 않고 웹/수집기 Secrets만 설정하세요. 저장소 변경 때문에 기존 데이터나 커스텀 도메인을 이전할 필요는 없습니다.

기존 `.env`와 원본 운영 Git 이력을 공개 저장소로 복사하지 마세요. 이 저장소는 설치 대상이 달라져도 소스 수정 없이 빌드·배포 설정만으로 연결됩니다.

## 8. 확인 및 문제 해결

```bash
PUBLIC_SITE_URL='https://parking.example.org/' \
DATA_BASE_URL='https://example.blob.core.windows.net/$web/data/' \
node scripts/verify-deployment.mjs
```

- `latest.json`이 없다면 먼저 수집기 성공 여부와 API 키를 확인하세요.
- 웹에서 데이터가 안 읽히면 Blob CORS와 배포 `DATA_BASE_URL`을 확인하세요.
- 원천 갱신 지연은 배포 실패가 아니라 수집 품질 문제일 수 있습니다.
- 검색 소유 확인은 배포된 태그로 해당 포털에서 완료하고 사이트맵을 제출하세요.
- 화면이 이전 버전이면 브라우저 캐시를 새로고침하세요.
- 실제 API나 Azure 호출이 포함된 로그는 공개 이슈에 원문으로 첨부하지 마세요.
