# Orchestration Contract (delivery-discount-web)

이 문서는 3-레포 파이프라인(delivery-discount-tracker → delivery-discount-api →
**delivery-discount-web(this repo)**)을 교차 점검하는 루트 오케스트레이터용
소스 오브 트루스다. 이 레포가 백엔드(delivery-discount-api)에 대해 실제로
가정하는 것만 담는다 — 매번 소스를 다시 grep하지 않아도 되게 하기 위함.
코드가 바뀌면 이 문서도 같이 갱신할 것 (문서가 아니라 코드가 진실이다).

## 1. 역할

이 레포는 파이프라인의 **화면/display** 단계(React + Vite) — tracker가
판독하고 api가 가공한 데이터를 최종 사용자에게 보여준다. 백엔드 주소는
env var나 프록시가 아니라 **하드코딩**돼 있다: `src/api.js:3`과
`src/analytics.js:9` 둘 다 `const API_BASE = 'https://bebeggars.duckdns.org'`
(이유는 `docs/decisions/ADR-001-fixed-backend-origin.md`).

## 2. 호출하는 API

| Method | Path | 호출 위치 |
|---|---|---|
| GET | `/api/brands` | 정의: `src/api.js` (`fetchBrands`) — 호출: `src/App.jsx` |
| GET | `/api/banners` | 정의: `src/api.js` (`fetchBanners`) — 호출: `src/App.jsx` |
| POST | `/api/events` | 정의: `src/analytics.js:95` (`post`, url 조립) — 실제 전송: `src/analytics.js:109`(sendBeacon, `text/plain`), `src/analytics.js:111-116`(fetch fallback, `application/json`) |

`/api/banners`는 **실패해도 화면에 아무것도 띄우지 않는다.** 카드 그리드의
"불러오기 실패"와 다르게 다룬다 — 배너는 부가 정보라 실패가 화면을
어지럽히면 안 된다(`src/App.jsx`에서 빈 배열로 삼킨다).

`/api/events`는 배치로 전송된다 — `track()`이 큐에 쌓았다가 3초 타이머
또는 큐 10건 도달 시 flush (`src/analytics.js:119-140`), 또는 페이지 이탈
시 `sendBeacon`으로 즉시 전송 (`src/analytics.js:155-167`).

## 3. `/api/brands` 응답에서 읽는 필드

> 줄 번호는 적지 않는다 — 예전엔 `src/App.jsx:276, 292, ...`까지 적어뒀는데
> 화면을 한 번 고칠 때마다 전부 어긋나서, 문서가 맞는지 확인하는 비용이
> 문서를 읽는 이득보다 커졌다. 필드 목록과 의미만 남긴다(전부 `src/App.jsx`).

### brand 객체

`name`, `category`, `offers`, `links`, `maxConfirmedAmount`

### offer 객체 (brand.offers 배열 원소)

| 필드 | 쓰임 |
|---|---|
| `amount` | 칩 대표 금액. `null`이면 `rawText`로 폴백 |
| `rawText` | 금액을 못 읽었을 때 화면에 그대로 |
| `minOrderAmount` | 최소주문금액. 브랜드 카드 정렬(최소주문금액대)에도 씀 |
| `tiers` | 구간/별개 쿠폰 목록. 원소는 `{minOrder, amount, soldOut, expiresAt}` — **`minOrderAmount`가 아니라 `minOrder`** |
| `conditions` | 상세 패널 하단 안내 문구 |
| `expiresAt` | 오퍼 만료일. tier의 `expiresAt`이 이 값과 다를 때만 그 tier에 따로 표시 |
| `badge` | 금액 옆 짧은 상태 라벨 (`선착순`, `배민클럽 7,500원` 등) |
| `soldOut` | 대표 금액이 품절이면 취소선 + "품절" |
| `status` | `'held'`면 재확인 표시 |
| `qualifier` | 금액 앞 수식어(`최대`/`최소`). 값이 있으면 그대로 렌더 |
| `platform` | 앱 배지·딥링크 선택 |

