# 24. 검수 API와 인증, 인가 설계 (2026-09-16)

22번 문서(검수 화면)의 API 부분을 구체화한다. 검수 API를 dev 환경에만 열고, 인증은 nginx Basic Auth, API 토큰, 행위 기록의 세 층으로 두는 것을 제안한다. 이 문서는 계획까지이고 도입 시점은 정하지 않았다. 21번(개발/운영 분리)과 22번(검수 화면)이 먼저 도입되어야 하고, 인증 3층 중 무엇부터 할지도 결정 대기다(추적 이슈 #30). 전제는 21번의 dev API가 있고 검수는 **dev 환경에서 개발자가** 한다는 것이다. 운영 API에는 이 경로가 열리지 않는다.

## 1. 원칙

1. **원장의 진실은 미니PC `data/log.jsonl`이다.** API는 원장에 직접 쓰지 않는다.
   사람의 판단은 dev 서버의 `review-inbox.jsonl`에 쌓이고, 미니PC `ingest`가 끌어가
   원장에 넣는다(22번 §5). API가 하는 "쓰기"는 inbox append와 운영 파일 복사뿐이다.
2. **행 스키마는 트래커 `schema.py` 그대로 쓴다.** 편집 결과는 `capture_mode: manual`
   관측 행 또는 `excluded` 판단 행(ADR-030)이다. 새 모양을 만들지 않는다.
3. **운영 jar에는 코드가 있어도 켜지지 않는다.** `DISCOUNT_REVIEW_ENABLED=true`
   일 때만 컨트롤러 빈이 뜬다. 운영은 404를 돌려준다.
4. **누가 했는지 남는다.** 모든 판단 행에 `by`(사용자 id)와 `at`(서버 시각)을 적는다.

## 2. 엔드포인트 (dev API, `/api/review/*`)

| 메서드 | 경로 | 하는 일 | 본문/응답 |
|---|---|---|---|
| GET | `/api/review/state` | 미반영 inbox 목록, 마지막 반영 시각, 수집 시각, 운영 export 요약 | `{inbox:[…], lastPublishedAt, collectedAt, live:{count, latestCapturedAt}}` |
| GET | `/api/review/offers/{platform}/{brand}` | 그 (앱, 브랜드)의 승자 행, inbox 대기 행, 최근 관측 5행 | 검수 화면 편집 패널이 연다 |
| POST | `/api/review/offers` | **고치기**. manual 관측 행 1개 append | 본문: 원장 스키마 행(필수 필드만 검증). 응답: `{id, row}` |
| POST | `/api/review/offers/exclude` | **제외**. `excluded` 판단 행 append | `{platform, brand, reason, note}`. 서버가 승자를 복사하고 `excluded`를 채운다(`exclude_offer.py build`와 같은 규칙) |
| POST | `/api/review/offers/revive` | **되살리기**. excluded 없는 manual 행 append | `{platform, brand}` |
| DELETE | `/api/review/inbox/{id}` | 아직 원장에 안 들어간 inbox 행 취소 | ingest 전에만 가능(`ingested_at` 없음) |
| GET/PUT | `/api/review/banners` | `banners.yml` 읽기와 통째 쓰기(dev), snapshot `_human_fields` 갱신 | PUT 본문은 yml 텍스트. 파싱 실패면 400, 파일은 건드리지 않는다 |
| POST | `/api/review/publish` | **운영에 반영**. dev `export.json`(inbox를 겹친 결과)과 `banners.yml`을 운영으로 복사, 운영 `POST /api/reload`, 백업 | 응답: diff 요약(추가/변경/삭제 브랜드 수, `check_deploy` 판정, 백업 파일명) |
| POST | `/api/review/rollback` | 직전 백업 복원과 reload | `{backup}` 생략 시 최신 |

- inbox 행은 `{id, row, by, at, ingested_at|null}`이다. `id`는 ULID다.
- "고치기" 검증: `platform`, `brand`, `amount`, `captured_at`, `capture_mode=manual`,
  `screenshot_path`(승자 것 그대로)가 필수다. 값 규칙(qualifier 집합, tiers 모양)은
  미니PC ingest가 최종 판정한다. 거부되면 inbox 행에 `rejected: <사유>`가 붙고
  검수 화면 "미반영" 목록에 빨갛게 남는다(22번 §9-4).
- publish는 **dev 서버가 운영 서버 파일에 ssh/scp로** 쓴다. 둘 다 같은 OCI 인스턴스다.
  21번 C안이면 같은 호스트의 다른 디렉터리라 파일 복사가 된다. 운영 API 자체에
  쓰기 경로를 열지 않는다.

## 3. 인증과 인가

사용자는 개발자 1~2명이고 화면은 dev 도메인이다. 계정 체계를 만들지 않는다.

**층 1: 네트워크 (nginx, dev 도메인 전체)**
- `dev-api.bebeggars.duckdns.org`와 dev 웹 프리뷰는 **Basic Auth**(`htpasswd`, 개발자 1인 1계정)를 건다.
  선택적으로 IP 허용(집, 미니PC)을 더한다. Vercel 프리뷰는 Vercel Authentication 그대로 둔다.
- 운영 도메인에서는 `/api/review/*`를 nginx에서 **404로 막는다**. 빈이 없어도 이중으로 막는다.

**층 2: API 토큰 (Spring)**
- `Authorization: Bearer <REVIEW_TOKEN>`. 토큰은 개발자별 하나이고 서버 env
  `DISCOUNT_REVIEW_TOKENS=alice:tok1,bob:tok2`에 둔다. 토큰에서 찾은 사용자 id가 `by`에 적힌다.
- 검증은 `ReviewAuthFilter`(OncePerRequestFilter) 하나가 `/api/review/**`에만 한다.
  실패하면 401이다. 토큰은 저장소에 두지 않고 `~/.review_token`처럼 미니PC와 랩탑 로컬에 둔다.
- 웹은 토큰을 `localStorage`에 두지 않는다. 세션 동안 메모리에 들고, 화면을 열 때 한 번
  입력한다. 또는 Basic Auth 통과 뒤 `/api/review/session`이 짧은 만료 토큰을 발급한다. 1~2명에게는
  이 정도면 충분하고 OAuth와 JWT는 과하다.

**층 3: 행위 기록**
- inbox 행의 `by`와 `at`, publish와 rollback도 `review-audit.jsonl`에 `{who, what, at, diff}`로 남긴다.
  원장 규칙과 같은 append-only다.

**하지 않는 것**: 역할 구분(전원 같은 권한), 비밀번호 저장, 운영 API 인증(읽기 공개 유지).

## 4. 트래커 쪽

- `scripts/review_inbox.py pull`: dev 서버 inbox에서 `ingested_at` 없는 행을 받아
  `ingest.plan/apply`를 돌리고, 성공과 거부를 inbox에 되쓴다(`PATCH /api/review/inbox/{id}`).
  예약 실행 단계 0에 둔다.
- `reflect_daily.held_by_human`이 inbox 행도 본다.
- `deploy_export.py --target dev|prod`.

## 5. 순서와 비용

1. `ReviewAuthFilter`, `GET state`, `POST exclude/revive` (반나절). exclude_offer.py와
   같은 일을 API로 한다. 검수 화면 없이도 curl로 쓸 수 있다.
2. inbox와 `review_inbox.py pull` (반나절).
3. `POST offers`(고치기)와 검증 되쓰기 (반나절).
4. banners GET/PUT (반나절).
5. publish/rollback (하루).
6. nginx Basic Auth와 404 규칙, 문서(ROUTINE-SPEC §2 단계 0, §3).

미결(22번 §9-2 그대로): 검수 없이 지난 수집분의 운영 반영 규칙.

## 선제 구현 (2026-09-18): 인증 첫 층

콘솔(`/ops/`)은 nginx Basic Auth(아이디와 비밀번호를 묻는 가장 단순한 웹 인증) 한 겹으로 열려 있다. 2026-09-18에 그 이름을 서버 프로세스(`ops_apply.py`)에 `X-Ops-User` 헤더로 넘겨, 배너 편집 이력(`edits/<날짜>.jsonl`)과 제안 승인 결과(`proposals/<날짜>.result.json`의 `decided_by`)에 "누가"를 남기게 했다. 사람마다 계정을 하나씩 만들면(`htpasswd`) 이력에 이름이 찍힌다. 계정 만들기는 tracker `docs/setup/MINIPC-HANDOVER.md`의 서버 표에 있다. 이 문서가 말한 3층(토큰, 권한, 감사) 가운데 감사의 절반이 이것이다. 권한 분리(보기와 편집)는 아직 없다.

