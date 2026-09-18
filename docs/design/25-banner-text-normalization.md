# 25. 배너 문구를 오퍼와 같은 구조로 바꾼다 (2026-09-17)

결정: 당일 행사 배너(`banners.yml`)의 자유 문장 두 칸(`period`, `extra`)을 오퍼 구간과 같은 필드(금액, 최소주문, 열림 시각, 선착순 여부, 채널, 멤버십)로 바꾸고, 화면 문구는 필드에서 만든다. 2026-09-18에 도입을 결정했다(7절). 콘솔 편집기의 배너 폼이 이 필드들을 갖는다.

## 1. 배경

배너는 사람이 서버의 `banners.yml`에 직접 쓴다. 한 장에 금액 문구 `amount`, 기간 문구 `period`, 부가 조건 문구 `extra`가 있다. API는 이 문장을 그대로 웹에 내보내고, 웹은 그대로 그린다. 오퍼(수집 원장에서 온 할인)는 다르다. 오퍼는 `export.json`에서 이미 구조를 갖는다. 구간마다 `amount`, `minOrder`, `percent`, `cap`, `channel`, `membership`, `expiresAt`가 있고 오퍼에 `qualifier`, `conditions`, `badge`, `soldOut`이 있다. 웹은 이 값을 `18,000원↑`, `~09.30`, `배달` 배지로 그린다.

## 2. 문제

2026-08-22부터 2026-09-17까지 서버 `banners.yml`에 쌓인 배너 77장의 문구를 셌다.

| 칸 | 서로 다른 값의 수 | 같은 뜻을 다르게 쓴 예 |
|---|---|---|
| `amount` | 25 | `8,000원`, `최대 8,000원`, `8,000원(3,000+5,000)`, `BHC/홍콩반점 8,000원`, `6,000/5,000/8,000원` |
| `period` | 46 | `오전 11시`, `오전 11시 오픈`, `매일 오전 11시`, `매일 오전 11시 오픈`, `오전 11시 오픈 선착순`, `오전 11시부터 선착순` (여섯 가지, 뜻은 하나) |
| `extra` | 54 | `16,000↑, 선착순 할인 / 사용선착순`, `16,000원↑, 사용(발급X) 선착순`, `16,900원↑, 선착순 쿠폰` |

문구가 사실상 데이터 모델이 되어 있다. 세 곳의 코드가 문장을 도로 파싱한다.

- API `Banner.minOrderFromExtra()`는 `extra`에서 정규식으로 최소주문금액을 뽑는다. 사람이 `minOrder` 칸과 `extra`를 둘 다 적는 일이 없어 생긴 대체 경로다. 묶음 배너는 `18,000원↑ 즉시 3,000원 + 25,000원↑ 선착순 5,000원` 같은 문장에서 구간 둘을 뽑는다.
- 수집기 `banner_routine.py`의 `_names_in()`과 `brands_of()`는 `extra`에서 브랜드 이름을 뽑아 오늘 수집과 대조한다. 2026-09-15부터 09-17까지 매일 "오늘 수집에 없는 브랜드: 랜덤쿠폰, 뽑기, 선착순"이라는 헛 경고를 냈다. 제외 단어 목록을 늘려 막았지만(커밋 `2ae1127`), 문장을 파싱하는 한 같은 종류의 오탐이 계속 생긴다.
- 수집기 `is_single_day(period)`는 `9월 17일 하루만`이라는 문자열로 하루짜리 배너를 판정한다.

## 3. 근거: 다른 곳은 어떻게 하나

schema.org의 `Offer`는 값, 조건, 기간을 전부 필드로 둔다. `price`, `eligibleTransactionVolume`(최소주문금액. 배달 예제가 정확히 "minimum order of $20"이다), `validFrom`과 `validThrough`(살 수 있는 기간), `availabilityStarts`와 `availabilityEnds`(쓸 수 있는 기간), `eligibleQuantity`, `availableDeliveryMethod`(배달과 포장), `eligibleCustomerType`.

Google Merchant Center 프로모션 피드(`promotions/v1 Attributes`)가 전자상거래 쿠폰 표준에 가장 가깝다.

| Merchant 필드 | 뜻 | 우리 배너 문구에서 대응하는 것 |
|---|---|---|
| `couponValueType` | 정액 또는 정률 | `8,000원`과 `10%` |
| `moneyOffAmount`, `percentOff`, `maxDiscountAmount` | 값과 상한 | `4,000원 + 10%(최대 4,000)` |
| `minMoneyOffAmount`, `maxMoneyOffAmount` | 값의 범위 | `랜덤쿠폰(3,000~8,000)` |
| `minimumPurchaseAmount` | 최소주문금액 | `18,000원↑` |
| `limitQuantity` | 수량 제한 | `선착순 300명` |
| `promotionEffectiveTimePeriod`, `promotionDisplayTimePeriod` | 쓰는 기간과 보여 주는 기간을 가른다 | `startsOn`과 `endsOn`, 실제 쿠폰 기한 |
| `redemptionChannel` | 온라인 또는 매장 | `배달 한정`, `픽업 한정` |
| `redemptionRestriction`과 `customRedemptionRestriction` | 열거값에 자유 문장 하나를 덧붙인다 | 아래 제안의 `note` |
| `longTitle` | 사람이 읽는 제목 하나 | `뚜쥬데이` |
| `audience` | 대상 | `고객별 타겟딜`, `와우 전용` |

