# 겹쳐 쓰는 쿠폰(요기요 2단)을 담고, 대표 금액을 도메인이 판정한다 — 설계

작성일: 2026-08-13 · 상태: 설계 확정, 구현 전

## 한 줄 요약

요기요는 쿠폰 두 장(고정 메뉴할인 + 정률 쿠폰)을 **겹쳐 쓸 수 있는데** 지금
모델은 둘 중 하나만 고른다. 겹침을 표현할 `tier_mode`를 넣고, 정률 쿠폰의
상한액을 `cap`으로 분리해 `amount`가 항상 "실제로 받는 금액" 하나만
뜻하게 한다. 카드에 뜨는 대표 금액은 원장이 박아주는 값이 아니라 도메인이
구간에서 계산한다.

## 왜 필요한가 — 구체적인 예

요기요 굽네치킨 원장 레코드(2026-07-31 실측):

```
raw_text: "4,000원 메뉴할인, 17,000원 이상 구매 시
           / 5%, 25,000원 이상 주문 시 최대 3,000원 할인"
tiers: [{min_order: 17000, amount: 4000},
        {min_order: 25000, amount: 3000, percent: 5}]
```

쿠폰이 두 장이고 **둘 다 받을 수 있다.** 25,000원어치를 시키면 메뉴할인
4,000원과 정률 쿠폰이 같이 붙는다.

그런데 지금 `tiers`는 "주문금액 구간별 **차등**"이라는 뜻이다
(`DiscountTier` javadoc: "그 중 가장 큰 amount가 곧 그 최대 n원"). 그래서
API는 두 구간 중 큰 값 하나만 고른다 — 4,000원. 실제로 받는 금액과 다르다.

### 함정 하나 더 — 정률 tier의 `amount`는 상한액이다

