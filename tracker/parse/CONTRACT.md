# 판독 계약

롱스크롤 캡처 이미지 한 장을 읽고 **브랜드 카드 하나당 레코드 하나**를 만든다.
자동(비전)과 수동(사람)에 동일하게 적용된다 ([ADR-008](../docs/decisions/ADR-008-manual-fallback-parity.md)).

산출물은 `schema.validate_record()`가 받아들이는 dict여야 한다.

## 절차

1. **브랜드 데이터 카드만 추출한다.** 아래는 브랜드가 아니므로 레코드를 만들지 않는다.
   - 순수 프로모션 타일 — `WOW! 와우 컬렉션`처럼 카드 자리에 끼어 있는 배너
   - 하위 페이지로 보내는 버튼 — `이츠셰프컬렉션 보러 가기`, `장보기 쿠폰북 받으러 가기` ([ADR-005](../docs/decisions/ADR-005-main-page-only.md))
2. **매장 카드와 브랜드 카드를 구분한다.** 지점명·별점·최소주문금액·거리가 붙어 있으면 매장이다
   (`처갓집양념치킨 동판교점 ★4.7 최소주문 18,000원`). 1차 범위는 브랜드뿐이므로 매장 카드는 건너뛴다.
3. 카드마다 읽는다 — 브랜드명, 카드가 속한 섹션 제목, 할인 문구 **원문 그대로**.
4. 할인 문구에서 `qualifier`(`최대`/`최소`/없음)와 숫자를 **분리해** 담는다.
5. 할인이 아니면 금액을 비우고 종류를 표시한다 (아래 §금액 판정).

## 금액 판정 — 여기가 유일한 실질 위험 지점

`최대`와 `최소`는 **큰 숫자 옆에 아주 작은 글씨로** 붙는다. 놓치면 의미가 뒤집힌다
([ADR-004](../docs/decisions/ADR-004-preserve-qualifier.md)).

- 숫자만 보고 넘어가지 말고 숫자 **왼쪽 위·왼쪽**의 작은 글자를 반드시 확인한다
- 확대해도 판독이 안 되면 **추측하지 말고** `qualifier: null`, `needs_review: true`
- `amount`는 정수(원). `7천원` → `7000`, `4,000원` → `4000`
- 정액이 아니면(`최대 15%`, 금액 없음) `amount: null`, `needs_review: true`
- `raw_text`는 화면 문구를 **손대지 않고** 그대로 옮긴다. 판독이 의심스러울 때 되짚을 유일한 근거다

| 화면 | qualifier | amount | offer_type |
|---|---|---|---|
| `최소 4,000원` | `"최소"` | 4000 | discount |
| `최대 7천원 할인` | `"최대"` | 7000 | discount |
| `10,000원 브랜드 할인` | `null` | 10000 | discount |
| `한정판 굿즈 증정!` | `null` | `null` | gift + `needs_review` |
| `쿠폰 받기` | `null` | `null` | coupon + `needs_review` |
| 판단 불가 | `null` | `null` | unknown + `needs_review` |

## 필드 채우는 법

`docs/specs/2026-07-26-design.md` §5 스키마를 따른다.

| 필드 | 채우는 방법 |
|---|---|
| `platform` | `baemin` / `coupangeats` / `ddangyo` |
| `page` | 캡처한 화면 이름. 예: `"브랜드관 > 오늘의 할인"` |
| `section` | 화면에 보이는 섹션 제목 **그대로** ([ADR-006](../docs/decisions/ADR-006-section-as-data.md)) |
| `brand` | 카드의 브랜드명 |
| `qualifier` `amount` `raw_text` `offer_type` `needs_review` | 위 §금액 판정 |
| `scope` | 브랜드 카드는 `"brand"` |
| `captured_at` | 캡처 시각. `YYYY-MM-DDTHH:MM:SS+09:00` |
| `target_address` `capture_mode` `screenshot_path` | 캡처 메타데이터에서 그대로 |
| `min_order_amount` `tiers` `conditions` | 쿠폰 상세를 열었을 때만 채운다 — 아래 §쿠폰 상세 판정 |

