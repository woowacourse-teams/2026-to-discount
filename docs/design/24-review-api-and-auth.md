# 24. 검수 API와 인증·인가 설계 (2026-09-16)

22번(검수 화면)의 API 부분을 구체화한다. 전제: 21번(개발/운영 분리)의 dev API가
있고, 검수는 **dev 환경에서 개발자가** 한다. 운영 API에는 이 경로가 열리지 않는다.

## 1. 원칙

1. **원장의 진실은 미니PC `data/log.jsonl`.** API는 원장에 직접 쓰지 않는다.
   사람의 판단은 `review-inbox.jsonl`(dev 서버)에 쌓이고, 미니PC `ingest`가 끌어가
   원장에 넣는다(22번 §5). API가 하는 "쓰기"는 inbox append와 운영 파일 복사뿐이다.
2. **행 스키마는 트래커 `schema.py` 그대로.** 편집 결과는 `capture_mode: manual`
   관측 행 또는 `excluded` 판단 행(ADR-030)이다. 새 모양을 만들지 않는다.
3. **운영 jar에는 코드가 있어도 켜지지 않는다.** `DISCOUNT_REVIEW_ENABLED=true`
   일 때만 컨트롤러 빈이 뜬다. 운영은 404.
4. **누가 했는지 남는다.** 모든 판단 행에 `by`(사용자 id)와 `at`(서버 시각).

## 2. 엔드포인트 (dev API, `/api/review/*`)

| 메서드 | 경로 | 하는 일 | 본문/응답 |
|---|---|---|---|
| GET | `/api/review/state` | 미반영 inbox 목록, 마지막 반영 시각, 수집 시각, 운영 export 요약 | `{inbox:[…], lastPublishedAt, collectedAt, live:{count, latestCapturedAt}}` |
| GET | `/api/review/offers/{platform}/{brand}` | 그 (앱, 브랜드)의 승자 행 + inbox 대기 행 + 최근 관측 5행 | 검수 화면 편집 패널이 연다 |
| POST | `/api/review/offers` | **고치기** — manual 관측 행 1개 append | 본문: 원장 스키마 행(필수 필드만 검증). 응답: `{id, row}` |
| POST | `/api/review/offers/exclude` | **제외** — `excluded` 판단 행 append | `{platform, brand, reason, note}` → 서버가 승자 복사 + `excluded` 채움(`exclude_offer.py build`와 같은 규칙) |
| POST | `/api/review/offers/revive` | **되살리기** — excluded 없는 manual 행 append | `{platform, brand}` |
| DELETE | `/api/review/inbox/{id}` | 아직 원장에 안 들어간 inbox 행 취소 | ingest 전에만 가능(`ingested_at` 없음) |
| GET/PUT | `/api/review/banners` | `banners.yml` 읽기/통째 쓰기(dev) + snapshot `_human_fields` 갱신 | PUT 본문은 yml 텍스트. 파싱 실패면 400, 파일 안 건드림 |
| POST | `/api/review/publish` | **운영에 반영** — dev `export.json`(inbox 겹친 결과)·`banners.yml`을 운영으로 복사 + 운영 `POST /api/reload` + 백업 | 응답: diff 요약(추가/변경/삭제 브랜드 수, `check_deploy` 판정, 백업 파일명) |
| POST | `/api/review/rollback` | 직전 백업 복원 + reload | `{backup}` 생략 시 최신 |

- inbox 행: `{id, row, by, at, ingested_at|null}`. `id`는 ULID.
- "고치기" 검증: `platform`·`brand`·`amount`·`captured_at`·`capture_mode=manual`·
  `screenshot_path`(승자 것 그대로) 필수. 값 규칙(qualifier 집합, tiers 모양)은
  미니PC ingest가 최종 판정 — 거부되면 inbox 행에 `rejected: <사유>`가 붙고
  검수 화면 "미반영" 목록에 빨갛게 남는다(22번 §9-4).
- publish는 **dev 서버가 운영 서버 파일에 ssh/scp로** 쓴다(둘 다 같은 OCI 인스턴스
  — 21번 C안이면 같은 호스트의 다른 디렉터리라 파일 복사). 운영 API 자체에
  쓰기 경로를 열지 않는다.

## 3. 인증·인가

사용자 1~2명(개발자), 화면은 dev 도메인. 계정 체계를 만들지 않는다.

**층 1 — 네트워크 (nginx, dev 도메인 전체)**
- `dev-api.bebeggars.duckdns.org`와 dev 웹 프리뷰: **Basic Auth**(`htpasswd`, 개발자 1인 1계정)
  + 선택적으로 IP 허용(집·미니PC). Vercel 프리뷰는 Vercel Authentication 그대로.
- 운영 도메인에는 `/api/review/*`를 nginx에서 **404로 막는다**(빈이 없어도 이중).

**층 2 — API 토큰 (Spring)**
- `Authorization: Bearer <REVIEW_TOKEN>`. 토큰은 개발자별 하나, 서버 env
  `DISCOUNT_REVIEW_TOKENS=alice:tok1,bob:tok2`. 토큰 → 사용자 id가 `by`에 적힌다.
- 검증은 `ReviewAuthFilter`(OncePerRequestFilter) 하나, `/api/review/**`에만.
  실패 401. 토큰은 저장소에 안 두고 `~/.review_token`처럼 미니PC·랩탑 로컬에.
- 웹은 토큰을 `localStorage`에 두지 않는다 — 세션 동안 메모리, 화면 열 때 한 번
  입력(또는 Basic Auth 통과 뒤 `/api/review/session`이 짧은 만료 토큰 발급). 1~2명에
  이 정도면 충분하고, OAuth·JWT는 과하다.

**층 3 — 행위 기록**
- inbox 행 `by`·`at`, publish/rollback도 `review-audit.jsonl`에 `{who, what, at, diff}`.
  원장 규칙과 같은 append-only.

**하지 않는 것**: 역할 구분(전원 같은 권한), 비밀번호 저장, 운영 API 인증(읽기 공개 유지).

## 4. 트래커 쪽

- `scripts/review_inbox.py pull` — dev 서버 inbox에서 `ingested_at` 없는 행을 받아
  `ingest.plan/apply`, 성공/거부를 inbox에 되쓴다(`PATCH /api/review/inbox/{id}`).
  예약 실행 단계 0.
- `reflect_daily.held_by_human`이 inbox 행도 본다.
- `deploy_export.py --target dev|prod`.

## 5. 순서·비용

1. `ReviewAuthFilter` + `GET state` + `POST exclude/revive` (반나절) — exclude_offer.py와
   같은 일을 API로. 검수 화면 없이도 curl로 쓸 수 있다.
2. inbox + `review_inbox.py pull` (반나절).
3. `POST offers`(고치기) + 검증 되쓰기 (반나절).
4. banners GET/PUT (반나절).
5. publish/rollback (하루).
6. nginx Basic Auth·404 규칙, 문서(ROUTINE-SPEC §2 단계 0·§3).

미결(22번 §9-2 그대로): 검수 없이 지난 수집분의 운영 반영 규칙.
