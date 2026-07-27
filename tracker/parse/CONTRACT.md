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
