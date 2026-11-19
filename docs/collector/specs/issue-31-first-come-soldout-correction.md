<!-- 원본: tracker docs/specs/issue-31-first-come-soldout-correction.md — 여기서 고치지 않는다 -->
# 설계: 선착순 오퍼의 소진 반영과 사람 정정을 수집 구조에 연결 (이슈 #31)

- 상태: 설계 (구현 전)
- 영역: **export와 collect에 걸침.** 이슈를 둘로 나눈다(5번). 이 문서의 구현 대상은 **export 쪽(폰 불필요)**이다.
- 읽은 것: `store.py`(`offer_key`, `_prefer`, `_exclusion_holds`), `scripts/exclude_offer.py`, `scripts/deploy_export.py`(`apply_inbox_line`, `sync_inbox`), `scripts/offer_link_check.py`(`offer_kind`, `check_first_come`, `read_hotdeal_cards`), `export_data.py`(`sold_out` → `soldOut` 매핑 41행), `schema.py`(`EXCLUSION_REASONS`), `docs/decisions/ADR-030`, `mono/docs/CHANGE-PROPAGATION.md`, 이슈 본문과 OWNER 댓글(2026-10-22).
- 읽지 못한 것: `docs/REFACTOR-BACKLOG.md` #15 전문(긴 줄이라 요약만 봄), `docs/AGENT-FAILURES.md`, 로컬 핸드오프 문서(저장소에 없음), 요기요와 땡겨요의 선착순 처리(5-1 표의 미확인 칸), mono `BrandComparisonService`(읽기용 체크아웃에서 `soldOut` 소비 지점은 목록만 확인).

## 1. 이슈 + 댓글에서 정해진 것

| 항목 | 결정 | 출처 |
|---|---|---|
| 소진 감시 | **선착순 소진만 검사하는 봇을 따로 둔다.** 후속 조치. 상시 검증 봇(L3)의 알림은 유지하고, 후속이 자리 잡으면 L3의 소진 담당을 뗀다 | 댓글 |
| 사람 정정에 소진 | **넣는다** | 댓글 |
| 쿠팡이츠 선착순 | 같은 로직을 탈 수 있는지 검증하고 다형성을 고려해 구조를 고친다. 분기/통합은 이 작업 결과로 **후속에서 결정** | 댓글 4번 |
| 캐러셀 선착순(배짱할인 하단) | 쿠폰 발급 컴포넌트 안에 오픈 시각과 조건이 있다. 그걸 읽어 수집에 반영한다 | 댓글 |
| 소진 뒤 재수집 | **소진돼도 주기 수집이 다시 올리고 다시 반영한다.** 소진 행은 영구가 아니다 | 댓글 5번 |
| 구간(티어) 유실 | 단일 오퍼가 아니라 구간별 오퍼를 쓰고, 2026-10-22 쿠팡이츠 꾸브라꼬 케이스처럼 유실되지 않게 고친다 | 댓글 1번 |
| 수집 시각 변경, 마감 시각 새로 측정 | 하지 않는다 | 이슈 |

## 2. 지금 코드가 하는 일 (읽어서 확인한 것)

- `offer_key`: `section`에 "선착순"이 있으면 `(앱, 브랜드, "선착순")` 3원소 키. 아니면 2원소(`store.py` 189~200행). 랜덤은 `(앱, 브랜드, "랜덤")`.
- `exclude_offer.build`는 `winners.get((platform, brand))`만 본다. 선착순 자리를 못 잡는다. 같은 브랜드에 선착순만 있고 상시가 없으면 "승자가 없다"로 거절하고, 둘 다 있으면 **상시가 걸린다**(코드상. 이슈 본문 그대로 화면 확인은 못 했다).
- `apply_inbox_line`은 `len(k) == 2` 키만 본다(`deploy_export.py` 113행). 콘솔 줄에 자리 필드가 없다.
- `check_first_come`: 카드 `sold_out`이 참이고 내보낸 값 `sold_out`이 거짓이면 `first_come_sold_out`. 카드를 못 찾으면 `first_come_unobserved`. 이 함수는 판정 행을 돌려줄 뿐 **원장에 쓰지 않는다**.
- 인기 브랜드 패널(`brand_first_come_cards`)은 마감을 안 보여 `sold_out=False`로 둔다(`offer_link_check.py` 285~288행 주석). **이것이 핵심 위험이다**: 소진 행을 남겨도 같은 날 패널 관측이 더 늦으면 `_prefer`가 최신을 이겨 소진이 풀린다.
- `export_data.py`는 `sold_out`을 `soldOut`으로 이미 싣는다(41행). 내보내기 쪽에 새 칸은 필요 없다.

