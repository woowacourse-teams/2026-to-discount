# 25. 배너 문구(period·extra)를 오퍼처럼 구조화한다 (2026-09-17)

계획만. 도입 시점은 22번(검수 화면)과 같이 정한다 — 검수 화면의 배너 폼이
자유 문장 두 칸이 아니라 이 필드들이 되게.

## 1. 지금 무엇이 문제인가 (실측)

서버 `banners.yml` 77장(2026-08-22 ~ 09-17)의 문구를 세어 봤다.

| 칸 | 서로 다른 값 | 같은 뜻을 다르게 쓴 예 |
|---|---|---|
| `amount` | 25 | `8,000원` / `최대 8,000원` / `8,000원(3,000+5,000)` / `BHC/홍콩반점 8,000원` / `6,000/5,000/8,000원` |
| `period` | 46 | `오전 11시` / `오전 11시 오픈` / `매일 오전 11시` / `매일 오전 11시 오픈` / `오전 11시 오픈 선착순` / `오전 11시부터 선착순` (여섯 가지, 뜻은 하나) |
| `extra` | 54 | `16,000↑, 선착순 할인 / 사용선착순` / `16,000원↑, 사용(발급X) 선착순` / `16,900원↑, 선착순 쿠폰` |

문구가 **사실상 데이터 모델**이다. 세 곳이 문장을 도로 파싱한다:

- API `Banner.minOrderFromExtra()` — `extra`에서 정규식으로 최소주문 추출(둘 다 적는
  사람이 없어 생긴 폴백). 묶음 배너는 `18,000원↑ 즉시 3,000원 + 25,000원↑ 선착순 5,000원`
  같은 문장에서 구간 둘을 뽑는다.
- 트래커 `banner_routine._names_in()` / `brands_of()` — `extra`에서 브랜드 이름을
  뽑아 오늘 수집과 대조. 09-15~17 매일 "오늘 수집에 없는 브랜드 — 랜덤쿠폰, 뽑기,
  선착순"으로 헛 SUSPECT를 냈고, stop-word를 더해 막았다(`2ae1127`). 문장을 파싱하는 한
  같은 종류의 오탐이 계속 생긴다.
- 트래커 `is_single_day(period)` — `'9월 17일 하루만'` 문자열로 하루짜리 판정.

반면 **오퍼 쪽은 이미 구조**다(`export.json`): 구간 `{amount, minOrder, percent, cap,
channel, membership, expiresAt}`, 오퍼 `{qualifier('최대'), conditions, badge, soldOut}`.
웹은 이걸 `won(t.minOrder)↑`, `~09.30`, `배달` 배지로 그린다. 배너만 사람이 쓴 문장을
그대로 띄운다.

## 2. 관례 조사

### schema.org `Offer`
값·조건·기간을 다 필드로 둔다: `price`/`priceSpecification`, **`eligibleTransactionVolume`**
(최소주문금액 — 배달 예제가 정확히 "minimum order of $20"), `validFrom`/`validThrough`
(살 수 있는 기간), `availabilityStarts`/`availabilityEnds`(쓸 수 있는 기간 — 둘을
가른다), `eligibleQuantity`, `availableDeliveryMethod`(배달/포장), `eligibleCustomerType`.

### Google Merchant Center 프로모션 피드 (`promotions/v1 Attributes`)
전자상거래 쿠폰 표준에 가장 가깝다. 핵심 필드:

| 필드 | 뜻 | 우리 문구에서 대응 |
|---|---|---|
| `couponValueType` | MONEY_OFF / PERCENT_OFF / … | `8,000원` vs `10%` |
| `moneyOffAmount` / `percentOff` / `maxDiscountAmount` | 값·상한 | `4,000원 + 10%(최대 4,000)` |
| `minMoneyOffAmount`~`maxMoneyOffAmount` | 범위 | `랜덤쿠폰(3,000~8,000)` |
| `minimumPurchaseAmount` | 최소주문 | `18,000원↑` |
| `limitQuantity` | 수량 제한 | `선착순 300명` |
| `promotionEffectiveTimePeriod` vs `promotionDisplayTimePeriod` | 쓰는 기간 vs 보여주는 기간 | `startsOn/endsOn` vs 실제 쿠폰 기한 |
| `redemptionChannel` | ONLINE / IN_STORE | `배달 한정` / `픽업 한정` |
| `redemptionRestriction` + `customRedemptionRestriction` | 열거 + 자유 문장 폴백 | 아래 `note` |
| `longTitle` | 사람이 읽는 제목 하나 | `뚜쥬데이` |
| `audience` | 대상 | `고객별 타겟딜`, `와우 전용` |