## 쿠폰 상세 판정 — 목록에 없고 상세를 열어야 보이는 값

목록 화면의 "최대 N원"은 상세를 열어야 진짜 조건(최소주문금액 또는
그 대신 붙는 예외 조건)이 드러난다. 상세 화면에서 본 쿠폰마다 아래
셋 중 **정확히 하나**로 분류해 채운다 — 셋을 섞어 채우지 않는다.

1. **단일 최소주문금액** — `"OO원 이상 주문 시 사용 가능"` 형태로 금액
   하나만 조건이면 `min_order_amount`에 정수(원)로 넣는다. `tiers`·
   `conditions`는 `null`.
   예: `"5,000원 할인 · 25,900원 이상 주문 시 사용 가능"` →
   `min_order_amount: 25900`.
2. **구간 할인(여러 쿠폰)** — 같은 브랜드에 최소주문금액이 다른 쿠폰이
   여러 장 캐러셀로 있으면(예: 3,000원/17,000원 이상, 5,000원/30,000원
   이상) `tiers`에 `[{"min_order": 17000, "amount": 3000}, {"min_order":
   30000, "amount": 5000}, ...]`로 넣는다. 이번 파이프라인은 캐러셀
   스와이프를 자동화하지 않으므로(위 "다루지 않는 것"), 화면에 이미
   보이는 카드까지만 넣고 잘려서 안 보이는 나머지는 `conditions`에
   `"추가 쿠폰 있음, 미확인"`으로 남긴다. `min_order_amount`는 `null`.
3. **예외 조건(금액 조건이 아님)** — 최소주문금액이 아예 없고 대신
   "특정 메뉴 주문 시에만 사용 가능", "1일 1회" 같은 다른 형태 조건이면
   `min_order_amount`·`tiers`는 `null`로 두고 `conditions`에
   **`"메뉴 한정: "` 접두어 + 화면 문구 그대로**를 넣는다. 접두어로
   상세를 안 열어본 미수집(`conditions: null`)과 확인했더니 금액
   조건이 아니었던 경우를 구분한다.
   예(훌랄라참숯바베큐치킨, 배민, 2026-07-31 실측):
   `"12,100원 할인 · (순살) 참숯구이 1.5마리 (순살 반마리 증정) 사용
   가능"` → `min_order_amount: null`, `tiers: null`,
   `conditions: "메뉴 한정: (순살) 참숯구이 1.5마리 (순살 반마리 증정)
   사용 가능"`.

상세를 아직 안 열어봤으면 셋 다 `null`로 둔다(현재 원장 대부분의
상태) — "미수집"과 "확인했지만 조건이 없음"을 스키마상으로 구분하지
않는다. 이번 예외 조건 처리는 이 구분까지는 넓히지 않는다(범위 밖).

## 회귀 확인용 정답

`ref/delivery/coupangeats.jpg`를 이 절차로 읽으면 아래가 나와야 한다.
판독 품질이 떨어졌는지 보는 기준점이다 (명세 §12).

```json
{"platform": "coupangeats", "section": "피자 브랜드 할인", "brand": "반올림피자",
 "qualifier": "최소", "amount": 4000, "raw_text": "최소 4,000원",
 "scope": "brand", "offer_type": "discount", "needs_review": false}
```

`ref/delivery/ddangeyo.jpg`:

```json
{"platform": "ddangyo", "section": "전체", "brand": "BBQ",
 "qualifier": null, "amount": null,
 "raw_text": "BBQ 필릭스 PICK 주문 시, 한정판 굿즈 증정! +4천원 쿠폰까지!",
 "scope": "brand", "offer_type": "gift", "needs_review": true}
```