## 3. 결정

### 3.1 소진은 `excluded`가 아니라 `sold_out` 관측 행이다 (ADR-030과의 정합)

- `EXCLUSION_REASONS`에 `sold_out`을 **넣지 않는다.** `excluded`는 "화면에서 통째로 뺀다"는 판단이다(ADR-030 결정 3). 소진은 오퍼가 있었고 끝났다는 **사실**이라, 빼면 API가 "소진이면 상시"를 못 세우고 화면의 소진 표시도 잃는다. 사람이 소진을 본 것은 사람이 한 관측이므로 `capture_mode: manual` 행에 `sold_out: true`를 둔다.
- 행은 선착순 승자의 복사본이다(`exclude_offer`와 같다). 바뀌는 칸: `capture_mode: manual`, `captured_at: 지금`, `sold_out: true`, 새 칸 `sold_out_evidence`.
- `sold_out_evidence`(새 선택 칸): `{"by": "human|bot", "kind": "console|cli|hotdeal_card", "at": <시각>, "screen": <마감 화면 경로 또는 null>, "note": <글>}`. 기계 행은 `screen`이 **필수**이고 사람 행은 `note`나 `screen` 중 하나가 있어야 한다. 근거 없는 소진 행을 스키마가 거부한다.
- 소진 취소(오탐 정정)는 `sold_out: false`인 manual 행을 한 번 더 넣는다. 되살리기와 같은 모양이다.
- ADR-030 본문은 고치지 않는다. **새 ADR(번호는 구현자가 `docs/decisions/`의 다음 번호)**에 "소진은 판단이 아니라 근거 있는 관측이다"를 쓰고 ADR-030에서 링크한다.

### 3.2 소진 행의 수명: 같은 날 유지, 다음 날 풀림 (댓글 5번)

- 소진 행을 `_prefer`가 이기게 하는 규칙을 더한다. 같은 쿠폰(`_same_coupon`), 같은 선착순 자리, **같은 날짜**의 이후 관측이 `sold_out`이 거짓이고 `sold_out_observed`가 참이 아니면 소진 행이 남는다.
- `sold_out_observed`(새 선택 칸, 불리언): 마감 여부를 실제로 읽는 화면(핫딜 카드)에서 나온 행만 참을 단다. 인기 브랜드 패널 행은 달지 않는다. **이 칸이 "소진이 아니다"를 관측과 미관측으로 가르는 양성 신호다**(5-3 표).
- 다음 날 관측은 날짜가 달라 이 규칙에 안 든다. 평소 `_prefer`대로 최신이 이긴다. 그래서 주기 수집이 다음 날 다시 올린다.
- 같은 날 핫딜 카드가 `sold_out_observed`와 함께 `sold_out: false`를 다시 보이면 소진을 푼다(오탐 자가 회복).
- 기존 `reflect_daily`의 사람 보류(`held_by_human`)는 사람 소진 행에도 그대로 걸린다(manual). 기계 소진 행은 이 보류에 안 걸리므로 위 규칙이 필요하다.
- **API에는 옮길 규칙이 없다.** ADR-016 주석대로 병합 규칙은 원장 쪽(`_prefer`)과 API `Offer.preferredOver`가 글자까지 같아야 하나, `export.json`에는 대표 행 하나만 나가고 API는 원장을 직접 읽지 않는다(ADR-030 결과 절). 원장을 읽는 경로가 생기면 그때 같은 규칙을 둔다.