두 표준의 공통 교훈: **값·문턱·기간·수량·채널·대상은 필드, 자유 문장은 딱 하나**(제목
또는 비고). 문장을 파싱해서 필드를 만들지 않는다.

### 전자상거래 할인 객체(Shopify `DiscountCodeBasic`, Stripe `Coupon`)
같은 모양: `minimumRequirement`, `customerGets{value: amount|percentage}`,
`startsAt/endsAt`, `usageLimit`, `appliesOncePerCustomer`. 반복(매일 11시 오픈) 개념은
어느 표준에도 없다 — 이건 우리 도메인(선착순 데일리 오픈)의 고유 필드다.

## 3. 제안 — 배너 필드를 오퍼 구간과 같은 어휘로

```yaml
- id: 뚜레쥬르-20260917
  brand: 뚜레쥬르
  platform: ddangyo
  url: https://fdofd.ddangyo.com/gateway4.html?4PftX5z
  event: 뚜쥬데이            # 자유 문장은 이것 하나(짧은 제목). 없어도 된다
  amount: 6000               # 정수. 오퍼 tier.amount와 같다
  minOrder: 18000            # 오퍼 tier.minOrder와 같다
  limit: first_come          # first_come | random | targeted | none(기본)
  usage: use                 # use(사용선착순) | issue(발급선착순). limit=first_come일 때만
  startsOn: 2026-09-17
  endsOn: 2026-09-17
  priority: 2
```

```yaml
- id: coupangeats-seonchakssun-am-20260914
  platform: coupangeats
  brands: [푸라닭, 던킨, KFC]
  amounts: [6000, 5000, 8000]   # brands와 같은 길이. 하나면 amount
  opensAt: "11:00"              # 매일 이 시각에 열린다(startsOn~endsOn 동안 반복)
  limit: first_come
  startsOn: 2026-09-14
  endsOn: 2026-09-30
```

| 필드 | 형 | 오퍼 쪽 대응 | 대체하는 문구 |
|---|---|---|---|
| `amount` / `amounts` | int / int[] | `tier.amount` | `8,000원`, `6,000/5,000/8,000원` |
| `percent`, `cap` | int | `tier.percent`, `tier.cap` | `10%(최대 4,000)` |
| `amountRange` | [min,max] | (없음, Merchant `minMoneyOff~max`) | `랜덤쿠폰(3,000~8,000)` |
| `qualifier` | `최대` | `offer.qualifier` | `최대 8,000원` |
| `minOrder` / `minOrders` | int / int[] | `tier.minOrder` | `18,000원↑` |
| `opensAt` | `"HH:MM"` | (없음 — 우리 도메인) | `오전 11시 오픈`, `매일 오후 5시` |
| `limit` | enum | (없음, Merchant `limitQuantity`) | `선착순`, `랜덤쿠폰`, `타겟딜` |
| `usage` | enum | (없음) | `사용(발급X) 선착순` |
| `quota` | int | Merchant `limitQuantity` | `선착순 300명` |
| `channel` | `배달`/`포장` | `tier.channel` | `배달 한정`, `픽업 한정` |
| `membership` | 플랫폼 키 | `tier.membership` | `와우 전용` |
| `event` | 짧은 문장 | Merchant `longTitle` | `뚜쥬데이`, `위클리 슈퍼딜` |
| `note` | 자유 문장 | Merchant `customRedemptionRestriction` | 위로 못 담는 나머지만 |

`period`·`extra`는 **파생값**이 된다. 프론트 `bannerText.js`가 필드에서 만든다:

- period: `startsOn == endsOn` → `9월 17일 하루만`; `opensAt` → `매일 오전 11시 오픈`
  (`endsOn - startsOn` 이 0이면 `매일` 생략); 그 외 `~9/30`.
- extra: `[event] / [minOrder↑], [limit·usage 문구], [channel], [note]` — 지금 가장
  많이 쓴 형식 `뚜쥬데이 / 18,000원↑, 사용(발급X) 선착순` 그대로.

이행 기간엔 `period`/`extra`가 적혀 있으면 그것을 우선한다(덮어쓰기 칸). 77장을 한 번
스크립트로 옮기고 사람이 훑은 뒤 문장 칸을 지운다.

