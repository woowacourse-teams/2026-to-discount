# 오케스트레이션 계약 — 내보내기/출력 (export contract)

> 이 문서는 이 레포(`delivery-discount-tracker`)가 **다른 레포에 내보내는
> 산출물**의 계약을 다룬다. 스크린샷을 레코드로 읽어들이는 판독 계약은
> `parse/CONTRACT.md`를 본다 — 여기서는 건드리지 않는다.
>
> 루트 오케스트레이터가 3레포를 교차 확인할 때 소스를 매번 grep하지
> 않도록 만든 체크인 문서다. 코드가 바뀌면 이 문서도 같이 갱신한다.

## 1. 역할

이 레포는 파이프라인의 첫 단계다 — 입력은 배달앱 화면(스크린샷 + 접근성
트리 덤프), 출력은 `data/export.json`(+ `data/brands-sorted.txt`)이며,
이를 읽는 곳은 `delivery-discount-api`(Spring Boot, 별칭 정규화·확정/보류
판정) 하나뿐이다.

### 원장은 `data/log.jsonl`이다 — 그런데 한동안 아니었다

설계상 흐름은 `log.jsonl` → `export_data.py` → `export.json`이다. 실제로는
2026-07-29부터 원장이 멈춘 채 수집분이 `export.json` 직접 편집으로만
들어왔고, 08-05에 확인했을 때 export 138건 중 **110건을 원장이 한 번도 본
적이 없었다**. `export_data.py`를 그대로 돌리면 그 110건이 사라지는
상태였다.

원인은 게으름이 아니라 구조였다 — 원장을 넣을 진입점이 없었고(`ingest.py`
신설로 해소), 원장이 `.gitignore`에 있어 공유·배포되는 건 `export.json`
뿐이었다(`!data/log.jsonl` 예외 추가로 해소). 되돌리는 방법과 그때 드러난
문제는 `backfill_export.py` 독스트링에 적어뒀다.

**2026-08-10부터 재현된다.** 그전에는 원장에서 export를 다시 만들면 종료된
프로모션이 되살아났다. 원장에 "이 프로모션은 끝났다"를 적을 자리가 없어
제거가 `export.json`에서만 일어났기 때문이다.

적을 자리는 지금도 없다. 대신 종료를 두 축으로 판정하게 되면서 닫혔다.
종료일이 있으면 `expires_at`으로 내리고(`is_live`), 없으면 "이번 전수 수집에
안 보였다"로 내린다(`is_stale_sweep`, `dcd0420`에서 도입). 후자가 들어오기
전까지는 종료일 없는 오퍼를 내릴 방법이 아예 없었다. 지금 export 170건 중
131건이 종료일이 없고, 그 전부를 수집 단위 판정이 맡는다.

`is_stale_sweep`은 전수 수집이 성립하는 네 플랫폼(배민·쿠팡이츠·요기요·
땡겨요)에만 적용된다 — 부분 수집이나 수동 캡처로 들어온 관측은 "이번
수집에 안 보였다"를 판정할 전수 기준 자체가 없다.

검증은 과거 커밋마다 그때의 원장과 코드로 `export.json`을 다시 만들어 실제
커밋된 파일과 대조하는 방식이다. 원장이 버전관리에 들어온 `2c99ccd` 이후
`export.json`이 바뀐 커밋 일곱 개 중, 08-06 두 개만 어긋나고 08-10 다섯 개는
완전히 일치한다.

| 커밋 | 날짜 | 재생성 / 커밋 | 부활 | 누락 | 내용차 |
|---|---|---:|---:|---:|---:|
| `6e2ec88` | 2026-08-06 | 157 / 137 | 20 | 0 | 113 |
| `5f9fffc` | 2026-08-06 | 157 / 137 | 20 | 0 | 113 |
| `ee62fde` | 2026-08-10 | 175 / 175 | 0 | 0 | 0 |
| `ba0c4be` | 2026-08-10 | 132 / 132 | 0 | 0 | 0 |
| `7d79c79` | 2026-08-10 | 165 / 165 | 0 | 0 | 0 |
| `21c4170` | 2026-08-10 | 165 / 165 | 0 | 0 | 0 |
| `2d71c60` | 2026-08-10 | 170 / 170 | 0 | 0 | 0 |

