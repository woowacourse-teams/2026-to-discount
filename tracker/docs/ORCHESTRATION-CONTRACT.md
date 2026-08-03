# 오케스트레이션 계약 — 내보내기/출력 (export contract)

> 이 문서는 이 레포(`delivery-discount-tracker`)가 **다른 레포에 내보내는
> 산출물**의 계약을 다룬다. 스크린샷을 레코드로 읽어들이는 판독 계약은
> `parse/CONTRACT.md`를 본다 — 여기서는 건드리지 않는다.
>
> 루트 오케스트레이터가 3레포를 교차 확인할 때 소스를 매번 grep하지
> 않도록 만든 체크인 문서다. 코드가 바뀌면 이 문서도 같이 갱신한다.

## 1. 역할

이 레포는 파이프라인의 첫 단계다 — 입력은 배달앱 스크린샷(롱스크롤
캡처), 출력은 `data/export.json`(+ `data/brands-sorted.txt`)이며,
이를 읽는 곳은 `delivery-discount-api`(Spring Boot, 별칭 정규화·확정/보류
판정) 하나뿐이다.

## 2. `schema.validate_record()` 계약

정의: `schema.py`.

### 필수 필드 (없으면 `ValueError`)

`schema.py:7-10`:

```
platform, brand, raw_text, captured_at, target_address, capture_mode, screenshot_path
```

### 선택 필드와 기본값

`schema.py:12-27` (`DEFAULTS`):

| 필드 | 기본값 |
|---|---|
| `page` | `None` |
| `section` | `None` |
| `qualifier` | `None` |
| `amount` | `None` |
| `unit` | `"KRW"` |
| `scope` | `"brand"` |
| `offer_type` | `"discount"` |
| `needs_review` | `False` |
| `min_order_amount` | `None` |
| `tiers` | `None` |
| `conditions` | `None` |

### 허용값 (enum/모양)

- `platform` — `{"baemin", "coupangeats", "yogiyo", "ddangyo", "specialdelivery"}` (`schema.py:1`)
- `capture_mode` — `{"auto", "manual"}` (`schema.py:5`; `config.py:5`에도 같은 집합이 별도 정의돼 있다)
- `qualifier` — `{None, "최대", "최소"}` (`schema.py:2`)
- `scope` — `{"brand", "store"}` (`schema.py:3`)
- `offer_type` — `{"discount", "gift", "coupon", "unknown"}` (`schema.py:4`)
- `tiers` — `None` 또는 비어있지 않은 list; 각 원소는 `min_order`·`amount` 키를 가진 dict (`schema.py:30-38`, `validate_tiers`). 예: `[{"min_order": 15000, "amount": 3000}, ...]`

검증 순서는 `validate_record()` (`schema.py:41-63`): 필수 필드 존재 →
`platform`/`capture_mode` 확인 → `DEFAULTS`로 정규화 → `qualifier`/`scope`/
`offer_type`/`tiers` 확인. 반환값은 기본값이 채워진 정규화된 dict.

## 3. 내보내는 산출물 (다른 레포가 읽음)

정의: `export_data.py`.

- **파일**: `data/export.json` — JSON 배열, 브랜드당(=`(platform, brand)`
  키당) 레코드 1건. `store.latest_per_brand()`로 중복 제거된
  최신/확정 레코드만 담긴다. `json.dumps(..., ensure_ascii=False, indent=1)`.
- **부산물**: `data/brands-sorted.txt` — 정렬된 브랜드명 목록, 한 줄에
  하나 (`export_data.py:47-48, 57-58`).

### snake_case → camelCase 리네임 표 (`export_data.py:7-23`)

| 원장 필드 (snake_case) | export 필드 (camelCase) |
|---|---|
| `platform` | `platform` |
| `brand` | `brand` |
| `amount` | `amount` |
| `qualifier` | `qualifier` |
| `needs_review` | `needsReview` |
| `offer_type` | `offerType` |
| `section` | `section` |
| `raw_text` | `rawText` |
| `captured_at` | `capturedAt` |
| `screenshot_path` | `screenshotPath` |
| `min_order_amount` | `minOrderAmount` |
| `tiers` | `tiers` (원소 내부도 리네임 — 아래) |
| `conditions` | `conditions` |