**`tiers`는 "구간 누진"만 뜻하지 않는다.** 같은 `minOrder`에 `amount`만
다른 항목들은 채널·멤버십별 별개 쿠폰이다 — 대표 금액(`amount`)은 조건 없이
받을 수 있는 쪽이고, 조건부 금액은 tier로 내려온다(청년피자 배민: 대표
4,000원, 배민클럽 7,500원은 tier). 그래서 tier를 "더 싼 구간"으로 읽으면 안
된다.

## 3-2. `/api/banners` 응답에서 읽는 필드

당일 행사 배너(`src/EventBanner.jsx`). 응답은 **오늘 띄울 것만, 이미 정렬된
순서로** 내려온다 — 기간 판정(`startsOn <= 오늘 <= endsOn`, Asia/Seoul)과
정렬(priority 오름차순, 동률이면 endsOn 가까운 순)은 전부 서버가 한다.
프론트는 받은 순서대로 5초마다 돌리기만 한다.

| 필드 | 쓰임 |
|---|---|
| `id` | 캐러셀 `key`. 바뀌면 등장 애니메이션이 다시 걸린다 |
| `brand` | 로고 슬롯과 색 추출의 기준. `null`이면 앱 전체 행사로 보고 플랫폼 아이콘, 플랫폼 색 |
| `platform` | 배지, 색 폴백 |
| `url` | 배너를 눌렀을 때 갈 곳. `http`로 시작할 때만 새 탭(커스텀 스킴은 같은 탭이라야 앱으로 간다) |
| `amount` | 가장 큰 글씨. **정수가 아니라 문자열이다** — "최대 30%", "첫 주문 5,000원"이 그대로 온다 |
| `period` | 금액 우측 상단 |
| `extra` | 금액 우측 하단. `null`이면 그 줄이 없고 기간이 세로 가운데로 내려온다 |
| `color` | 있으면 로고 추출을 건너뛰고 이 색을 시드로 쓴다 |

`startsOn`, `endsOn`, `priority`도 응답에 실려 있지만 **프론트는 읽지
않는다.** 날짜를 프론트에서 판정하면 사용자 기기 시계를 따라가 시차 문제가
생긴다.

## 4. 전송하는 analytics 이벤트

**중요**: 아래 이벤트명 목록은 delivery-discount-api의
`EventController.ALLOWED_EVENTS` 세트와 정확히 일치해야 한다 — 화이트리스트에
없는 이벤트는 서버가 조용히 버린다(프론트는 에러를 못 본다). 이 레포만 봐서는
그 세트가 실제로 뭘 허용하는지 알 수 없으니, **점검할 때마다 반드시
delivery-discount-api 쪽 `EventController.ALLOWED_EVENTS`와 diff할 것.**

| 이벤트명 | 발생 위치 | props |
|---|---|---|
| `page_view` | `analytics.js` `startAnalytics()` — 앱 시작 시 1회 | 없음 |
| `page_exit` | `analytics.js` `sendExit()` | `track()`을 거치지 않고 큐에 직접 push — `props` 없이 최상위에 `dwellMs`(보이던 시간, ms) |
| `offer_link_click` | `App.jsx` `OfferChip` | `{ brand, platform }` |
| `brand_expand` | `App.jsx` `BrandCard` | `{ brand, category }` |
| `category_change` | `App.jsx` 필터 선택 | `{ category, mode }` |
| `classify_change` | `App.jsx` 분류 기준 변경 | `{ mode }` |
| `membership_open` | `App.jsx` 멤버십 버튼 | 없음 |
| `banner_click` | `EventBanner.jsx` 배너 링크 | `{ brand, platform, position }` — `position`은 `top`/`bottom`, 브랜드 없는 앱 전체 행사면 `brand: 'none'` |