### 3.3 정정 경로의 자리 지정 (가)

- `exclude_offer.py`: `--section <이름>` 대신 **`--slot first_come`**(선택, 기본 없음 = 일반 자리). 글자를 `store.FIRST_COME_MARK`에서 가져와 키를 만든다(`(platform, brand, FIRST_COME_MARK)`). 이름을 둘이 따로 적지 않는다. 랜덤 자리(`--slot random`)도 같은 인자로 열어 두되 이 이슈에서는 선착순만 시험한다.
- 새 동작 인자: `--sold-out`(소진 행), `--clear-sold-out`(소진 취소). `--reason`, `--revive`와 **상호 배타**(셋 중 정확히 하나).
- **자리 미지정에서 모호하면 거절한다.** 같은 브랜드에 일반 자리와 선착순 자리가 둘 다 있는데 `--slot`이 없으면 일반 자리를 건드리되, 출력 첫 줄에 "선착순 자리도 있다. 그쪽은 --slot first_come"을 찍는다. (제외 동작의 기존 의미를 안 바꾼다.) `--sold-out`은 `--slot first_come`이 **필수**다. 상시를 소진으로 만드는 사고를 막는다.
- 콘솔 inbox 줄: 선택 필드 `slot`(`"first_come"` 또는 없음). `apply_inbox_line`의 키 대조를 `len(k) == 2`에서 "요청한 slot과 일치하는 키"로 바꾼다. 줄에 `slot`이 없으면 지금처럼 2원소 키만 본다(옛 콘솔 줄과 호환). `action`에 `sold_out`, `clear_sold_out`을 더한다.
- 별칭(`_canon_brand`)으로 접히는 이름마다 행을 하나씩 만드는 기존 규칙은 선착순 자리에도 그대로 적용한다.
- 같은 초 문제: 판단 행은 승자보다 늦어야 한다(`apply_inbox_line` 124~128행). 소진 행도 같은 처리를 쓴다.

### 3.4 L3 소진 감지를 원장에 남긴다 (나)

- `scripts/offer_link_check.py`는 판정만 하는 모듈로 둔다. 원장에 쓰는 일은 **새 함수 `record_first_come_sold_out(verdict_rows, records, now) -> list[dict]`**(위치는 `scripts/first_come_ledger.py`, 새 파일)가 한다. 입력은 판정 행 목록, 출력은 붙일 행 목록. 쓰기는 호출부가 `append_record`로 한다. 순수 함수라 시험할 수 있다.
- 행을 만드는 조건(전부 참일 때만):
  1. 판정이 `first_come_sold_out`이다. `first_come_unobserved`, `ok_*`, `value_mismatch`, 링크 실패는 **쓰지 않는다**.
  2. 판정 행에 마감 카드 화면 경로(`card_screen`)가 있다. `check_first_come`이 지금 이 경로를 행에 싣지 않으므로 **싣는 변경이 필요**하다(카드 읽기 결과에 이미 화면이 있는지는 구현자가 `capture.baemin.read_today_hotdeal`에서 확인한다. 없으면 이 이슈의 구현을 멈추고 알린다. 근거 없는 행을 지어내지 않는다).
  3. 원장의 현재 선착순 승자가 아직 `sold_out` 거짓이다(같은 날 중복을 막는다).
- 오탐 방어(쿠폰함 교차검증과 같은 원칙): `sold_out` 카드가 **브랜드 이름과 금액이 모두 맞는** 카드일 때만 쓴다. `check_first_come`은 `c["brand"] == t["brand"]`로 이름을 맞춘다. 금액까지 `card["amount"] == exported amount`를 요구한다(금액이 다르면 다른 쿠폰의 마감일 수 있다).
- 행: `capture_mode: auto`(관측), `sold_out: true`, `sold_out_evidence.by: "bot"`, `kind: "hotdeal_card"`, `screen`: 마감 카드 화면.

