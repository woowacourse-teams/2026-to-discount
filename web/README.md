# 배달앱 브랜드 할인 비교 웹

배달앱별 브랜드 할인을 한 화면에서 비교하는 MVP의 프론트엔드(React + Vite).
백엔드는 [delivery-discount-api](../delivery-discount-api) 별도 레포다.
원본 캡처·데이터는 [delivery-discount-tracker](../delivery-discount-tracker)
파이썬 파이프라인이 판독해 API 레포로 공급한다.

## 성격과 수집 원칙

**개인이 만든 비영리 정보 제공 페이지다.** 광고·제휴 수수료를 받지 않고,
어느 배달앱과도 제휴 관계가 없다. 이 성격은 화면 하단 `SiteFooter`에
그대로 밝혀 두었다 — 문구를 지우지 말 것. 근거는 tracker 레포의
[ADR-015](../delivery-discount-tracker/docs/decisions/ADR-015-open-access-only-and-disclosure.md).

데이터는 각 앱에서 **누구나 볼 수 있는 화면을 사람이 직접 보고 옮겨 적은
것**이다. 자동 크롤링과 기술적 접근 제한 우회는 하지 않는다.

**앱 화면 캡처 이미지는 공개하지 않는다.** 금액·최소주문금액 같은 사실은
옮겨 적을 수 있지만 캡처 이미지 자체는 각 플랫폼의 저작물이다. 판독 근거가
필요하면 tracker 레포의 `ref/delivery/`에서 확인한다(비공개).

## 실행

