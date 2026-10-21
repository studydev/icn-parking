# 기여 안내

1. 저장소를 Fork하거나 작업 브랜치를 만듭니다.
2. [사용 설명서](docs/USAGE.md)로 로컬 데모를 실행합니다.
3. 수정 후 테스트와 빌드를 실행합니다.
4. 브랜치를 push하고 `main` 대상으로 PR을 만듭니다.
5. PR의 `Validate` 성공 이후 병합합니다. 활성화된 운영 배포는 main push에서 실행됩니다.

```bash
npm ci --ignore-scripts
npm test
python -m pytest -q tests
npm run build
```

- 기여 코드는 이 저장소와 같은 MIT 라이선스로 제공합니다.
- .env, 인증키, 개인 정보, 운영 데이터, 실제 리소스명/구독 ID/도메인 인증값을 포함하지 마세요.
- 스토어·분석 콘솔의 진행 기록에는 앱 ID, GA4 속성·데이터 스트림 ID, Firebase 앱 ID, 테스트 초대 링크, 테스터 등 개인 메일, Apple 주문번호를 적지 마세요. 필요한 기록은 `*.private.md` 또는 `private/` 아래에 만듭니다(git 제외). 스토어에 공개되는 지원 연락처처럼 이미 공개된 값만 문서에 둘 수 있고, 개인 메일 주소와 위 ID 형태는 CI의 secret scan(`.gitleaks.toml`)이 막습니다.
- 설정 값은 `.env.example`의 빈 변수나 예약된 `example.org` URL로 설명합니다.
- README의 공개 서비스 링크·사용자 제공 대표 화면은 소개용 예외입니다. 해당 주소나 운영 설정을 소스·기본 빌드 설정으로 복제하지 마세요.
- `dist/`는 배포 대상 설정이 포함될 수 있으므로 커밋하지 않습니다.
- 원천 공공데이터와 시간표 자료의 이용 조건은 [NOTICE](NOTICE)를 확인하세요.
- 기능 변경에는 관련 테스트와 문서 수정도 포함하세요.
- CI에서 secret scan이 실패하면 키를 다른 문자열로 바꿔 감추지 말고 제거하고 노출된 키를 폐기/재발급하세요.

인프라/배포 변경은 [배포 설명서](docs/DEPLOYMENT.md)를 따릅니다. Fork PR에 운영 인증정보를 제공하지 않습니다.