### 3.5 반영 시차 (다)

- 문제: 업로드는 수집 루틴 8단계(`reflect_daily` 이후 `deploy_export`)에서만 일어나, L3가 낮에 소진을 잡아도 서버에 늦게 간다.
- 결정: **소진 전용 빠른 길을 따로 만들지 않는다.** 기존 `export_data.py` → `deploy_export.py --apply`를 L3 실행 직후 같은 프로세스가 부른다. 업로드 쪽은 이미 `sync_inbox` → 원장 → 내보내기 순서로 반영 안 된 정정을 두고 올리지 않는 보호가 있어(설계 §3-4), 새 순서 규칙을 만들지 않는다.
- 호출 주기는 L3의 기존 주기를 따른다(`verify_bot`이 부르는 주기. 구현자가 확인해서 문서에 숫자를 적는다. 이 설계는 숫자를 지어내지 않는다). **미확인**: L3가 예약 수집과 같은 시각에 폰을 잡아 충돌하지 않는지. 폰을 잡는 명령은 예약 시각을 피한다(AGENTS.md).
- 소진 봇(collect 후속)이 생기면 위 호출은 그 봇이 맡는다. 이번 구현의 함수 `record_first_come_sold_out`은 봇이 바뀌어도 판정 행 모양만 맞으면 그대로 쓴다(다형성: 5-2).

### 3.6 열림 시각 변동 (라)

- `first_come_time_changed`는 이번에 원장에 쓰지 않는다. 새 시각이 한 번 보인 값이 맞는지(패널과 카드가 서로 다를 수 있음) 2회 확인 규칙 없이 `badge`와 `conditions`를 덮으면 거짓 관측이 된다. 이번 구현에서는 판정 행에 `screen`의 새 시각이 이미 실려 있으므로(`opens_at`), **후속(collect, 소진 봇 이슈)**이 같은 시각이 연속 2회 읽힌 뒤 갱신하도록 넘긴다. 근거: 2026-10-19 노랑통닭 10시 → 15시는 한 번 관측으로 잡았고 이후 값이 안정적이었는지 이 설계는 모른다.

### 3.7 캐러셀 선착순과 쿠팡이츠 꾸브라꼬 유실 (댓글)

- 둘 다 **collect**(폰 필요)이고 화면 구조를 읽어야 해서 이 설계에서 코드 결정을 하지 않는다. 후속 이슈로 넘긴다(5번). 이슈 막힌 점 1번의 "오퍼가 구간별로 있고 유실이 아니게"는 쿠팡이츠 꾸브라꼬 2026-10-22 원장 행을 보고 어느 `_prefer` 분기에서 구간이 사라졌는지 재현하는 것이 먼저다. **그 원장 행을 이 세션은 읽지 못했다.**

## 4. 폭발 반경 (CHANGE-PROPAGATION)

| 표의 묶음 | 건드리나 | 판단 |
|---|---|---|
| 1. 확실성(certainty) | 아니오 | `sold_out`은 확실성 판정 입력이 아니다. 단 `soldOut`이 참인 선착순이 최고 후보에서 빠지는 쪽은 mono `OfferComparison`/`filters.js`가 이미 처리하는지 **구현자가 `offer-cases.json`에서 `soldOut` 케이스를 읽어 확인**한다. 있으면 변경 없음, 없으면 mono 이슈를 연다 |
| 2. 배너 모양 | 아니오 | 배너 칸을 안 건드린다. 선착순 표식 사고(2026-09-24)와 같은 길이라 `firstCome` 칸 이름은 그대로 둔다 |
| 8. 저장소 경계와 배포 순서 | 해당 | export 쪽만 바뀌면 mono 배포 순서 제약이 없다. 새 칸(`sold_out_evidence`, `sold_out_observed`)은 `export.json`에 **싣지 않는다**(공개 계약이 안 바뀐다). 싣게 되면 API 먼저, 웹 나중 |
| 9. 새 파일 | 해당 | 새 파일 `scripts/first_come_ledger.py`와 테스트를 더한다. tracker는 배포가 없어 mono `PROJECT-STRUCTURE.md` 재생성 대상인지 구현자가 `generate_project_structure.py`를 돌려 확인한다 |

