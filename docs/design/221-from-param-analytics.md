# 221: 주소의 from 값을 분석 이벤트에 실어 이력서 유입을 센다

- 이슈: [#221](https://github.com/woowacourse-teams/2026-to-discount/issues/221)
- 상태: 설계 초안(승인 대기)
- 범위: `web/`, `docs/ANALYTICS.md`, `api/` 한 줄(허용 속성 목록)

## 1. 문제

- 이력서 링크로 사람이 들어오는지 알 길이 없다. PDF 뷰어나 메신저 안에서는 리퍼러가 비어 `referrer=direct`로 섞인다.
- 공유 링크는 `shareId`로 사람 단위까지만 알고 채널은 모른다.
- GA4와 Vercel Analytics는 `utm_*`만 읽는다. 자체 분석(서버 원장과 PostHog)은 주소 쿼리를 읽지 않는다.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 서버가 모르는 최상위 칸을 버리는가 | **버린다.** `IncomingEvent` 레코드에 없는 칸은 읽히지 않고, 원장 `VisitEvent`와 PostHog 매퍼도 정해진 칸만 옮긴다 | `EventController.IncomingEvent`, `PostHogEventMapper.map` |
| `props` 안의 키는 버리는가 | 안 버린다. 길이 120자로 자르고 44개까지 받는다. 예외는 `brand_search_submitted` 하나로, `BRAND_SEARCH_PROPS`에 없는 키를 버린다 | `EventController.trimProps` |
| PostHog로 가는가 | `props` 키가 이벤트 속성으로 그대로 간다. 단 `dev` 이벤트는 안 간다 | `PostHogEventMapper.map` 첫 줄 |
| `props.from`이 이미 쓰이는가 | **쓰인다.** `category_change`(`menu-bar`, `sheet`), `platform_filter_toggle`, `membership_toggle`, `quick_filter`는 출처 화면, `history_range_change`와 `coupon_carousel_swipe`는 이전 값을 `from`에 싣는다 | `TopBarB.jsx`, `FilterSheet.jsx`, `BestHistoryChart.jsx`, `CouponCard.jsx`, `App.jsx` |
| `from` 쿼리를 읽는 코드가 있는가 | 없다. `?from=`은 비어 있는 이름이다 | `web/src` 전체 검색 |
| 주소 쿼리를 지우는 코드가 있는가 | `onSharedUnavailable`과 `backClose.js`가 `replaceState(..., '/')`로 쿼리를 지운다. 첫 이벤트(`page_view`)는 앱 시작 때 나가므로 그 전에 읽힌다 | `App.jsx:255`, `backClose.js:10` |

## 3. 결정

### 3-1. 이벤트 속성 이름은 `entryFrom`, 주소 쿼리는 `from`

이슈는 이벤트 속성도 `from`으로 쓰라고 했다. 그대로 하면 안 된다.

- 위 표대로 `props.from`은 이미 여섯 이벤트에서 다른 뜻으로 쓰인다.
- 유입 값을 `from`에 싣는 순서가 둘 다 나쁘다.
  - 이벤트 값이 이기게 두면 그 여섯 이벤트에서는 유입 값이 빠진다.
  - 유입 값이 이기게 두면 `menu-bar` 같은 기존 값이 지워져 지난 수치와 끊긴다.
- PostHog에서 `from`별로 가르면 `resume`, `share`와 `menu-bar`, `sheet`가 한 칸에 섞인다. 완료 조건의 "속성 `from`별 고유 `visitorId`"가 틀린 수를 낸다.

그래서 **주소 쿼리 이름은 이슈대로 `from`, 이벤트 속성 이름은 `entryFrom`** 으로 한다. 이력서 링크(`?from=resume`)는 바뀌지 않는다. 이슈 요구 중 이름 하나만 다르고, 이유와 대안은 §6에 둔다.

### 3-2. `entryFrom`은 `props`에 싣는다. 서버 구조는 안 바꾼다

- 최상위 칸으로 보내면 `IncomingEvent`, `VisitEvent`, 원장 직렬화, `PostHogEventMapper`를 모두 고치고 API를 웹보다 먼저 배포해야 한다. 값 하나 때문에 치르는 값이 크다.
- `props`는 서버가 이미 받아 적고 PostHog로 넘긴다. 서버 변경은 `BRAND_SEARCH_PROPS`에 `entryFrom` 한 줄이다. 모든 이벤트에 실리는 `home`이 같은 이유로 거기 있다(2026-10-04 기록).
- 배포 순서: 웹이 먼저 나가도 서버가 `entryFrom`을 `brand_search_submitted` 하나에서만 못 받고 나머지는 받는다. 그래도 API를 먼저 올린다(8번 묶음의 순서 규칙).

### 3-3. 읽는 자리와 저장

`web/src/analytics-context.js`에 읽는 함수를 더한다. `getAnalyticsContext()`의 반환값은 바꾸지 않는다(그 반환값은 이벤트 최상위로 펼쳐져 서버가 버린다).

- `getEntryFrom()` 새로 내보냄. 값 없으면 `undefined`.
- 거르는 식: `/^[a-z0-9_-]{1,20}$/`. 소문자로 바꾸거나 공백을 자르지 않는다. 대문자와 공백이 든 값은 통째로 버린다.
- 읽는 순서:
  1. `sessionStorage`의 `dk_from`이 있으면 그 값(첫 값 유지).
  2. 없으면 주소의 `from`을 걸러서, 통과하면 `dk_from`에 저장하고 그 값.
  3. 둘 다 없으면 `undefined`.
- 한 번 정한 값은 모듈 변수에 들고 있는다. `sessionStorage`가 막힌 환경에서도 한 페이지 로드 안에서는 유지된다.
- 저장은 기존 `safeStore`로 한다. 실패해도 던지지 않는다.
- 새 세션은 `sessionStorage`가 비어 시작하므로 `from` 없이 들어오면 값이 없다. 재방문이 이력서 유입으로 세지지 않는다.
- 세션 도중 주소가 바뀌거나(`replaceState`) `from`이 사라져도 저장값이 이긴다.

`web/src/analytics.js`의 `createAnalyticsEvent`가 `props`를 합치는 줄에서 `entryFrom`을 넣는다.

- 위치: `HOME_CONTEXT` 뒤, `filterContext` 앞. 서버가 앞에서부터 44개를 세어 자르므로 넘치면 필터 맥락이 먼저 떨어지고 `entryFrom`은 남는다.
- 값이 없으면 키를 넣지 않는다(`undefined`가 `JSON.stringify`에서 빠지긴 하지만 키 자체를 안 만든다).
- 이벤트 고유 `props`에는 `entryFrom` 키가 없으므로 덮어쓰일 일이 없다.

### 3-4. 공유 링크

- `createShareLink`(`web/src/offerSharing.js`): `url.searchParams.set('from', 'share')`를 해시를 쓰기 전에 더한다. 결과 `https://<origin>/?from=share#share=…`. 이전 경로와 쿼리(`dev` 등)는 여전히 안 따라간다.
- `shortShareRedirect`(`web/src/shortShareRedirect.js`): 정상 복원의 `location`을 `/?from=share#share=…`로 한다. 잘못된 코드의 `/#share=invalid`는 그대로 둔다(공유 유입이 아니다).
- `parseShareLink`는 해시만 읽으므로 안 바꾼다. 쿼리가 붙어도 해석은 같다.
- 짧은 링크 생성(`createShortShareLink`)이 돌려주는 `/s/<code>` 자체는 그대로다. 쿼리는 리다이렉트가 싣는다.

### 3-5. 홈 캐시 키

`web/middleware.js`의 `drop` 조건에 `k === 'from'`을 더하고 머리 주석에 `from`을 적는다. 값마다 CDN이 따로 캐시하지 않게 한다. 브라우저 주소는 그대로라 클라이언트는 `from`을 읽는다(ADR-003).

### 3-6. GA4

건드리지 않는다. GA4는 쿼리를 `page_location`으로 받으므로 필요하면 거기서 볼 수 있다는 한 줄만 `docs/ANALYTICS.md`에 적는다.

## 4. 동반 변경 묶음(`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 해당 | 이번 작업에서 |
| --- | --- | --- |
| 7번 행동 이벤트 | 해당. 쏘는 쪽(웹)과 받는 쪽(API 허용 목록)이 같이 움직인다 | `BRAND_SEARCH_PROPS`에 `entryFrom`을 넣는다. 이벤트 이름은 안 늘리므로 `ALLOWED_EVENTS`와 `verify-analytics-event-contract.mjs`의 기존 대조는 그대로 초록이다 |
| 8번 배포 순서 | 해당. API → 웹 | API(허용 목록 한 줄)를 먼저 병합하고 배포 확인 뒤 웹 |
| 9번 새 파일 | 해당 | `analytics-context.test.js`를 새로 만든다. `run-node-tests.mjs`가 `src/**/*.test.js`를 전부 도므로 `package.json`은 안 고친다. 구조 문서는 `scripts/generate_project_structure.py`로 다시 만든다 |
| 1~6번 | 해당 없음 | 오퍼, 배너, 알림, 문구를 안 만진다 |

### 4-1. 계약 검증 스크립트를 넓히는가

이슈는 "서버가 버리면 허용 목록과 계약 검증 스크립트를 함께 고친다"고 했다. 이번에는 **스크립트에 한 검사를 더한다.**

- 기존 스크립트는 이벤트 이름만 대조한다. `props` 키가 `brand_search_submitted`에서 조용히 버려지는 것(2026-10-04 `home`)은 못 잡는다. 이번에도 같은 칸에서 같은 일이 난다.
- 추가 검사: 웹이 모든 이벤트에 싣는 속성 이름(`web/src/analytics.js`의 `HOME_CONTEXT` 키와 `entryFrom`)이 `BRAND_SEARCH_PROPS`에 모두 있는지 맞댄다. 빠지면 어느 이름이 빠졌는지 적고 실패한다.
- 맞대는 이름은 웹에 상수로 모은다. `analytics.js`가 `ALL_EVENT_PROP_KEYS = ['home', 'entryFrom']`을 내보내고, 스크립트는 그 상수를 읽는다. 스크립트가 소스 문자열을 정규식으로 긁지 않는다(문구가 아니라 구조로 짚는다).
- 상수에 이름을 더하지 않고 `props`에 새 공통 키를 싣는 실수는 이 검사가 못 잡는다. 남는 한계로 문서에 적는다.

## 5. 시험

### 웹: `web/src/analytics-context.test.js`(새 파일)

`location`, `sessionStorage`, `localStorage`, `crypto`를 전역에 꽂고 모듈을 매번 새로 읽어 쓴다.

- `?from=resume` → `getEntryFrom()`이 `resume`.
- 허용 밖: 대문자(`Resume`), 공백, 한글, `.`, 21자, 빈 값 → `undefined`. 20자 → 통과.
- 같은 세션에서 주소가 바뀌어 `from`이 사라져도 첫 값 유지. 다른 `from=other`로 바뀌어도 첫 값 유지.
- 새 세션(`sessionStorage` 비움)에서 `from` 없이 들어오면 `undefined`. 직전 세션 값이 따라오지 않는다.
- `sessionStorage`가 던져도(`getItem`, `setItem` 둘 다) 던지지 않고, 같은 로드 안에서는 값을 유지.
- 값 없는 방문의 이벤트에는 `entryFrom` 키가 없다.

### 웹: 이벤트에 실리는지

- `analytics.js`가 만드는 이벤트 `props.entryFrom`이 `resume`인지, 이벤트 고유 `props.from`(예: `category_change`의 `menu-bar`)이 그대로인지 함께 확인한다. 기존 분석 시험(`test:analytics`)이 쓰는 방식을 따른다. 구현자가 그 스크립트 모양을 보고 같은 자리에 더한다.

### 웹: 공유 링크

- `offerSharing.test.js`: 기존 `url.search === ''`를 `?from=share`로 바꾼다. `dev=1` 같은 이전 쿼리는 안 따라간다는 단언은 `url.searchParams.get('dev') === null`로 남긴다. `parseShareLink(url.hash)`는 그대로 통과.
- `shortShareLink.test.js`: 복원 `location`이 `/?from=share#share=…`이고 `parseShareLink`가 같은 대상을 돌려주는지. `/#share=invalid` 경로는 쿼리가 안 붙는지.
- `shareAttribution.test.js`는 해시만 쓰므로 그대로 통과해야 한다. 바뀌면 설계가 틀린 것이다.

### 웹: 미들웨어

- `homeRollout.test.js`에 `?from=resume&q=bbq` → `/?q=bbq`, `?from=share` 단독 → `/`로 다시 쓰기.

### API

- 기존 `EventController` 시험 옆에 `brand_search_submitted`가 `entryFrom` prop을 남기고 다른 미등록 키는 버리는 시험을 더한다.

### 계약 검증

- `npm run test:event-contract`가 초록이고, `BRAND_SEARCH_PROPS`에서 `entryFrom`을 빼면 빨갛게 되는지 한 번 손으로 확인해 PR에 남긴다.

## 6. 문서: `docs/ANALYTICS.md`

- 맥락 표(`referrer` 줄 아래)에 `entryFrom`을 더한다. 뜻, 허용 모양, 세션 수명, `props`에 실린다는 것, 기존 `props.from`과 다른 칸이라는 것.
- "이력서 유입 조회" 절을 더한다.
  - PostHog 인사이트: 이벤트 `$pageview`, 속성 `entryFrom = resume`, 고유 사용자(`visitorId`가 `distinct_id`). 같은 조건으로 `bot is not set`을 건다.
  - 세션 단위로 세려면 `source_session_id`로 고유 세션.
  - `from=share`와 `from=resume`을 한 번에 나누려면 `entryFrom`으로 분해.
  - 원장(`events.jsonl`)에서는 `props.entryFrom`을 `jq`로 거른다. 기존 문서의 원장 조회 예와 같은 모양.
  - 주의: 재방문은 새 세션이라 안 센다. 같은 사람이 이력서 링크를 두 번 열면 세션 둘, 방문자 하나다.
  - 주의: `dev` 이벤트(프리뷰, localhost, `?dev=1`)는 PostHog로 안 가고 원장에만 남는다.
- GA4 한 줄: GA4는 `from`을 읽지 않지만 쿼리가 `page_location`에 실려 거기서 볼 수 있다.
- 값 정하기: 이력서는 `resume`, 앱이 만드는 공유 링크는 `share`. 채널을 나누려면 `resume-gh`처럼 값만 더한다. 모양 규칙(소문자, 숫자, `-`, `_`, 20자)을 같이 적는다.

## 7. 대안과 버린 이유

| 대안 | 버린 이유 |
| --- | --- |
| 속성 이름을 이슈대로 `from`으로 | 이미 여섯 이벤트가 `props.from`을 다른 뜻으로 쓴다. §3-1 |
| 기존 `props.from` 쪽 이름을 바꿔 `from`을 비움 | 지난 수치와 대시보드가 끊긴다. 이번 일의 범위를 넘는다 |
| 최상위 칸 `from`으로 서버 구조 변경 | API 레코드, 원장, 매퍼, 배포 순서까지 번진다. `props`로 충분하다 |
| `utm_source`를 쓴다 | GA4와 Vercel이 자동으로 읽어 이력서 방문이 그쪽 집계에 섞인다. 이슈가 `from`을 고른 이유로 보인다 |
| 세션 시작 때만 `from`을 읽는다 | 같은 탭에 이미 열린 사이트에서 이력서 링크를 눌러도 같은 탭이 재사용되면 놓친다. 저장값이 없을 때는 읽는 쪽이 더 많이 센다 |
| 방문자 단위로 `from`을 저장(`localStorage`) | 재방문이 이력서 유입으로 센다. 이슈가 막으라고 한 것 |

## 8. 끊기면 무엇이 보이나

- `BRAND_SEARCH_PROPS`를 안 고치면 화면은 멀쩡하고 `brand_search_submitted`의 `entryFrom`만 비어 있다. 검색 이벤트로 유입별 행동을 나눌 때만 드러난다. §4-1의 검사가 잡는다.
- `middleware.js`를 안 고치면 값마다 홈 캐시가 따로 생겨 함수 호출이 그만큼 늘 뿐 화면은 같다.
- `createShareLink`만 고치고 `shortShareRedirect`를 안 고치면 짧은 링크(`/s/<code>`)로 들어온 공유 방문이 `entryFrom` 없이 센다. 두 시험이 따로 있는 이유.
- `ANALYTICS.md`의 조회법이 `from`이라고 적히면 `menu-bar` 같은 기존 값과 섞인 수를 낸다. 이름을 `entryFrom`으로 못박는다.

## 9. 구현 순서

1. API: `BRAND_SEARCH_PROPS`에 `entryFrom`, 시험 하나. 먼저 병합과 배포 확인.
2. 웹: `analytics-context.js`, `analytics.js`(상수와 props 합치기), `offerSharing.js`, `shortShareRedirect.js`, `middleware.js`와 시험.
3. 검증 스크립트의 props 대조, `docs/ANALYTICS.md`, `docs/PROJECT-STRUCTURE.md` 다시 만들기.
4. 프리뷰: `preview/<이름>` 브랜치로 올려 `?from=resume`을 붙여 열고, 개발자 도구 네트워크에서 `/api/events` 요청 본문의 `props.entryFrom`이 `resume`인지 보고 결과를 PR에 남긴다. 프리뷰는 `dev`로 찍히므로 PostHog 운영 집계에 안 섞인다. 360px 스크린샷도 같이 남긴다.

## 10. 결정이 필요한 것

- **속성 이름을 `entryFrom`으로 해도 되는가.** 이슈의 `from`과 다르다. 승인하지 않으면 §3-1의 두 순서 중 하나를 골라야 하고 둘 다 기존 값이나 새 값을 잃는다.
- **저장값이 없을 때 세션 도중에도 `from`을 받아들이는가.** 이 설계는 받아들인다(§7). 세션 시작 때만 읽기를 원하면 `isNewSession`을 조건에 더하면 된다.
- 확인하지 않은 것: PDF 뷰어나 메신저 안 브라우저에서 `sessionStorage`가 새 탭마다 비어 시작하는지는 실기기에서 보지 않았다. 이력서 링크를 같은 탭에서 이어 열면 직전 세션의 첫 값이 이긴다.