API 화이트리스트(`analytics/EventController.ALLOWED_EVENTS`)에는 위 8개
외에 **`capture_note_seen`**이 더 있다 — 프론트가 보내지 않는 유령 항목이다.
서버가 모르는 이벤트를 조용히 버리는 방향이라 해는 없지만, 화이트리스트를
diff할 때 "프론트가 빠뜨린 것"으로 오해하지 말 것(2026-08-06 확인).

모든 이벤트에는 `track()`이 공통으로 붙이는 컨텍스트(`visitorId`,
`sessionId`, `visitCount`, `device`, `viewport`, `referrer`, `dev`, `path`,
`clientTs`)가 같이 실린다 (`src/analytics.js:83-89, 128-136`). `dev=1`
쿼리로 켠 세션은 `dev: true`가 붙는다 (`src/analytics.js:73-81`) — 집계 시
제외 대상.

GA4(`src/ga4.js`)는 별도 도구로 `/api/events`를 타지 않으므로 이 화이트리스트
대상이 아니다.

## 5. 알려진 갭/WIP

이 레포 README.md에 명시된, 오케스트레이터가 버그로 오인하면 안 되는
의도적 미완성 상태:

- **상세 스키마가 한 유형만 전제**: README "상세 패널" 절 — "상세 값은
  API가 내려주며 지금은 대부분 비어 있다... 지금 스키마
  (`min_order_amount`/`tiers`)는 '최소주문금액 누진 할인' 한 유형만
  전제해서 정률·적립·현물·메뉴한정 같은 실제 사례를 못 담는다 — 재설계
  방향과 진행 상태는 tracker 레포의
  `docs/plans/2026-07-29-offer-detail-collection.md`." → `offer.minOrderAmount`/
  `offer.tiers`가 비어 있는 건 미수집이지 버그가 아니다.
- **멤버십/지역화폐 반영은 UI만, 로직 없음**: `src/App.jsx` 주석 —
  "멤버십/지역화폐 반영 로직은 아직 없다. delivery-discount-api 레포의
  `docs/specs/2026-07-28-product-brief.md`에 'UI만 배치, 로직 보류'로 명시된
  의도적 보류 상태 — 계산 모델이 나오면 그 레포 `docs/plans`에 계획이
  생긴다." → `MembershipMenu`의 체크박스는 전부 `disabled`, 눌러도 금액
  안 바뀜(`MembershipMenu`). 다만 배민클럽 전용가 자체는 이미 데이터로
  들어오고 있다 — `badge`("배민클럽 7,500원")와 tier로 표시되며, 대표
  금액은 비가입자가 받는 값이다. 계산 모델이 붙기 전에도 두 값이 화면에
  다 있다는 뜻이라, 멤버십 기능의 선행조건은 부분적으로 해소된 상태다.
- **분류 기준 중 카테고리만 활성화**: `ClassifyPicker`에서
  `disabled = m.key !== 'category'` — 할인금액대/최소주문금액대는 지금도
  비활성이다(2026-08-06 확인). `AmountBandSlider`·`brand.maxConfirmedAmount`
  기반 분류 코드는 존재하지만 UI에서 고를 수 없다, WIP.
- **GA4는 임시 도구**: README "방문 측정" 절 — 재방문 정확도 확보를 위한
  임시 병행 도입, 제거 조건은 `docs/decisions/ADR-002-temporary-ga4-for-revisit-accuracy.md`.
  쿠키(`_ga`)를 쓰는 유일한 도구라는 점은 갭이 아니라 의도된 예외.

## 6. 최종 검증

필드 목록은 `src/App.jsx`에서 실제 참조를 뽑아 확인했고, `/api/brands`
라이브 응답과도 대조했다 — 2026-08-06 확인.

`/api/banners` 절과 `banner_click`은 2026-08-12에 추가했다. 로컬 API에
실제 배너를 물려 화면까지 확인했다(3건, 1건, 0건).