표에 없는 tracker 안의 묶음(직접 코드에서 쟀다):

| 자리 | 넣는가 | 이유 |
|---|---|---|
| `store.py` `_prefer`, `offer_key` | 넣는다 | 3.2 |
| `schema.py` (`sold_out_evidence`, `sold_out_observed` 검증) | 넣는다 | 3.1. `capture_mode: manual`만 사람 소진을 허용 |
| `scripts/exclude_offer.py`, `scripts/deploy_export.py` `apply_inbox_line` | 넣는다 | 3.3 |
| 콘솔 inbox 쓰는 쪽(beggars-ops 콘솔) | **안 넣는다, 알린다** | 이 세션은 beggars-ops를 못 읽는다. `slot` 필드는 선택이라 옛 줄과 호환. 콘솔 화면의 버튼 추가는 별도 이슈(콘솔) |
| `scripts/offer_link_check.py` | 넣는다 | `card_screen`을 판정 행에 싣는다 |
| `scripts/verify_bot.py` | 넣는다(호출만) | 판정 뒤 `record_first_come_sold_out`을 부른다 |
| `scripts/banner_ce.py`, `scripts/coupangeats_weekly.py` | 안 넣는다 | 쿠팡이츠 선착순은 원장 밖. 5-2에서 판단만 한다 |
| `ROUTINE-SPEC.md`, `HARNESS.md` | 문서만 | 구현 PR이 소진 흐름 한 단락을 더한다 |

## 5. 분할, 표, 후속

### 5-1. 선착순 처리 표

| 앱 | 수집 위치 | 원장 자리 | 소진 관측 | 상태 |
|---|---|---|---|---|
| 배민 | 배짱할인 핫딜 코너(`baejjang_daily.hotdeal_records`), 인기 브랜드 패널 | `(앱, 브랜드, 선착순)` | 핫딜 카드 `sold_out`만. 패널은 못 봄 | 확인 |
| 배민 캐러셀(하단) | 쿠폰 발급 컴포넌트 안 오픈 시각과 조건 | 미정 | 미확인 | 댓글에서 지시, 코드 미확인 |
| 쿠팡이츠 | `coupangeats-firstcome-<날짜>.json`, `hotdeal-cards-<날짜>.jsonl`, 배너 | **원장 밖** | 없음 | 이슈 본문 근거, 이번에 코드 재확인 안 함 |
| 요기요 | 미확인 | 미확인 | 미확인 | **미확인** |
| 땡겨요 | 미확인 | 미확인 | 미확인 | **미확인** |

미확인 칸은 설계 세션이 읽지 못했다. 구현 PR이 아니라 후속 이슈(collect)에서 채운다.

### 5-2. 쿠팡이츠 편입 판단

- 이번에는 편입하지 않는다. 댓글이 "검증하고 다형성을 고려해 구조 개선, 분기/통합은 후속에서 결정"이라 했다. 이번 구현은 다형성을 위한 **이음매 하나**만 둔다: `record_first_come_sold_out`의 입력을 앱 이름이 아닌 "판정 행 모양"(`platform`, `brand`, `verdict`, `card_screen`, `card amount`)으로 정의해, 쿠팡이츠 판정기가 같은 모양을 내면 같은 함수를 쓴다. 쿠팡이츠 소진이 파일·배너 경로에서 어떻게 보이는지는 이 세션이 확인하지 않았다.

### 5-3. "없다 / 0 / 통과"의 양성 신호