`tiers` 배열 원소도 별도로 camelCase 처리된다 (`camel_tiers`,
`export_data.py:30-34`): `min_order` → `minOrder`, `amount` → `amount`.

### export.json 항목의 전체 필드 목록 (post-rename, 13개)

```
platform, brand, amount, qualifier, needsReview, offerType, section,
rawText, capturedAt, screenshotPath, minOrderAmount, tiers, conditions
```

**API 쪽 대조**: `delivery-discount-api`의
`src/main/java/com/discounttracker/offer/OfferRecord.java`가 이
13개 필드를 정확히 같은 이름·같은 순서로 선언한 Java record다
(`OfferRecord.java:13-27`). 이 문서 작성 시점(§6 커밋 기준)에는
두 레포가 정확히 일치 — 어느 한쪽에서 필드를 추가/삭제하면 반드시
반대쪽도 같이 바꿔야 한다.

**export되지 않는 schema 필드** (원장에는 있지만 export.json에는 없음):
`page`, `unit`, `scope`, `target_address`, `capture_mode`. API는 이
필드들을 모르고 알 필요도 없다 — 새로 export하려면 양쪽 다 고쳐야 한다.

## 4. 전달 방식

HTTP push 없음 — **파일 드롭**이다.

- 로컬 개발: `python export_data.py`가 `data/export.json`을 갱신하면,
  이 레포 README(`README.md:24-27`) 기준 사람이 직접
  `delivery-discount-api`로 복사한다. API 로컬 기본 설정은
  `classpath:data/export.json` (API 레포 `ADR-001-external-export-path.md`).
- 서버 배포: API 레포 `docs/decisions/ADR-001-external-export-path.md`에
  따르면 서버는 `DISCOUNT_EXPORT_PATH` 환경변수로 `file:` 절대경로를
  가리키도록 오버라이드돼 있고(`/home/ubuntu/delivery-discount-api/data/export.json`),
  `scp`로 파일을 올린 뒤 `POST /api/reload`로 재배포 없이 캐시만
  갱신한다. (이 부분은 API 레포 소관이라 읽기만 하고 이 레포에서는
  건드리지 않는다 — 참고용 인용.)

## 5. 알려진 갭/WIP

소스에 `TODO`/`FIXME` 마커는 없다 (세션 로그 1건 제외, 실코드 아님).
대신 스키마·export 코드의 주석이 실질적인 갭을 명시하고 있다:

- **`min_order_amount` / `tiers` / `conditions`** — 쿠폰 상세를 열어야
  보이는 값이라 "아직 대부분 비어 있다" (`schema.py:21-23`,
  `export_data.py:18-19` 주석 원문). 스키마·export 양쪽에 필드는
  뚫려 있지만 실제 캡처 파이프라인이 채우는 경우는 드물다 —
  자동 판독 흐름이 아니라 손으로 채우는 값(`validate_tiers` 독스트링,
  `schema.py:31`).
- **`unit`** (기본값 `"KRW"`) — 스키마엔 정의돼 있지만 export 필드
  목록(`FIELDS`, `export_data.py:7-23`)엔 없다. 현재 전량 KRW라
  영향은 없지만, 통화가 늘어나면 export에도 추가해야 한다.
- **`scope`** — `"brand"`/`"store"` 두 값이 정의돼 있지만 `store`는
  현재 파이프라인에서 실사용 안 됨 (`parse/CONTRACT.md` §1: 매장 카드는
  1차 범위에서 제외, 스킵). export에도 안 나간다.
- **`page`** — 스키마엔 있지만 export에는 안 나간다 (캡처 메타데이터로만
  남고 API로는 안 넘어감).
- **요기요** — README(`README.md:64`) 기준 전량 `needs_review: true`
  (쿠폰 실적용가 재확인 전) — 스키마 위반은 아니지만 데이터 신뢰도
  갭으로 알아둘 것.

## 6. 최종 검증

`git rev-parse HEAD` (short): `de4b456` — 2026-08-01 확인.