## 4. 기술·도구 — 새 의존성 없음

| 필요 | 선택 | 근거 |
|---|---|---|
| 숫자·날짜·시각 문구 | **브라우저 `Intl`** (Node 22에서 확인) | `Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric'})` → `9월 17일`, `{hour:'numeric'}` → `오전 11시`, `formatRange` → `9/17 ~ 9/20`, `NumberFormat` → `18,000`. 지금 문구와 글자까지 같다 |
| 문구 조립 | `bannerText.js` 순수 함수 5개 + 단위 테스트 | 웹 `won()`과 `detail__tier-*` 렌더가 이미 같은 일을 한다 — 같은 함수를 배너에도 쓴다 |
| 스키마 검증 | Java `Banner` record compact 생성자(이미 `startsOn ≤ endsOn` 류를 여기서 본다) + `brands.length == amounts.length` 등 추가. 트래커 `banner_routine --verify`는 `/api/banners` JSON을 읽으므로 그대로 | `spring-boot-starter-validation`(Bean Validation)은 record 한 개에 붙이기엔 과하다 — 필드 열 개짜리 검증은 생성자 여덟 줄 |
| 열거값 | Java enum `Limit {FIRST_COME, RANDOM, TARGETED, NONE}` + snakeyaml 소문자 매핑 | `platform`이 이미 문자열 키로 오가는 방식과 같게 소문자 문자열로 |

검토하고 **안 쓰는 것**:

- **RFC 5545 RRULE / `rrule.js`** — 반복은 "매일 HH:MM 오픈" 하나뿐. `opensAt` 한 칸이면 된다.
- **ICU MessageFormat(`intl-messageformat`, formatjs)** — 한국어는 복수형이 없고 템플릿이
  다섯 줄이라 라이브러리가 템플릿보다 크다.
- **schema.org JSON-LD 그대로 내보내기** — SEO 목적이 아니다. 어휘만 빌린다.
- **pydantic / jsonschema**(트래커) — 설치돼 있지 않고, 스키마의 진실은 Java record다.
  트래커는 API가 내준 JSON을 검증만 한다.

## 5. 이행 순서

1. **API**: `Banner`에 필드 추가(전부 선택), compact 생성자 검증, `/api/banners`에
   그대로 실어 보낸다. `minOrderFromExtra()`는 `minOrder`가 있으면 안 탄다(이미 그렇다).
2. **웹**: `bannerText.js` — `period`/`extra`가 비었을 때만 필드에서 만든다. 프리뷰로
   문구가 글자까지 같은지 77장 스냅샷 비교(`banner-shot.mjs`).
3. **백필**: 서버 `banners.yml` 77장을 스크립트로 옮긴다(한 번만 파싱, 결과를 사람이 본다
   — 이때 46가지 period가 6가지로 줄어든다). 문장 칸 삭제.
4. **트래커**: `banner_routine`이 `extra` 문장 대신 필드를 만든다(`hotdeal_extra()` →
   `minOrder/limit/usage`), 대조는 `brands` 배열로 — `_names_in`, `brands_of`,
   `is_single_day`, stop-word 삭제. 22번 검수 화면의 배너 폼은 이 필드다.
5. **API 정리**: `minOrderFromExtra()`, `EXTRA_MIN_ORDER` 정규식 삭제.

되돌리기: 1~2는 필드가 전부 선택이라 옛 yml이 그대로 돈다. 3 이후 되돌리려면
백업 yml(`banners.yml.bak-*`, 서버에 이미 매번 남긴다).

## 6. 결정 필요

1. `amounts`/`minOrders` 병렬 배열 vs `items: [{brand, amount, minOrder}]` 객체 배열.
   추천 **객체 배열** — 브랜드별 시각(`12시-노랑통닭 · 17시-BBQ`)까지 담으려면 결국 객체다.
   단, 그러면 `brands`/`amount`는 `items`에서 파생.
2. `limit=random`의 값 표기 — `amountRange` 별도 칸 vs `amount: [3000, 8000]` 재활용.
   추천 별도 칸 — `amount`가 int 아니면 프론트 폭 계산(`amountIsWide`)이 갈린다.
3. 이행 시점 — 22번과 같이(추천) vs 지금 1~2단계만 먼저. 지금 해도 얻는 것은 매일
   SUSPECT 오탐 제거뿐이라 22번과 묶는 쪽이 싸다.