Shopify의 `DiscountCodeBasic`과 Stripe의 `Coupon`도 같은 모양이다. `minimumRequirement`, `customerGets`(정액 또는 정률), `startsAt`과 `endsAt`, `usageLimit`, `appliesOncePerCustomer`.

두 표준의 공통점은 하나다. 값, 문턱, 기간, 수량, 채널, 대상은 필드에 두고 자유 문장은 제목 또는 비고 하나만 둔다. 문장을 파싱해서 필드를 만들지 않는다. 다만 "매일 11시에 열린다"는 반복 개념은 어느 표준에도 없다. 선착순 쿠폰이 매일 다시 열리는 것은 이 서비스 도메인의 고유한 필드다.

## 4. 제안: 배너 필드를 오퍼 구간과 같은 어휘로

```yaml
- id: 뚜레쥬르-20260917
  brand: 뚜레쥬르
  platform: ddangyo
  url: https://fdofd.ddangyo.com/gateway4.html?4PftX5z
  event: 뚜쥬데이            # 자유 문장은 이 짧은 제목 하나. 없어도 된다
  amount: 6000               # 정수. 오퍼 tier.amount와 같다
  minOrder: 18000            # 오퍼 tier.minOrder와 같다
  limit: first_come          # first_come, random, targeted, none(기본)
  usage: use                 # use(사용 선착순), issue(발급 선착순). limit이 first_come일 때만
  startsOn: 2026-09-17
  endsOn: 2026-09-17
  priority: 2
```

```yaml
- id: coupangeats-seonchakssun-am-20260914
  platform: coupangeats
  brands: [푸라닭, 던킨, KFC]
  amounts: [6000, 5000, 8000]   # brands와 같은 길이. 하나면 amount
  opensAt: "11:00"              # startsOn부터 endsOn까지 매일 이 시각에 열린다
  limit: first_come
  startsOn: 2026-09-14
  endsOn: 2026-09-30
```

| 배너 필드 | 형 | 오퍼 쪽 대응 | 대체하는 문구 |
|---|---|---|---|
| `amount` 또는 `amounts` | 정수 또는 정수 배열 | `tier.amount` | `8,000원`, `6,000/5,000/8,000원` |
| `percent`, `cap` | 정수 | `tier.percent`, `tier.cap` | `10%(최대 4,000)` |
| `amountRange` | [최소, 최대] | 없음. Merchant의 `minMoneyOffAmount`와 `maxMoneyOffAmount` | `랜덤쿠폰(3,000~8,000)` |
| `qualifier` | `최대` | `offer.qualifier` | `최대 8,000원` |
| `minOrder` 또는 `minOrders` | 정수 또는 정수 배열 | `tier.minOrder` | `18,000원↑` |
| `opensAt` | `"HH:MM"` | 없음. 이 도메인 고유 | `오전 11시 오픈`, `매일 오후 5시` |
| `limit` | 열거값 | 없음. Merchant의 `limitQuantity` | `선착순`, `랜덤쿠폰`, `타겟딜` |
| `usage` | 열거값 | 없음 | `사용(발급X) 선착순` |
| `quota` | 정수 | Merchant의 `limitQuantity` | `선착순 300명` |
| `channel` | `배달` 또는 `포장` | `tier.channel` | `배달 한정`, `픽업 한정` |
| `membership` | 플랫폼별 멤버십 키 | `tier.membership` | `와우 전용` |
| `event` | 짧은 제목 | Merchant의 `longTitle` | `뚜쥬데이`, `위클리 슈퍼딜` |
| `note` | 자유 문장 | Merchant의 `customRedemptionRestriction` | 위 필드에 담기지 않는 나머지 |

`period`와 `extra`는 필드에서 만드는 파생 문구가 된다. 웹의 `bannerText.js`가 만든다.

- `period`: `startsOn`과 `endsOn`이 같으면 `9월 17일 하루만`. `opensAt`이 있으면 `매일 오전 11시 오픈`(기간이 하루면 `매일`을 뺀다). 그 밖에는 `~9/30`.
- `extra`: `[event] / [minOrder↑], [limit과 usage 문구], [channel], [note]` 순서. 지금 가장 많이 쓰는 형식 `뚜쥬데이 / 18,000원↑, 사용(발급X) 선착순`과 같다.

이행 기간에는 `period`나 `extra`가 적혀 있으면 그 문장을 우선한다. 77장을 스크립트로 한 번 옮기고 사람이 훑은 뒤 문장 칸을 지운다.

## 5. 기술 선택: 새 의존성 없음

