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
- 설정 값은 `.env.example`의 빈 변수나 예약된 `example.org` URL로 설명합니다.
- `dist/`는 배포 대상 설정이 포함될 수 있으므로 커밋하지 않습니다.
- 원천 공공데이터와 시간표 자료의 이용 조건은 [NOTICE](NOTICE)를 확인하세요.
- 기능 변경에는 관련 테스트와 문서 수정도 포함하세요.
- CI에서 secret scan이 실패하면 키를 다른 문자열로 바꿔 감추지 말고 제거하고 노출된 키를 폐기/재발급하세요.

인프라/배포 변경은 [배포 설명서](docs/DEPLOYMENT.md)를 따릅니다. Fork PR에 운영 인증정보를 제공하지 않습니다.