08-06의 20건이 [모노레포 `ORCHESTRATION.md`](https://github.com/woowacourse-teams/2026-to-discount/blob/main/docs/ORCHESTRATION.md)
§4가 적어둔 수치와 같다. 그 문서는 당시 상태를 정확히 기록했고, 지금은 이
표가 그 상태의 끝을 기록한다.

## 2. `schema.validate_record()` 계약

정의: `schema.py`.

### 필수 필드 (없으면 `ValueError`)

```
platform, brand, raw_text, captured_at, target_address, capture_mode, screenshot_path
```

### 선택 필드와 기본값 (`DEFAULTS`)

| 필드 | 기본값 | 비고 |
|---|---|---|
| `page` | `None` | export 안 됨 |
| `section` | `None` | |
| `qualifier` | `None` | |
| `amount` | `None` | |
| `unit` | `"KRW"` | export 안 됨 |
| `scope` | `"brand"` | export 안 됨 |
| `offer_type` | `"discount"` | |
| `needs_review` | `False` | |
| `min_order_amount` | `None` | |
| `tiers` | `None` | |
| `conditions` | `None` | |
| `expires_at` | `None` | 쿠폰 종료일 `YYYY-MM-DD` |
| `badge` | `None` | 금액 옆 짧은 상태 라벨 |
| `sold_out` | `False` | |

### 허용값

- `platform` — `{"baemin", "coupangeats", "yogiyo", "ddangyo", "specialdelivery"}`
- `capture_mode` — `{"auto", "manual", "backfill"}`
  - `backfill`: 화면을 다시 본 게 아니라 `export.json`에서 되돌린 값.
    `config.py`에는 `{"auto", "manual"}`만 있다(캡처 설정용이라 backfill이
    올 일이 없다) — 두 집합이 일부러 다르다.
- `qualifier` — `{None, "최대", "최소"}`. **금액 수식어 전용이다**
  (ADR-004). 상한이냐 하한이냐가 `amount` 해석을 바꾸므로 자유 문자열로
  쓰면 안 된다 — 조건 라벨은 `badge`에 넣는다.
- `scope` — `{"brand", "store"}` (`store`는 현재 미사용)
- `offer_type` — `{"discount", "gift", "coupon", "unknown"}`
- `tiers` — `None` 또는 비어있지 않은 list. 각 원소는 `min_order`·`amount`
  필수, 아래가 선택:

| tier 선택 키 | 값 | 뜻 |
|---|---|---|
| `percent` | `(0, 100]` | 정률+상한 할인. `amount`는 그 상한액 |
| `channel` | `{"배달", "포장", "매장식사"}` | 구간이 아니라 채널별 별개 쿠폰 |
| `sold_out` | bool | 이 구간만 재고 소진 |
| `expires_at` | `YYYY-MM-DD` | 이 구간만 따로 끝남. 비면 레코드 값을 따름 |

  `tiers`는 "구간 누진"만 뜻하지 않는다 — 한 (앱, 브랜드)에 걸린 **여러
  쿠폰**을 담는 자리이기도 하다. `latest_per_brand`가 (앱, 브랜드)당
  레코드를 하나만 남기므로, 쿠폰이 여럿이면 레코드를 늘리지 말고 tiers를
  늘려야 한다(레코드를 늘리면 한쪽이 조용히 사라진다).

검증 순서(`validate_record`): 필수 필드 존재 → `platform`/`capture_mode`
확인 → `DEFAULTS`로 정규화 → `qualifier`/`scope`/`offer_type`/`tiers` 확인.
반환값은 기본값이 채워진 정규화된 dict.

## 3. 내보내는 산출물 (다른 레포가 읽음)

정의: `export_data.py`.

- **파일**: `data/export.json` — JSON 배열, (`platform`, `brand`) 키당
  레코드 1건. `store.latest_per_brand()`로 중복 제거된 최신/확정 레코드만
  담긴다.
- **부산물**: `data/brands-sorted.txt` — 정렬된 브랜드명 목록.

### export.json 항목의 전체 필드 (post-rename, **16개**)

```
platform, brand, amount, qualifier, needsReview, offerType, section,
rawText, capturedAt, screenshotPath, minOrderAmount, tiers, conditions,
expiresAt, badge, soldOut
```

리네임은 snake_case → camelCase 뿐이다(`needs_review` → `needsReview` 식).
`tiers` 원소 내부도 같은 규칙으로 바뀐다: `min_order` → `minOrder`,
`sold_out` → `soldOut`, `expires_at` → `expiresAt`.

**export되지 않는 원장 필드**: `page`, `unit`, `scope`, `target_address`,
`capture_mode`. API는 이 필드들을 모르고 알 필요도 없다.

**API 쪽 대조**: `delivery-discount-api`의 `OfferRecord.java`가 같은 16개
필드를 선언한다. `DiscountTier.java`는 tier의 선택 키까지 포함해
`(minOrder, amount, percent, channel, soldOut, expiresAt)`이다.

### 필드를 추가할 때의 배포 순서

**API 먼저, 트래커 나중.** 두 레포가 별도 self-hosted 워크플로로 독립
배포돼서, 트래커가 먼저 끝나면 구버전 API가 모르는 필드를 받는다. 지금은
`OfferRepository`의 ObjectMapper가 `FAIL_ON_UNKNOWN_PROPERTIES=false`라
무시하고 넘어가지만(예전엔 500이 나서 reload가 깨졌다), 그래도 그 사이엔
값이 유실된 채로 보인다.

## 4. 전달 방식

HTTP push 없음 — **파일 드롭**이다. 사람이 복사하지 않는다.

`.github/workflows/deploy.yml`이 main 푸시마다 self-hosted 러너에서:

1. **가드** — 커밋된 `data/export.json`이 서버 파일보다 낡았으면 중단.
   판정은 (a) 최신 `capturedAt` 비교, (b) 서버에 채워져 있던 상세
   (`tiers`/`badge`/`minOrderAmount`/`conditions`/`expiresAt`)가 비는지.
   건수로는 재지 않는다 — 프로모션이 끝나면 정당하게 줄고, 정상 만료마다
   오탐을 뱉는 가드는 결국 꺼진다.
2. `cp data/export.json ~/delivery-discount-api/data/export.json`
3. `POST /api/reload` (5회 재시도 — API 배포가 따라잡을 시간)

가드를 넣은 이유: `cp`는 서버 파일을 통째로 갈아치운다. 2026-08-05에
서버 138건 대 커밋 135건이었고, 그대로 밀어 실제로 데이터를 날렸다
(청년피자 땡겨요의 tiers 2건과 badge — 라이브 스냅샷으로 복구). 같은
판정을 하는 `check_deploy.py`에 테스트가 붙어 있다(로컬 사전 확인용).

**로컬 개발**: API 기본값은 `classpath:data/export.json`(레포에 커밋된
낡은 픽스처)이라, 로컬에서 `data/export.json`을 고쳐도 안 보인다.
`DISCOUNT_EXPORT_PATH`로 실제 파일을 가리켜야 한다(서버 systemd가 그렇게
띄운다).

## 5. 알려진 갭/WIP

- **종료된 프로모션을 원장에 적을 자리는 여전히 없다.** 다만 재현은 된다.
  종료일이 있으면 `expires_at`으로, 없으면 수집 단위(`is_stale_sweep`)로
  내리기 때문이다(§1). 후자는 전수 수집이 성립하는 배민·쿠팡이츠·요기요·
  땡겨요 4개 플랫폼 한정이다 — 남은 한계는 전수 수집이 아닌 날의 관측만
  으로는 종료를 판정하지 못한다는 것이다. 명시적인 무력화 필드는 아직 없다.
- **만료일 보유율이 앱마다 다르다.** ddangyo 88%, baemin 0%, coupangeats 0%,
  yogiyo 0%(2026-08-13 기준). 만료일이 없는 131건은 전부 `is_stale_sweep`이
  수집 단위로 관리한다. 쿠팡이츠 0%는 정보가 없어서가 아니라 하단 유의사항
  문구를 판독 대상으로 삼은 적이 없어서다
  (`docs/research/2026-07-29-coupangeats-discount-anatomy.md`).
- **`unit`** (기본값 `"KRW"`) — 스키마엔 있지만 export엔 없다. 전량
  KRW라 영향은 없다.
- **`scope`의 `"store"`** — 정의만 있고 미사용(`parse/CONTRACT.md` §1:
  매장 카드는 1차 범위 제외).
- **`needs_review`** — 원장 39건, 그중 브랜드-앱 대표로 뽑히는 14건, export에
  남는 것 0건(2026-08-13 기준). 나머지 25건은 대표 선정에서 확정 레코드에
  지고(ADR-016), 대표가 된 14건은 만료나 지난 수집분으로 걸러진다. 보류
  항목이 화면에 안 나가는 상태다.

## 6. 최종 검증

이 문서의 수치는 코드와 데이터에서 직접 뽑았다(`schema.py`, `export_data.py`,
`data/export.json` 170건 기준). 2026-08-13 확인.