| 자리 | 지금 "아니다"가 뜨는 때 | 양성 신호 |
|---|---|---|
| 소진 행이 안 만들어짐 | 카드를 못 읽은 것(`first_come_unobserved`), 읽기 실패(`cards is None`), 다른 쿠폰의 카드 | 판정 행의 `cards_read`가 참이고 같은 브랜드, **같은 금액** 카드가 있을 때만 소진/비소진을 말한다. 그 밖은 "미관측"으로 집계에 따로 센다 |
| 같은 날 `sold_out=False` 재관측이 소진을 푸는가 | 인기 브랜드 패널은 마감을 안 읽어 항상 거짓 | `sold_out_observed` 참인 행만 소진을 풀 수 있다 |
| `ok_sold_out`, 소진 0건이라는 보고 | 오늘 소진이 없는 것과 핫딜 카드를 못 본 것이 같은 0 | 보고 줄에 "카드 읽음 N / 못 읽음 M / 소진 K"를 같이 찍는다 |
| CLI/inbox `--sold-out` 대상 | 선착순 자리가 없는데 상시에 적용 | 선착순 키 승자가 없으면 "원장에 선착순 승자가 없다"로 **거절**한다. 상시로 폴백하지 않는다 |

### 5-4. 이슈 분할

- **export (이 PR 뒤 구현, 폰 불필요)**: 3.1, 3.2, 3.3, 3.4(함수와 스키마, 판정 행에 `card_screen` 싣기는 L3 코드 변경이지만 화면 경로가 이미 읽힌 값을 옮기는 일이라 폰 없이 단위 시험 가능), 시차 3.5의 호출 연결.
- **collect 후속 이슈**
  1. 선착순 소진 전용 봇 추가(오픈 뒤 핫딜 카드와 캐러셀 마감 확인, `first_come_time_changed` 2회 확인 후 갱신, L3 소진 담당 분리). 끝 조건: 오픈 후 시각에 폰으로 실제 수집한 소진 행이 `export.json`의 `soldOut`으로 나간다.
  2. 배짱할인 캐러셀 선착순(쿠폰 발급 컴포넌트) 수집 반영.
  3. 쿠팡이츠 선착순의 같은 로직 적용 검증과 구조 결정, 요기요/땡겨요 칸 채우기.
  4. 쿠팡이츠 꾸브라꼬 구간(티어) 유실 재현과 수정(원장 행 확인이 먼저).
- **콘솔 후속(beggars-ops)**: inbox 줄에 `slot`과 소진 동작을 보내는 버튼.

## 6. 원장 append-only

- 모든 정정과 소진 반영은 **새 행 append**다. 삭제도, 기존 행의 `sold_out` 수정도 없다.
- 소진 취소와 다음 날 풀림도 더 늦은 시각의 새 관측이다.
- 새 행의 `captured_at`은 승자보다 늦어야 한다(1초 바닥, `apply_inbox_line`과 같은 처리).
- 이 PR(설계)은 원장을 건드리지 않는다. 구현의 시험은 `tmp_path` 원장만 쓴다.

## 7. 테스트 (결론을 박는 곳)

파일 이름은 구현자가 정한다. 옛 코드에서 먼저 빨갛게 확인한다.