| 필요한 것 | 선택 | 근거 |
|---|---|---|
| 숫자, 날짜, 시각 문구 | 브라우저 내장 `Intl` | Node 22에서 확인했다. `Intl.DateTimeFormat('ko-KR', {month:'long', day:'numeric'})`는 `9월 17일`, `{hour:'numeric'}`는 `오전 11시`, `formatRange`는 `9/17 ~ 9/20`, `NumberFormat`은 `18,000`을 준다. 지금 문구와 글자까지 같다 |
| 문구 조립 | `bannerText.js`의 순수 함수 다섯 개와 단위 테스트 | 웹의 `won()`과 오퍼 구간 렌더가 이미 같은 일을 한다. 같은 함수를 배너에도 쓴다 |
| 스키마 검증 | Java `Banner` record의 compact 생성자 | `startsOn`이 `endsOn`보다 늦지 않은지 같은 검사를 이미 여기서 한다. `brands`와 `amounts`의 길이가 같은지 등을 더한다. Bean Validation(`spring-boot-starter-validation`)은 record 하나에 붙이기엔 과하다. 필드 열 개 검증은 생성자 여덟 줄이다 |
| 열거값 | Java enum `Limit {FIRST_COME, RANDOM, TARGETED, NONE}`, yml에는 소문자 문자열 | `platform`이 이미 소문자 문자열 키로 오간다 |

검토하고 쓰지 않기로 한 것.

- RFC 5545 RRULE과 `rrule.js`. 반복은 "매일 HH:MM에 연다" 하나뿐이라 `opensAt` 한 칸이면 된다.
- ICU MessageFormat(`intl-messageformat`, formatjs). 한국어는 복수형이 없고 템플릿이 다섯 줄이라 라이브러리가 템플릿보다 크다.
- schema.org JSON-LD 출력. 검색 노출이 목적이 아니다. 어휘만 빌린다.
- 수집기 쪽 pydantic이나 jsonschema. 설치되어 있지 않고 스키마의 진실은 Java record다. 수집기는 API가 내준 JSON을 검증만 한다.

## 6. 이행 순서

1. API: `Banner`에 필드를 더한다(전부 선택 사항). compact 생성자에서 검증하고 `/api/banners`에 그대로 실어 보낸다. `minOrderFromExtra()`는 `minOrder`가 있으면 타지 않는다(지금도 그렇다).
2. 웹: `bannerText.js`를 만든다. `period`나 `extra`가 비었을 때만 필드에서 문구를 만든다. 프리뷰에서 77장 스냅샷을 찍어 문구가 글자까지 같은지 비교한다(`web/scripts/dev/banner-shot.mjs`).
3. 백필: 서버 `banners.yml` 77장을 스크립트로 옮긴다. 파싱은 이때 한 번만 하고 결과를 사람이 본다. 46가지였던 `period`가 6가지로 줄어든다. 문장 칸을 지운다.
4. 수집기: `banner_routine.py`가 `extra` 문장 대신 필드를 만든다(`hotdeal_extra()`를 `minOrder`, `limit`, `usage`로). 브랜드 대조는 `brands` 배열로 한다. `_names_in`, `brands_of`, `is_single_day`, 제외 단어 목록을 지운다. 22번 검수 화면의 배너 폼은 이 필드를 쓴다.
5. API 정리: `minOrderFromExtra()`와 `EXTRA_MIN_ORDER` 정규식을 지운다.

되돌리기: 1단계와 2단계는 필드가 전부 선택 사항이라 옛 yml이 그대로 돈다. 3단계 이후에 되돌리려면 서버가 매번 남기는 백업(`banners.yml.bak-*`)을 쓴다.

## 7. 결정 (2026-09-18, 사용자)

1. 묶음 배너는 `items: [{brand, amount, minOrder, opensAt}]` 객체 배열로 적는다. `brands`와 `amount`(화면 금액 문구)는 `items`에서 파생한다. 브랜드마다 시각과 금액이 다른 선착순을 병렬 배열로는 담을 수 없다.
2. 랜덤 쿠폰은 `amountRange: [최소, 최대]` 별도 칸. **최소는 비워도 된다**(`[null, 8000]`). 화면에는 "최대 8,000원"만 나온다. 하한을 모르는 경우가 많다.
3. 시점은 지금. 검수 화면(22)을 기다리지 않는다. 오늘(09-18) 겪은 세 문제(브랜드 뒷말 오인, 금액 상속 오류, 묶음 축소)가 전부 문구 파싱에서 났다. 콘솔 편집기(설계 21의 7절)가 이미 있어 폼을 이 필드로 바꾸면 된다.
4. 백필은 스크립트로 77장을 옮기지 않는다. 살아 있는 배너만 콘솔에서 사람이 옮기고, 지난 배너는 문장 칸 그대로 둔다. 문장 칸이 있으면 그 문장을 우선하는 규칙이 이행 기간 내내 산다.
5. 실제 스키마(API `Banner`)와 도메인(수집기 `banner_routine`이 만드는 배너)도 같은 방향으로 간다. 수집기는 문구 대신 `items`와 `limit`, `opensAt`을 만든다.

이행 순서는 6절 그대로. 1단계(API)와 2단계(웹 파생 문구, 편집기 폼)를 먼저 하고, 4단계(수집기)는 그 뒤 바로 잇는다.