`npm install && npm run dev` (http://localhost:5173). 백엔드 주소는
`src/api.js`에 `https://bebeggars.duckdns.org`로 고정되어 있어 로컬이든
배포든 항상 그 주소로 API를 호출한다 — 별도 환경변수·프록시 설정이 필요
없다. 백엔드를 바꾸려면 `src/api.js`의 `API_BASE`를 직접 수정한다.
왜 env var/프록시 대신 고정값인지는
[docs/decisions/ADR-001-fixed-backend-origin.md](docs/decisions/ADR-001-fixed-backend-origin.md).

배포는 Vercel(`beggars-five.vercel.app`) — 백엔드 CORS 허용 목록에
이미 등록돼 있다.

## 구조

- `src/App.jsx` — 브랜드 카드 그리드, 브랜드별 상세 패널, 떠 있는 툴바
  (분류·안내·카테고리·멤버십·검색), 고지 푸터. 툴바는 첫 화면에서 배너
  아래 제자리에 있다가 스크롤하면 상단에 붙는다(`position:sticky`)
  - `CATEGORIES` — 필터 탭 목록(라벨). 브랜드별 분류·앱별 바로가기는
    여기 없다 — API가 `brand.category`/`brand.links`로 내려준다.
    **브랜드를 추가·수정하려면 delivery-discount-api의
    `src/main/resources/brands.yml`을 고친다**(프론트 재배포 불필요).
    새 카테고리를 만들 때만 이 배열에 탭을 추가하면 된다.
  - `CategoryBar` — 탭마다 배경을 켜고 끄는 대신, 활성 탭의 실측
    위치·너비(`offsetLeft`/`offsetWidth`)로 하이라이트 하나가
    슬라이드되는 세그먼트 컨트롤. 라벨 길이가 제각각이라 CSS만으론
    폭을 못 구해 JS로 잰다.
  - `MembershipMenu` — 버튼 바로 아래 뜨는 드롭다운(화면 오른쪽에서
    밀려나오던 드로어에서 교체됨). 바깥을 누르면 닫힌다.
  - `SiteFooter` — 비영리·비제휴, 수집 방법, 면책, 상표 고지. 법적 성격을
    밝히는 자리라 임의로 축약하지 않는다.
- `src/EventBanner.jsx` — 당일 행사 배너(상단 + 스크롤 후 하단, 5초
  캐러셀). 배너 내용은 프론트에 없다 — API의 `banners.yml`이 출처다
  (아래 "당일 행사 배너")
- `src/brandColor.js` — 배너 색. 로고 PNG에서 시드색을 뽑아 배경·테두리·
  글자·강조를 파생한다. 못 뽑으면 플랫폼 색
- `src/logos.jsx` — `BrandLogo`, `PlatformBadge`, 플랫폼 목록. App과
  EventBanner가 같이 쓴다(App.jsx에 두면 순환 import가 된다)
- `src/api.js` — `API_BASE`(고정 백엔드 주소) + `/api/brands`·`/api/banners` 호출
- `src/analytics.js` — 방문 측정. `track(event, props)` + `startAnalytics()`
- `src/ga4.js` — GA4 임시 도입(`startGa4()`). 이유·제거 조건은
  [ADR-002](docs/decisions/ADR-002-temporary-ga4-for-revisit-accuracy.md)
- `src/main.jsx` — `@vercel/analytics/react`의 `<Analytics />`도 여기서
  마운트(Vercel 대시보드용, 자체 `analytics.js`와는 별개)
- `public/logos/` — 브랜드 로고 (파일명 = API가 내려주는 대표명, 규칙은 `public/logos/README.md` 참고)
- `public/platform-icons/` — 배민/쿠팡이츠/땡겨요/요기요 아이콘
- `public/links/` — 각 앱에서 공유 기능으로 받은 브랜드 바로가기 원본 메모

## 당일 행사 배너

페이지 최상단에 배너가 뜨고, 스크롤해서 화면 밖으로 나가면 하단에 떠 있는
배너로 넘어간다. 여러 건이면 5초마다 넘어간다(한 건이면 안 돌고 인디케이터도
안 나온다). 하단 배너의 닫기 버튼은 **그날 하루** 다시 안 뜨게 한다.

**배너를 추가하거나 수정하려면 delivery-discount-api의
`src/main/resources/banners.yml`을 고친다** — 프론트 재배포는 필요 없다
(브랜드를 고칠 때 `brands.yml`을 고치는 것과 같다). 배너 내용은 원장
(`export.json`)에서 자동 추출되지 않고 사람이 직접 적는다. "당일 행사, 특별
할인"은 정의상 상시 오퍼 목록에 없는 것을 알리는 자리라서다.

배너는 이미지가 아니라 메타데이터(금액·기간·부가정보)로 그린다. 색은 브랜드
로고 PNG에서 뽑고, 못 뽑으면 그 앱의 색을 쓴다 — 배너는 어차피 그 앱으로
나가는 링크라 색이 거짓말을 하지 않는다.

**배너는 광고 자리가 아니다.** 이 페이지가 비영리·비제휴라는 성격은 배너에도
그대로 적용된다. 제휴 수수료를 받는 링크를 여기 넣지 않는다.

배너가 0건이거나 API 호출이 실패하면 아무것도 그리지 않는다 — 에러도 안
띄운다. 배너는 부가 정보라 실패가 화면을 어지럽히면 안 된다.

## 상세 패널

브랜드 카드를 펼치면 앱별 상세(할인금액/최소주문금액 목록, 조건, 확인일)가
나온다. 헤드라인 금액은 칩 버튼에만 있고 상세에서 또 찍지 않는다 — 예전엔
상세 헤더에도 중복 표시했었다. 판독 원문(raw_text)도 사용자에게 보여줄
정보가 아니라서 상세에는 안 보이고, 금액이 아예 미상일 때의 표시 폴백으로만
쓰인다.

펼치는 방법은 둘 — 카드 헤더 클릭, 금액 칩 클릭(바로가기 링크가 있는 칩은
링크가 우선이라 제외). 마우스가 있는 환경에서는 hover 시 "눌러서 펼치기"
안내만 뜨고 펼쳐지지는 않는다.

상세 값은 API가 내려주며 지금은 대부분 비어 있다. 비어 있으면 감추지 않고
"미확인"으로 표시한다 — 조건이 없는 것과 모르는 것은 다르기 때문이다.
지금 스키마(`min_order_amount`/`tiers`)는 "최소주문금액 누진 할인" 한
유형만 전제해서 정률·적립·현물·메뉴한정 같은 실제 사례를 못 담는다 —
재설계 방향과 진행 상태는 tracker 레포의
`docs/plans/2026-07-29-offer-detail-collection.md`.

## 방문 측정 (analytics)

방문 측정은 네 가지 경로가 있다.

1. **`src/analytics.js`(자체)** — 경로·재방문·체류·행동을 API
   (`/api/events`)와 PostHog SDK에 함께 fan-out한다. API는 자체 서버의 원본
   JSONL에 기록하고, 이 구성을 배포할 때 운영 백엔드 outbox를 비활성화한다.
   왜 자체 구현인지,
   무엇을 수집하고 무엇을 안 하는지는
   delivery-discount-api의
   [ADR-005](../delivery-discount-api/docs/decisions/ADR-005-first-party-analytics.md).
   재방문(`visitCount`)은 `localStorage` 기반이라 삭제·기기 변경에
   취약하다.
2. **`src/posthog.js`(PostHog SDK)** — 도메인 `track()` 이벤트와 `page_exit`를
   브라우저에서 PostHog로 직접 보낸다. 페이지 이동은 SDK가 표준 `$pageview`와
   `$pageleave`로 자동 수집하고, Web Vitals와 표준 기기·브라우저 속성도 SDK가
   수집한다. 클릭 행동은 명시적 이벤트와 겹치지 않게 autocapture를 끄고, 세션
   리플레이와 쿠키도 사용하지 않는다. 익명 방문자 연결에는 자체 API 원장과 같은
   `visitorId`·`source_session_id`를 사용한다.
3. **`@vercel/analytics/react`(Vercel)** — `src/main.jsx`에서 `<Analytics />`
   마운트. 쿠키 없는 집계형 페이지뷰만 Vercel 대시보드로 간다. Next.js용
   `/next` 엔트리가 아니라 Vite에 맞는 `/react` 엔트리를 쓴다. 쿠키를
   안 쓰는 구조라 신규/재방문 구분 자체가 없다.
4. **`src/ga4.js`(GA4, 임시)** — 위 방식만으로는 재방문을 정확히 못 재서
   임시로 병행 도입. 유일하게 쿠키(`_ga`)를 쓰고 데이터가 Google로
   전달된다. 광고 개인화·Google Signals는 꺼서 붙였다. 도입 배경·제거
   조건은 [ADR-002](docs/decisions/ADR-002-temporary-ga4-for-revisit-accuracy.md).

모든 경로를 쓴다는 사실은 `SiteFooter`에 고지돼 있다 — "외부 도구를 안 쓴다"는
더는 정확하지 않으니 이 문구를 다시 단순화하지 말 것. GA4는 쿠키를 쓰는
유일한 도구라 그 사실도 고지문에 그대로 남겨둔다.

### 사용법

앱 시작 시 한 번만 `startAnalytics()`를 부른다(`src/main.jsx`) — 이게
`page_view`를 찍고, 탭 가시성 변화·`pagehide`에 체류 시간 전송을 건다.
이 외의 행동 이벤트는 발생 지점에서 `track(event, props?)`를 직접
부른다. PostHog 환경변수가 설정된 운영 빌드에서는 도메인 `track()` 이벤트와
`page_exit`가 같은 이벤트 객체를 SDK와 `/api/events`에 자동으로 나눠 보내므로
호출처가 PostHog adapter를 따로 부르지 않는다. 첫 `page_view`는 SDK가 지연
로딩되는 동안 보관했다가 PostHog의 표준 `$pageview`로 보내며, API 원장과 같은
이벤트 객체와 `eventId`를 유지한다. 이후 History API 이동은 SDK가 자동 수집한다.

`captureProductSignal()`은 자체 API 원장에 남기지 않을 별도 SDK 전용 신호를 위한
adapter다. 같은 사용자 행동에서 `track()`과 함께 호출하면 중복 집계되므로 기존
analytics 이벤트에는 사용하지 않는다.

```js
import { captureProductSignal } from './posthog.js'

captureProductSignal('brand_search_started', {
  query_length: 3,
  result_count: 5,
})
```

SDK 설정은 Vite 빌드 환경변수로 주입한다. Project API Key는 브라우저 공개용
키지만 Personal API Key는 절대 넣지 않는다. Vercel에서 값을 바꾼 뒤에는
새 빌드가 필요하다.

```text
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

브라우저 직접 요청의 IP는 SDK의 `ip: false` 옵션으로 폐기할 수 없다. 운영 키를
설정하기 전에 PostHog 프로젝트에서 **Discard client IP data** 설정
(`anonymize_ips`)을 활성화하고 실제 이벤트에서 GeoIP 속성이 생성되지 않는지
확인한다. 확인 전에는 운영 `VITE_POSTHOG_KEY`를 설정하지 않는다.

연결 검증은 `?dev=1&posthog_test=1`을 함께 붙여 연다. 같은 탭에서는
`posthog_sdk_connection_test`를 한 번만 보내며, PostHog Live Events에서
`dev: true`, `source_session_id`, `visit_count`를 확인한다. 이 이벤트는 제품
Insight에서 제외한다.

PostHog Person Profile은 `person_profiles: 'always'`로 만든다. 서버 릴레이가
같은 이벤트를 보내면서 프로필을 만드는데, 두 경로의 방침이 갈리면 어느 쪽이
먼저 닿느냐에 따라 프로필이 생겼다 말았다 해서 리텐션이 들쭉날쭉해진다.

프로필을 만들어도 계정 기반 분석은 아니다. `distinct_id`는 브라우저가 만든
난수(`visitorId`)라 지우면 그대로 끊긴다 — 이름·연락처는 여전히 안 보낸다.
재방문은 프로필과 각 이벤트의 `visit_count` 둘 다로 볼 수 있다. 향후 로그인
기반 식별이 필요해지면 이 정책과 개인정보 고지를 함께 재검토한다.

도메인 `track()` 이벤트와 `page_exit`, 첫 `page_view`는 UUID 형식의 `eventId`를
한 번 발급해 API 본문과 SDK `$insert_id`·capture `uuid`에 함께 쓴다. 첫
`page_view`는 대기 큐에서 표준 `$pageview`로 변환한다. SDK가 지연 로딩되는
동안은 최대 100건을 메모리에 보관하고 초기화 뒤 발생 시각(`clientTs`)을 유지해
전송한다. 배포 뒤에는 Live Events의 첫 `$pageview` `$insert_id`와 API 원장의
`page_view.eventId`가 같은지 확인한다.
SDK가 준비된 뒤의 `page_exit`는 즉시 `sendBeacon` transport로 보내며, SDK의
`$pageleave`는 별도로 브라우저 종료를 관측한다. 준비 전 초단기 방문은 API 원장
기록만 보장한다. 이벤트 ID는 브라우저 저장소에 보관하지 않으므로 새로고침 이후
재전송의 중복 제거는 보장하지 않는다.

`?dev=1` 제품 이벤트는 기존 백엔드 mapper와 같은 기준으로 PostHog에 보내지 않고
JSONL에만 남긴다. `?dev=1&posthog_test=1`의 연결 진단 이벤트만 예외다.

```js
import { track } from './analytics.js'

// 지금 붙어 있는 지점들 (App.jsx, FilterSheet.jsx)
track('category_change', { category: c.key })
track('brand_expand', { brand: brand.name, category: brand.category ?? 'none' })
track('offer_link_click', { brand: brandName, platform: offer.platform })
track('membership_toggle', { platform: membership.key, state: 'soon', from: 'sheet' })
track('banner_click', { brand: banner.brand ?? 'none', platform: banner.platform, position: 'top' })
```

새 이벤트를 추가하려면:

1. API 쪽 화이트리스트에 이름을 추가한다
   (`EventController.ALLOWED_EVENTS`, delivery-discount-api) — 안 하면
   서버가 조용히 버려서 프론트만 고쳐서는 로그에 안 쌓인다.
2. 발생 지점에서 `track('새이벤트', { ...props })`를 호출한다. `props`는
   문자열 값의 얕은 객체만 — 서버가 문자열 120자·6개 초과분은 잘라낸다.
3. 접는 동작처럼 "관심 신호가 아닌" 액션은 굳이 안 남긴다 — 이벤트 수가
   신호 대 잡음비를 해친다.

### 본인 테스트 트래픽 표시 (dev 플래그)

배포된 사이트를 직접 열어 테스트하면 그 클릭도 실 트래픽처럼 로그에
쌓인다. 테스트 중인 브라우저에서 `https://beggars-five.vercel.app/?dev=1`을
한 번 열면 `localStorage`에 남아 이후 모든 이벤트에 `dev: true`가 붙는다
(`?dev=0`으로 다시 끔).

> **확인용으로 여는 창마다 한 번씩 켜야 한다.** `localStorage`라
> 브라우저·프로필·시크릿창이 각각 별개로 잡힌다. 폰에서 켰다고 데스크톱이
> 따라오지 않고, 크롬에서 켰다고 사파리가 따라오지 않는다. 브라우저 데이터를
> 지우거나 시크릿창을 닫으면 표시도 사라진다.
>
> 2026-08-20 실측에서 방문자 43명 중 8명(19%)이 표시 없는 개발 트래픽이었다.
> A/B 표본이 수십 명일 때 이 비율은 결론을 뒤집는다.
>
> 표시를 빠뜨린 트래픽은 집계할 때 세션 모양으로 추정해 뺀다(한 세션 안에서
> 창 폭이 여러 개면 개발자). 수집 시점에는 판정하지 않는다 — 예전에 그렇게
> 했다가 안드로이드 폰 사용자 368명을 개발자로 몰아냈다. 배경은
> [api/docs/traffic-analytics.md](../api/docs/traffic-analytics.md)에 있다.
> 추정은 추정이니 `?dev=1`을 켜는 편이 확실하다.

집계할 때는 이 값을 제외한다:

```bash
jq -r 'select(.event=="offer_link_click" and .dev!=true) | ...' events.jsonl
```

기기·브라우저별로 따로 켜야 하고(localStorage 기반), API 화이트리스트
변경 없이 `VisitEvent`/`IncomingEvent`에 필드만 추가해 받는다
(delivery-discount-api).

### 개인정보 관련 동작

- **DNT/GPC를 존중한다.** `navigator.doNotTrack === '1'` 이거나
  `navigator.globalPrivacyControl === true`이면 자체 `track()`·`startAnalytics()`,
  PostHog SDK, GA4, Vercel Analytics 모두 전송하지 않는다. Vercel Analytics는
  컴포넌트 자체를 렌더링하지 않는다. 브라우저 설정에서 "추적 안 함(Do Not Track)"을
  켜고 새로고침하면 확인할 수 있다 (개발자 도구 콘솔에서
  `navigator.doNotTrack`로도 값 확인 가능).
- **쿠키를 안 쓴다.** `visitorId`/`visitCount`는 `localStorage`,
  `sessionId`는 `sessionStorage`, PostHog SDK persistence는 `localStorage`를
  쓴다. 사용자가 사이트 데이터를 지우면 전부 끊긴다.
- **체류 시간은 sendBeacon으로 나간다.** `application/json`으로 보내면
  CORS 프리플라이트에 걸려 조용히 유실되므로 `text/plain`으로 보낸다
  (API README·ADR-005 참고). 이 부분을 건드릴 때는 반드시 실제 페이지
  이탈(새 탭으로 이동, 탭 닫기)로 서버 로그에 `page_exit`가 찍히는지
  확인할 것 — devtools의 인위적인 이벤트 디스패치로는 재현되지 않을 수
  있다.