- **T1 CLI 선착순 지정, 상시 불변**: 같은 (앱, 브랜드)에 일반 승자(3,000원)와 선착순 승자(6,000원)를 넣고 `--slot first_come --sold-out` → 새 행이 선착순 키이고 `sold_out` 참, 일반 승자는 `latest_per_brand` 결과가 그대로. (완료 조건 1)
- **T2 콘솔 inbox**: `slot: first_come` 줄이 선착순 키에 걸리고 일반 키는 안 걸린다. `slot` 없는 옛 줄은 지금 동작과 같다. 선착순 승자가 없는데 `slot`을 지정하면 거절 사유가 나가고 일반 자리에 안 걸린다.
- **T3 `--sold-out`은 slot 필수**: 인자 없이 `--sold-out`이면 오류.
- **T4 스키마**: 기계 소진 행은 `sold_out_evidence.screen` 없으면 거부, 사람 행은 `note`와 `screen`이 둘 다 없으면 거부. `sold_out_observed`는 불리언만.
- **T5 L3 → 원장 → export**: `first_come_sold_out` 판정 행(카드 화면과 같은 금액) → `record_first_come_sold_out` → `append_record` → `build_export`의 해당 선착순 오퍼 `soldOut`이 참. (완료 조건 2)
- **T6 쓰지 않는 경우**: `first_come_unobserved`, `cards is None`, 금액이 다른 카드, `card_screen` 없음, 이미 소진인 승자(같은 날 중복)는 빈 목록.
- **T7 소진 유지와 풀림**: 같은 날 `sold_out_observed` 없는 거짓 행(패널)은 소진을 못 푼다. `sold_out_observed` 참인 거짓 행은 푼다. **다음 날** 거짓 행은 푼다(댓글 5번). 시각이 같은 초일 때도 결과가 안정적이다.
- **T8 계약**: mono `offer-cases.json`에 선착순 `soldOut` 케이스가 있는지 읽는 점검(구현 PR 본문에 결과를 적는다). 테스트로 박을 mono 쪽 변경이 필요하면 mono 이슈로 올린다.
- **T9 `EXCLUSION_REASONS` 불변**: `sold_out`이 이 집합에 없다(3.1을 되돌리는 변경을 막는다).

## 8. 사용자에게 물을 것

- 소진 표기를 `excluded` 사유가 아니라 `sold_out` 관측 행으로 정한 것(3.1)이 맞는가. 댓글의 "정정에도 소진"을 이렇게 읽었다.
- 같은 날 소진 유지 규칙(3.2)이 "소진돼도 주기 수집이 다시 올린다"(댓글 5번)와 맞는가. 이 설계는 **같은 날은 유지, 다음 날 풀림**으로 읽었다. 같은 날 오후 핫딜 카드가 다시 열림을 보이는 경우는 `sold_out_observed`로 풀린다.
- 콘솔(beggars-ops) 변경을 export와 따로 이슈로 둬도 되는가.

## 9. 하지 않는 것

1. 수집 시각 변경, 마감 시각 새로 측정.
2. 쿠팡이츠 선착순의 원장 편입(후속 결정).
3. `first_come_time_changed`로 `badge`/`conditions` 갱신(후속, 소진 봇 이슈).
4. mono 코드 수정, `export.json` 공개 계약 변경.
5. 소진을 `excluded` 사유로 넣는 것.

## 10. 범위 점검

export 쪽 구현은 한 PR로 가능한 크기다: 스키마 두 칸, `_prefer` 한 분기, CLI와 inbox의 자리 지정, 새 함수 하나, 판정 행에 화면 경로 한 칸. 단 3.4 2번(마감 카드 화면 경로가 읽기 결과에 있는지)이 거짓이면 구현은 멈추고 collect로 넘긴다.

## 변경 이력

- 2026-10-22 (구현): 승인 전 권한자 댓글(12:32, 12:34)은 이 설계와 부딪히지 않는다. 바꾼 결정 없음.
- 2026-10-22 (구현): §3.4-2 멈춤 조건이 참이었다. L3가 부르는 `read_today_hotdeal(serial)`은 `out_dir` 없이 불려
  화면을 저장하지 않는다(`capture/baemin_baejjang.py` 199행). 그래서 `record_first_come_sold_out`과
  `card_screen` 칸까지만 두고, `verify_bot` 호출 연결(§3.5)은 collect 후속(소진 봇)으로 넘겼다.
  핫딜 카드 행의 `sold_out_observed` 달기(`baejjang_daily.hotdeal_records`, 수집 코드)도 같은 후속이다.
- 2026-10-22 (구현): 새 ADR 번호는 ADR-033. 사람 소진 행은 근거가 필요해 CLI `--sold-out`과 inbox `sold_out`은 `note`가 필수다.
