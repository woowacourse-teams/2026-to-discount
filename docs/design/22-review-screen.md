# 22. 검수 화면 — 웹에서 오퍼·배너를 고치고 운영에 내보내는 화면 (계획)

전제: 21번(개발/운영 분리)이 먼저다. 이 화면은 **dev 웹·dev API에서만** 켜진다.
즉시 도입 안 한다 — 착수는 별도 지시.

## 0. 한 줄

자동 수집이 dev에 올린 결과를 사람이 **실제 화면 그대로** 보면서 오퍼를 고치고·
빼고·되살리고, 배너를 편집한 뒤 "반영" 한 번으로 운영에 내보낸다.
구조: **자동 수집 → 검수(이 화면) → 반영 결정.**

## 1. 왜

- 지금 사람의 수정은 세 갈래로 흩어져 있다 — 원장에 `capture_mode: manual` 행을
  스크립트로 넣기, `banners.yml`을 ssh로 고치기, 배포 뒤 운영 화면에서 눈으로
  확인하기. 09-15 하루에만 "고쳤는데 안 보임"(엉뚱한 곳 수정), 배너 되살아남,
  190→164건 유실이 있었고 전부 **화면을 보기 전에는 몰랐다.**
- 원장 규칙(ADR-016 확정>보류>최신, ADR-029 멤버십 구간, ROUTINE-SPEC §3 "같은
  날 사람이 만진 것은 안 덮음")은 이미 사람 수정을 1급으로 다룬다. 없는 것은
  그 수정을 **화면에서 넣는 입구**뿐이다.

## 2. 안 하는 것

- 운영 웹에는 편집 UI를 절대 싣지 않는다(코드가 번들에 들어가는 것 자체를 막는다
  — 아래 §6).
- 원장의 진실 위치를 바꾸지 않는다. 진실은 여전히 트래커 저장소의
  `data/log.jsonl`(append-only). 이 화면은 그 원장에 **행을 추가**할 뿐이다.
- 자동 수집의 판정(ingest.plan, check_deploy)을 우회하지 않는다. 검수 편집도 같은
  검증을 지난다.
- 사용자 계정·권한 체계를 만들지 않는다. 사용자 1~2명, dev 도메인 접근 제한으로
  끝낸다.

## 3. 사람이 하는 일 (화면의 동사)

| 동사 | 대상 | 원장에 남는 것 | 운영 화면 효과 |
|---|---|---|---|
| **고치기** | 오퍼의 금액·최소주문·기한·조건·구간(tiers)·멤버십·품절 | `capture_mode: manual` 행 1개, `captured_at` = 지금, 나머지 필드는 원본 행 복사 + 바뀐 값 | ADR-016으로 확정·최신이라 이긴다. 같은 날 자동 반영이 안 덮는다 |
| **빼기** | 오퍼 하나 | manual 행, `expires_at` = 오늘, `conditions` 끝에 `[검수: 뺌 — 이유]` | `is_live`가 걸러 안 보인다. 다음 수집이 다시 보면 새 행이 들어오되 같은 날엔 hold |
| **되살리기** | 뺀 오퍼 | 원본 행을 다시 manual로 복사(`expires_at` 원래 값) | 다시 보인다 |
| **보류 풀기** | `needs_review` 오퍼 | manual 행, `needs_review: false` | 확정으로 오른다 |
| **배너 편집** | `banners.yml` 항목 | `banners.yml` 파일(dev) + `banners.snapshot.json`의 `_human_fields` 갱신 | 배너 루틴이 사람 필드로 인식해 안 덮는다 |
| **반영** | 전체 | 없음(전송 행위) | dev `export.json`·`banners.yml` → 운영 복사 + reload |

편집은 **오퍼 단위**다. 브랜드 이름·별칭·분류는 여기서 안 고친다(`brands.yml`은
코드 배포다).

## 4. 화면

기존 비교 화면 그대로 + 검수 모드 레이어. 새 페이지를 만들지 않는다 — "실제 화면
기반"이 요점이다.

- 상단 바 오른쪽에 **검수 배지**(`dev-badge`처럼) + "미반영 N건" 카운터.
- 카드 오퍼 칩을 **길게 누르거나 연필 아이콘** → 인라인 편집 패널(금액, 최소주문,
  기한, 구간표, 멤버십, 조건 문구, 품절). 저장 즉시 dev API에 반영, 카드가 다시
  그려진다.
- 칩에 출처 표식: `자동`/`사람`/`보류`/`뺌`(원장의 `capture_mode`·`needs_review`·
  검수 표식에서). 지금 화면엔 이 정보가 없다 — 검수의 핵심 정보.
- 배너: 배너 카드에 연필 → 제목·금액·기간·링크·브랜드 목록·`endsOn`·접기.
- 하단 고정 바: "미반영 N건 · dev 데이터 기준 09-15 15:58 수집" + **[운영에 반영]**.
  누르면 diff 요약(브랜드별 추가/변경/삭제 수, `check_deploy` 판정) → 확인 → 전송.
- 되돌리기: 최근 반영 시각과 **[직전 운영본으로 되돌리기]** (deploy_export가 이미
  만드는 백업을 쓴다).

## 5. 데이터 흐름

```
미니PC 예약 실행 ──(수집·검증)──> data/log.jsonl ──export──> dev 서버 export.json
                                                             │
브라우저(dev 웹) ──편집──> dev API /api/review/* ──> review-inbox.jsonl (dev 서버)
                                                             │
미니PC 다음 실행 또는 [반영] ──inbox 끌어와 ingest──> data/log.jsonl ──export──> dev
                                                             │
[운영에 반영] ──> dev export.json·banners.yml 을 운영으로 복사 ──> POST /api/reload
```

- **편집 행은 서버의 `review-inbox.jsonl`에 먼저 쌓인다.** 원장은 미니PC 저장소에
  있고 서버는 그 사본을 안 가진다. inbox는 "아직 원장에 안 들어간 사람 행"이며,
  미니PC가 끌어가 `ingest.plan`으로 넣고 커밋한다. 편집 직후 dev 화면에 바로
  보이게 하려면 dev API가 inbox 행을 export 위에 **겹쳐 보여준다**(같은 (앱,
  브랜드) 키는 inbox가 이긴다) — 원장 반영 전의 미리보기다.
- "반영"이 미니PC를 거치지 않고 바로 운영에 가려면 dev 서버가 export를 만들 수
  있어야 하는데, 지금 export는 트래커 파이썬(`export_data.build_export`)이다.
  두 길 중 하나:
  - (가) **미니PC가 반영 주체**: 화면의 [반영]은 미니PC에 "지금 돌아라" 신호
    (inbox에 `publish` 행) → 다음 예약 실행 또는 대기 중인 워커가 끌어가 원장에
    넣고 export·운영 배포. 지연 있음(예약 실행 사이엔 수 시간).
  - (나) **서버가 반영 주체**: dev API가 `export.json`에 inbox를 겹친 결과를
    그대로 운영 파일로 복사. 원장 반영은 나중에 미니PC가 따라온다. 즉시성 있음,
    대신 "운영에 보이는 것 ≠ 원장" 구간이 생긴다(미니PC가 끌어가면 일치).
  - 추천 **(나)**, 단 inbox를 끌어가지 못한 채 다음 자동 반영이 돌면 사람 행이
    원장에 없어 hold가 안 걸린다 → 미니PC 실행 첫 단계가 **inbox 끌어오기**여야
    한다(ROUTINE-SPEC §2에 단계 0으로).
- 증거(ADR-021): manual 행은 `screenshot_path: null`, `evidence_status: "manual"`.
  `evidence_manifest.check`는 이 값을 건너뛴다(지금도 `evidence_status`가 있으면
  건너뛴다).

## 6. 구현 얼개

**웹**
- `web/src/review/` 아래 편집 컴포넌트. `App.jsx`는 `import.meta.env.VITE_REVIEW === '1'`일
  때만 `lazy(() => import('./review/...'))` — 운영 빌드에서는 그 변수가 없어
  청크 자체가 안 만들어진다. 빌드 검사 스크립트(`verify-*.mjs` 패턴)로 운영
  번들에 `review` 청크가 없음을 CI가 확인한다.
- 편집 상태는 서버가 진실. 낙관적 갱신 없이 저장 응답으로 다시 그린다(1~2명이라
  충돌 없음).

**API (dev에만)**
- `DISCOUNT_REVIEW_ENABLED=true`일 때만 빈이 뜨는 `review` 패키지.
  - `GET  /api/review/state` — 미반영 inbox 목록, 마지막 반영 시각, 데이터 수집 시각.
  - `POST /api/review/offers` — manual 행 1개(원장 스키마 그대로, `schema.normalize`
    규칙을 자바로 옮기지 않고 **파이썬 검증기를 dev 서버에서 호출**하거나, 스키마
    최소 검증만 하고 미니PC ingest가 최종 판정). 추천: 최소 검증 + ingest 최종.
  - `POST /api/review/banners` — `banners.yml` 항목 upsert/접기, snapshot의
    `_human_fields` 갱신.
  - `POST /api/review/publish` — (나) 방식 복사 + reload + 백업. 응답에 diff 요약.
  - `POST /api/review/rollback` — 직전 백업 복원.
- 운영 jar에는 같은 코드가 들어가지만 조건부 빈이라 매핑이 없다 → 404. 그래도
  `ReviewControllerTest`에 "플래그 없으면 404"를 둔다.

**트래커**
- `scripts/review_inbox.py pull` — dev 서버 inbox를 받아 `ingest.plan` → 원장
  append → inbox에 `ingested_at` 표시. `after_open_daily.cmd` 단계 0.
- `reflect_daily`의 hold 판정(`held_by_human`)이 inbox 행도 보게 — 원장 반영 전에
  자동 반영이 돌 수 있는 창을 막는다.
- `deploy_export.py`가 운영 대신 **dev**를 기본 대상으로. 운영은 `--target prod`.

**접근 제한**
- nginx `dev-api.` 서버 블록에 basic auth(또는 미니PC·집 IP 허용). dev 웹(Vercel
  Preview)은 Vercel 자체 보호(Preview Protection) 또는 같은 basic auth를 API가
  요구하므로 화면은 열려도 데이터가 안 온다.

## 7. 검증

- 단위: manual 행이 `_prefer`에서 이기는지(이미 있음), inbox 겹치기, publish diff.
- 계약: `tests/test_mono_contract_copies.py`처럼 review API의 행 스키마가 트래커
  `schema.py`와 같은 필드인지.
- 화면: Vercel Preview에서 편집 → dev 카드 변경 → [반영] → 운영 화면 확인.
- 사고 재현: 09-15 사례 Z(배너 되살아남)를 시나리오 테스트로 — 검수에서 접은
  배너가 다음 루틴에 안 살아나야 한다.

## 8. 단계

1. 21번 1~3(dev API·dev 웹·미러) — 전제.
2. 출처 표식만 먼저(칩에 자동/사람/보류) — 편집 없이도 검수가 된다. 반나절.
3. 오퍼 고치기·빼기·되살리기 + inbox + `review_inbox.py pull`. 이틀.
4. 배너 편집. 하루.
5. [운영에 반영]·되돌리기·diff. 하루.
6. ROUTINE-SPEC §2 단계 0·§3 반영 규칙 갱신, DEV-ENVIRONMENT 갱신.

## 9. 결정 (2026-09-15 사용자 답)

1. **반영의 주체는 개발자, 자리는 개발 환경.** 사람이 dev 화면에서 [운영에
   반영]을 누른다. 기계적으로는 dev 서버가 dev 파일을 운영으로 복사하고
   reload한다(§5의 (나)). 미니PC는 반영 주체가 아니라 원장 관리자 — inbox를
   끌어가 원장에 넣는 일만 한다.
2. **변경이 있는데 일정 시간 검수가 없으면 자동 반영한다.** 규칙(안): 수집분의
   검수 대기 창은 **다음 예약 실행 시각까지**(00:05분 수집 → 10:55, 10:55 →
   15:55, 15:55 → 다음날 00:05). 창이 닫힐 때까지 [반영]이 없으면 예약 실행이
   지금 정책(검증 통과 → 자동 반영, 같은 날 사람 수정은 안 덮음)대로 운영에
   올린다. 검수 중이던 편집(inbox)은 그 실행이 먼저 끌어가므로 같이 올라간다.
   → ROUTINE-SPEC §3에 "검수 창"으로 적는다.
3. **"빼기"가 아니라 "제외"다.** 오류로 잘못 읽었거나, 메뉴·지역 한정이거나,
   계정별 타겟딜이라 비교 대상이 아니라는 뜻. `expires_at`을 조작하지 않고
   **필드를 추가한다**:
   ```
   excluded: {"reason": "misread" | "limited" | "targeted" | "duplicate",
              "note": "...", "by": "review", "at": "2026-09-15T..."}
   ```
   - manual 행에 붙는다. `export_data`는 `excluded`가 있는 행을 내보내지 않는다.
   - **지속성**: 오류(misread)는 다음 관측이 다른 값을 가져오면 자연히 밀려난다.
     한정·타겟(limited/targeted)은 **같은 (앱, 브랜드, 금액)이 다시 관측돼도
     제외가 유지**돼야 한다 — 그렇지 않으면 다음날 자동 수집이 되살린다(09-15
     배너 사례 Z와 같은 꼴). `store._prefer`에 "제외 행은 같은 쿠폰의 이후 자동
     행을 이긴다"를 넣고, 다른 금액이 오면 새 오퍼로 본다. 되살리기는 사람이
     `excluded` 없는 manual 행을 넣는 것.
   - 화면 표식 `뺌` → `제외(사유)`. ADR 한 편(예: ADR-030 "제외는 관측이 아니라
     판단이다") — ADR-028과 같은 결로, 만료일을 거짓으로 적지 않는다.
4. **편집 검증은 미니PC ingest에 맡긴다.** dev API는 필수 필드·타입만 본다.
   *ingest*는 트래커의 `ingest.py`가 하는 일 — 수집·편집으로 생긴 관측 행을
   원장(`data/log.jsonl`)에 **넣기 전에 검사하고 넣는 단계**다. `schema.normalize`로
   필드·값을 정규화하고, `_identity`(앱·브랜드·시각·금액·최소주문)로 이미 있는
   행과 같은지 봐서 중복을 거르며, `plan`(무엇이 들어갈지 미리보기)과 `apply`
   (실제 append)로 나뉜다. "원장에 들어가는 유일한 문"이라 여기서 검증하면
   어느 입구(수집·검수·스크립트)로 오든 같은 규칙을 지난다.

## 10. 남은 것

- 검수 창 규칙 2를 ROUTINE-SPEC에 적을 때 주말·부재도 같은 규칙(창이 닫히면
  자동)이라 따로 둘 것이 없다 — 사람이 안 보면 지금과 같다.
- `excluded` 스키마·`_prefer` 규칙·ADR은 이 화면보다 먼저 트래커에 넣어도 된다
  (스크립트로 제외를 넣을 수 있게) — 09-15 타겟딜 정리에 바로 쓸 수 있다.
