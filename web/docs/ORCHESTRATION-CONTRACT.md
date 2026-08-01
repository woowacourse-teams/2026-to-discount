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

| Method | Path | 호출 위치 (file:line) |
|---|---|---|
| GET | `/api/brands` | 정의: `src/api.js:6` (`fetchBrands`) — 호출: `src/App.jsx:687` |
| POST | `/api/events` | 정의: `src/analytics.js:95` (`post`, url 조립) — 실제 전송: `src/analytics.js:109`(sendBeacon, `text/plain`), `src/analytics.js:111-116`(fetch fallback, `application/json`) |

`/api/events`는 배치로 전송된다 — `track()`이 큐에 쌓았다가 3초 타이머
또는 큐 10건 도달 시 flush (`src/analytics.js:119-140`), 또는 페이지 이탈
시 `sendBeacon`으로 즉시 전송 (`src/analytics.js:155-167`).

## 3. `/api/brands` 응답에서 읽는 필드

### brand 객체

| 필드 | 읽는 위치 (file:line) |
|---|---|
| `brand.name` | `src/App.jsx:276, 292, 303, 304, 323, 717, 815, 817` |
| `brand.category` | `src/App.jsx:276, 720` |
| `brand.offers` | `src/App.jsx:58, 254, 260` |
| `brand.links` | `src/App.jsx:322` |
| `brand.maxConfirmedAmount` | `src/App.jsx:57` |

### offer 객체 (brand.offers 배열 원소)

| 필드 | 읽는 위치 (file:line) |
|---|---|
| `offer.amount` | `src/App.jsx:127, 137, 258` (정렬), tiers 안 항목의 `amount`는 `src/App.jsx:136, 217, 218` |
| `offer.rawText` | `src/App.jsx:127` (amount가 null일 때 폴백 표시) |
| `offer.minOrderAmount` | `src/App.jsx:58, 137` |
| `offer.tiers` | `src/App.jsx:136` — 배열 원소는 `{ amount, minOrder }` 형태로 직접 읽음 (`src/App.jsx:217-223`, 필드명이 `minOrderAmount`가 아니라 `minOrder`인 점 주의) |
| `offer.status` | `src/App.jsx:146, 207, 255` (값 `'held'`로 분기) |
| `offer.qualifier` | `src/App.jsx:147, 256` (값 `'최대'`로 분기) |
| `offer.platform` | `src/App.jsx:148, 157, 170, 187, 198, 205, 206, 232, 320, 335` |
| `offer.conditions` | `src/App.jsx:229` |

## 4. 전송하는 analytics 이벤트

**중요**: 아래 이벤트명 목록은 delivery-discount-api의
`EventController.ALLOWED_EVENTS` 세트와 정확히 일치해야 한다 — 화이트리스트에
없는 이벤트는 서버가 조용히 버린다(프론트는 에러를 못 본다). 이 레포만 봐서는
그 세트가 실제로 뭘 허용하는지 알 수 없으니, **점검할 때마다 반드시
delivery-discount-api 쪽 `EventController.ALLOWED_EVENTS`와 diff할 것.**

| 이벤트명 | 발생 위치 (file:line) | props |
|---|---|---|
| `page_view` | `src/analytics.js:171` (`startAnalytics()`, 앱 시작 시 1회 — 호출부: `src/main.jsx:11`) | 없음 |
| `page_exit` | `src/analytics.js:159-165` (`sendExit()`) | `track()`을 거치지 않고 큐에 직접 push — `props` 필드 없이 최상위에 `dwellMs`(보이던 시간, ms)를 실어 보낸다 |
| `offer_link_click` | `src/App.jsx:170` | `{ brand, platform }` |
| `brand_expand` | `src/App.jsx:276` | `{ brand, category }` |
| `category_change` | `src/App.jsx:728` | `{ category, mode }` |
| `classify_change` | `src/App.jsx:767` | `{ mode }` |
| `membership_open` | `src/App.jsx:787` | 없음 |

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
- **멤버십/지역화폐 반영은 UI만, 로직 없음**: `src/App.jsx:62-64` 주석 —
  "멤버십/지역화폐 반영 로직은 아직 없다. delivery-discount-api 레포의
  `docs/specs/2026-07-28-product-brief.md`에 'UI만 배치, 로직 보류'로 명시된
  의도적 보류 상태 — 계산 모델이 나오면 그 레포 `docs/plans`에 계획이
  생긴다." → `MembershipMenu`의 체크박스는 전부 `disabled`, 눌러도 금액
  안 바뀜(`src/App.jsx:643-657`).
- **분류 기준 중 카테고리만 활성화**: `src/App.jsx:551-552` 주석 —
  "할인금액대/최소주문금액대는 당장 비활성화 — 카테고리만 고를 수 있다."
  → `brand.maxConfirmedAmount` 기반 분류(`discount`/`minOrder` 모드)는
  코드상 존재하지만 UI에서 비활성 처리(`disabled`), WIP.
- **GA4는 임시 도구**: README "방문 측정" 절 — 재방문 정확도 확보를 위한
  임시 병행 도입, 제거 조건은 `docs/decisions/ADR-002-temporary-ga4-for-revisit-accuracy.md`.
  쿠키(`_ga`)를 쓰는 유일한 도구라는 점은 갭이 아니라 의도된 예외.

## 6. 최종 검증

`git rev-parse HEAD` (short): `8458720` — 2026-08-01 기준.