`{min_order: 25000, amount: 3000, percent: 5}`의 `3000`은 그 문턱에서
받는 금액이 아니라 **cap**이다(`schema.py` 주석: "percent를 추가하고
amount는 그 상한액(cap)을 그대로 쓴다"). 25,000원 주문의 5%는 1,250원이고,
3,000원에 닿으려면 60,000원을 시켜야 한다.

즉 같은 `amount` 필드가 정액 tier에서는 "받는 금액", 정률 tier에서는
"최대로 받을 수 있는 금액"을 뜻한다. **이 문서를 쓰는 과정에서 실제로 이
때문에 25,000원 주문의 할인을 7,000원으로 잘못 읽는 일이 있었다.** 필드
하나가 두 뜻을 가지면 사람이 틀린다.

## 결정 1 — `cap`을 분리하고 `amount`의 뜻을 하나로 고정한다

| 필드 | 지금 | 바뀐 후 |
|---|---|---|
| `amount` | 정액이면 할인액, 정률이면 상한액 | 항상 **이 문턱에서 실제 받는 금액(원)** |
| `percent` | 정률 표시 | 그대로 |
| `cap` | 없음 | **신설.** 정률의 상한액. 정률 tier에만 |

굽네치킨 tier2는 이렇게 바뀐다:

```
{min_order: 25000, amount: 1250, percent: 5, cap: 3000}
                   ~~~~~~~~~~~~              ~~~~~~~~~
                   25,000 × 5%               60,000원에서 닿는 상한
```

## 결정 2 — `tier_mode`로 겹침을 표현한다

레코드 레벨 필드 하나를 새로 둔다.

```
tier_mode: "exclusive" | "cumulative"     (기본값 "exclusive")
```

- **`exclusive`** — 문턱마다 택일. 지금 원장 170건 전부가 이쪽이고,
  기본값이라 기존 데이터는 한 줄도 안 고친다.
- **`cumulative`** — 문턱을 넘을수록 쿠폰이 겹친다. 요기요 2단이 이쪽.

tier 레벨이 아니라 **레코드 레벨**로 둔 이유: 읽는 쪽이 tier를 하나하나
살펴 "이건 겹치나?"를 판단하지 않고 레코드 한 번에 갈래를 정한다. tier마다
플래그를 달면 "무엇에 겹치는가"가 모호해지고, `channel`처럼 해석 규칙을
주석으로 버텨야 한다.

### 굽네치킨 최종 모습

```json
{
  "platform": "yogiyo",
  "brand": "굽네치킨",
  "amount": 4000,
  "qualifier": "최소",
  "tier_mode": "cumulative",
  "tiers": [
    {"min_order": 17000, "amount": 4000},
    {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000}
  ]
}
```

## 결정 3 — 대표 금액은 도메인이 사다리에서 계산한다

문턱을 낮은 순으로 훑으며, 그 문턱에서 **자격이 되는 tier를 전부 더한다.**

```
굽네치킨 사다리
  17,000원 이상 → 4,000                 (tier1만 자격)
  25,000원 이상 → 4,000 + 1,250 = 5,250 (tier1 + tier2)
```

카드 칩에 뜨는 대표 금액은 **사다리의 최저 문턱 값**(4,000원)이고,
`qualifier`는 `"최소"`다.

**정률 금액은 원 단위 내림이다.** `min_order × percent`가 딱 떨어지지 않으면
버린다(17,000 × 5% = 850, 나누어떨어지지 않는 경우도 내림). 올림으로
과대 표시하지 않는다는 §결정 3의 원칙과 같은 방향이다.

**`qualifier`는 도메인이 덮어쓰지 않는다.** 대신 스키마가 강제한다 —
`tier_mode == "cumulative"`면 `qualifier`는 반드시 `"최소"`여야 한다.
검증으로 막으면 도메인이 필드를 두 번 판정할 필요가 없고, 원장만 봐도
"이건 최소 표기"임이 드러난다.

**만료·품절 구간은 사다리에 안 들어간다.** 기존 `liveTiers`가 먼저 거른
구간만으로 사다리를 세운다. 두 규칙이 만나는 자리라 테스트로 고정한다.
런타임에 구간이 하나만 남아도 정상이다 — "cumulative면 tier 2개 이상"은
원장에 대한 검증이지 런타임 조건이 아니다.

### 왜 최저 문턱인가

가장 낮은 진입 장벽에서 보장되는 금액이라, 이보다 적게 받는 경우가 없다.
[ADR-014](../../decisions/ADR-014-coupangeats-record-guaranteed-floor.md)가
쿠팡이츠에 대해 정한 보장 바닥값 원칙과 같다.

25,000원 문턱값(5,250원)을 대표로 쓰면 17,000~24,999원을 시키는 사용자에게
과대 표시가 된다. 과대 표시는 사용자가 앱에 가서 확인했을 때 배신감으로
돌아오고, 이 프로젝트가 1순위로 꼽는 리스크(오정보로 신뢰 상실)에 직결된다.

다만 최저 문턱만 보여주면 정률 쿠폰이 안 보이므로, **프론트가 `+α`류의
표시를 덧붙인다**(문구·표현은 web 세션 소관). API는 `tier_mode`를 내려보내
프론트가 "겹치는 쿠폰이 더 있다"를 알 수 있게만 한다.

### `exclusive`는 아무것도 안 바뀐다

대표값은 지금처럼 원장 `amount`이고,
[`OfferRecord.amountAsOf`](../../../../delivery-discount-api/src/main/java/com/discounttracker/offer/OfferRecord.java)의
"만료·품절 구간 때문에 내리기만 하고 올리지는 않는다" 규칙도 그대로다.
도메인이 새로 개입하는 건 `cumulative`뿐이다.

### 계산 주체와 교차검증

- **계산은 API 도메인이 한다.** `amountAsOf(today)`가 `tier_mode`를 보고
  갈라져, `cumulative`면 사다리 계산에 위임한다.
- **원장 `amount`는 사람이 적은 확정값으로 남는다.** 없애지 않는다 —
  원장이 원본 출처라는 축은 유지한다.
- **tracker 테스트가 둘이 같은지 검증한다.** "원장의 모든 `cumulative`
  레코드에서 `amount` == 사다리 최저값". 어긋나면 오기입이고 CI가 잡는다.

두 레이어가 같은 규칙을 갖되 한쪽이 다른 쪽을 검증하는 배치는
[ADR-016](../../decisions/ADR-016-confirmed-beats-recency-on-dedup.md)이
중복 정리 규칙에 쓴 것과 같은 패턴이다.

## 변경 범위

### tracker

| 파일 | 변경 |
|---|---|
| `schema.py` | `ALLOWED_TIER_MODES = {"exclusive", "cumulative"}`, `DEFAULTS["tier_mode"] = "exclusive"`, `validate_tiers`에 cap 규칙, `validate_record`에 tier_mode 검증 |
| `export_data.py` | `FIELDS`에 `("tier_mode", "tierMode")`, `camel_tiers`가 `cap` 전달 |
| `data/log.jsonl` | 아래 마이그레이션 7건 |
| `data/export.json` | `export_data.py`로 재생성 |
| `tests/test_schema.py`, `tests/test_export_data.py` | 아래 테스트 |

### api

| 파일 | 변경 |
|---|---|
| `DiscountTier` | `cap` 필드 추가 |
| `DiscountLadder` (신설) | 사다리 계산 전담. `OfferRecord`가 이미 만료 판정으로 커져 있어 분리한다 |
| `OfferRecord` | `tierMode` 필드, `amountAsOf`가 `cumulative`면 `DiscountLadder`에 위임 |
| `Offer` | `tierMode` 통과 |

### API 응답에 추가되는 것

```
offer.tierMode        "exclusive" | "cumulative"
offer.tiers[].cap     정률 상한액. 정률 tier가 아니면 null
```

기존 필드는 하나도 안 바뀐다.

## 검증 규칙 (schema.py)

- `percent`가 있으면 `cap`이 있어야 하고, `percent`가 없으면 `cap`을 두면 안 된다
- 정률 tier는 `amount <= cap`
- `tier_mode`는 `{"exclusive", "cumulative"}` 중 하나, 기본 `"exclusive"`
- `tier_mode == "cumulative"`인데 tier가 1개면 오류 — 겹칠 상대가 없다
- `tier_mode == "cumulative"`면 `qualifier`는 `"최소"`여야 한다

## 마이그레이션 — 원장 7건

정률 tier를 가진 레코드가 원장 363건 중 7건이다.

**요기요 6건** (굽네치킨·푸라닭·BHC치킨·계근상·뚜레쥬르·인생아구찜):
`tier_mode: "cumulative"` 추가, 정률 tier의 `amount`를 `min_order × percent`로
고치고 기존 `amount`를 `cap`으로 옮긴다.

**배민 커피앳웍스 1건**: 단일 tier라 `tier_mode`는 `exclusive` 그대로.
`{min_order: 18000, amount: 5000, percent: 10}` →
`{min_order: 18000, amount: 1800, percent: 10, cap: 5000}`.

### 사용자에게 보이는 변화는 딱 하나

요기요 6건은 2026-08-10 전수 스윕에 안 잡혀 지금 export에 없다 — 화면 영향 0.
살아 있는 건 커피앳웍스뿐이고, 카드 대표값이 **5,000원 → 1,800원**으로 내려간다.

5,000원은 10% 상한이라 50,000원어치를 시켜야 받는 금액이다. 커피 브랜드에서
현실적인 주문액이 아니고, 액면 5,000원을 보고 갔다가 1,800원만 받으면 그게
바로 위에서 말한 배신감이다. 보장 바닥값 원칙대로 1,800원이 맞다.

## 테스트

**schema**
- `percent`만 있고 `cap`이 없으면 거부
- `cap`만 있고 `percent`가 없으면 거부
- `amount > cap`이면 거부
- `tier_mode` 미지정 시 `"exclusive"`로 채워짐
- 모르는 `tier_mode` 값 거부
- `cumulative`인데 tier 1개면 거부
- `cumulative`인데 `qualifier`가 `"최소"`가 아니면 거부
- 정률 금액이 원 단위로 내려간다(나머지 버림)

**export_data**
- `tier_mode`가 `tierMode`로, `cap`이 `cap`으로 camel 변환돼 나감
- `tier_mode`를 안 쓴 기존 레코드가 이전과 동일하게 나감(회귀)

**교차검증**
- 원장의 모든 `cumulative` 레코드에서 `amount == 사다리 최저값`

**DiscountLadder (api)**
- 굽네치킨 실측: 최저 문턱 4,000, 25,000원 문턱 5,250
- tier 1개면 그 tier 금액
- `exclusive`면 사다리를 계산하지 않고 원장 `amount`를 그대로 쓴다
- 만료·품절 구간은 사다리에서 빠진다(기존 `liveTiers` 규칙과 합성)

**회귀**
- 기존 export 170건이 `tier_mode` 도입 후에도 동일하게 산출된다

## 배포 순서

**API를 먼저 배포하고 tracker 데이터를 나중에** 올린다. tracker 워크플로가
API 워크플로보다 먼저 끝나는 문제가 이미 있었다(2026-08-03 badge 추가 때
재현). 지금은 `FAIL_ON_UNKNOWN_PROPERTIES=false`라 역순이어도 reload가
깨지진 않고 `cap`·`tierMode`만 잠시 안 보인다.

## 범위 밖

- **랜덤박스** — `amount: null` + `needs_review`로 남는다. "금액을 모른다"는
  사다리 계산의 문제가 아니라 표현 자체가 없는 문제라, 별도 타입
  (`benefit: Undisclosed`)이 필요하다.
- **멤버십 조건 구조화** — 배민클럽을 지금은 `badge` 문자열로 처리 중이다.
  schema.org가 `validForMemberTier`로 표준화해 둔 영역이고 언젠가 구조화할
  자리지만 이번 범위가 아니다.
- **`tiers`를 쿠폰 배열로 승격하는 전면 재설계** — Medusa·schema.org가
  "조건이 다른 혜택은 별개 엔티티"로 모델링하는 쪽이고,
  [브랜드 상세 수집 계획](../../plans/2026-07-29-offer-detail-collection.md)의
  중단된 sealed 타입 방향이 사실상 그것이다. 요기요 2단 하나 때문에 원장
  363건과 테스트 48개를 전면 개편할 때가 아니다. `tier_mode`를 넣어둬도
  나중에 그쪽으로 갈 때 `cumulative`는 그대로 "쿠폰이 여러 장"이라는 뜻이라
  버려지지 않는다.
- **요기요 상세 재수집** — 지금 export의 요기요 22건은 전부 목록 캡처라
  겹침 정보가 없다. 화면을 보며 tracker가 수집할 일이고, 이 설계는 그
  수집분이 들어올 자리를 먼저 만드는 것이다.
- **프론트 표시** — `+α` 문구, 토글 상세 배치는 web 세션 소관.

## 관련 문서

- [ADR-019](../../decisions/ADR-019-cumulative-tiers-and-domain-judged-amount.md) — 이 설계의 판단 기록(tracker)
- [api ADR-010](../../../../delivery-discount-api/docs/decisions/ADR-010-domain-judges-representative-amount.md) — 대표값 판정 주체(api)
- [ADR-014](../../decisions/ADR-014-coupangeats-record-guaranteed-floor.md) — 보장 바닥값 원칙
- [ADR-016](../../decisions/ADR-016-confirmed-beats-recency-on-dedup.md) — 두 레이어 같은 규칙 패턴
