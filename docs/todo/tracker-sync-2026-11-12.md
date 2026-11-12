# tracker 원본에 옮길 mono 문서 변경 (2026-11-12, PR #369)

mono에서 먼저 고친 문서다. 아래 파일의 첫 줄에는 `원본: tracker docs/public/…` 표식이 없어 전파로 덮이지 않는다. tracker에 같은 문서의 원본이 있으면 같은 내용을 옮기고, 옮긴 뒤 이 파일을 지운다. 그때까지 mono 쪽 변경을 되돌리지 않는다.

| 파일 | 바뀐 내용 |
|---|---|
| `docs/CACHING-AND-ASSETS.md` | `/` 캐시(브라우저 0초, CDN 5분+5분), `/logos` 1년, API ETag와 `max-age=60` 반영, 실측 크기 |
| `docs/DEV-ENVIRONMENT.md` | 캐시 절(헤더 사용), 엔드포인트 목록, `/api/reload` 제한과 보안 헤더 설명 |
| `docs/CAPABILITIES.md` | 엔드포인트 행, 이벤트 화이트리스트 55종, 요청 제한, 보안 헤더, `pageNow.js`, `lazyRetry.js`, `/about`, og-image |
| `docs/SEO-ACTIONS.md` | §9 보안 헤더 갱신 박스(CSP만 남음) |
| `api/README.md`, `api/deploy/dev/README.md`, `web/README.md` | `/api/reload` 403 조건, 푸시 구독 제한, 공유 링크 제한, SaveEats, 구조 목록 |
| `docs/incidents/2026-11-12-api-429-survey-polling.md` | 신규. 429 원인, 5xx, 인증서 확인 |

개인정보처리방침 `web/public/privacy/index.html`의 "3개월 보관"은 코드에서 근거를 못 찾았다. 방침 본문에 명시해 두고, 실제 보관 정책이 정해지면 문구를 맞춘다.
