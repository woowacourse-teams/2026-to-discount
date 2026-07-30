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

- `src/App.jsx` — 브랜드 카드 그리드, 브랜드별 상세 패널, 카테고리
  세그먼트 컨트롤, 멤버십 드롭다운, 고지 푸터
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
- `src/api.js` — `API_BASE`(고정 백엔드 주소) + `/api/brands` 호출
- `src/analytics.js` — 방문 측정. `track(event, props)` + `startAnalytics()`
- `src/ga4.js` — GA4 임시 도입(`startGa4()`). 이유·제거 조건은
  [ADR-002](docs/decisions/ADR-002-temporary-ga4-for-revisit-accuracy.md)
- `src/main.jsx` — `@vercel/analytics/react`의 `<Analytics />`도 여기서
  마운트(Vercel 대시보드용, 자체 `analytics.js`와는 별개)
- `public/main_logo.png` — 헤더 로고. "이번주 할인" 텍스트를 대체함
- `public/logos/` — 브랜드 로고 (파일명 = API가 내려주는 대표명, 규칙은 `public/logos/README.md` 참고)
- `public/platform-icons/` — 배민/쿠팡이츠/땡겨요/요기요 아이콘
- `public/links/` — 각 앱에서 공유 기능으로 받은 브랜드 바로가기 원본 메모

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

방문 측정은 세 가지다.

1. **`src/analytics.js`(자체)** — 경로·재방문·체류·행동을 API
   (`/api/events`)로만 보낸다. 자체 서버에만 기록하고 제3자에게
   안 넘긴다 — 왜 자체 구현인지, 무엇을 수집하고 무엇을 안 하는지는
   delivery-discount-api의
   [ADR-005](../delivery-discount-api/docs/decisions/ADR-005-first-party-analytics.md).
   재방문(`visitCount`)은 `localStorage` 기반이라 삭제·기기 변경에
   취약하다.
2. **`@vercel/analytics/react`(Vercel)** — `src/main.jsx`에서 `<Analytics />`
   마운트. 쿠키 없는 집계형 페이지뷰만 Vercel 대시보드로 간다. Next.js용
   `/next` 엔트리가 아니라 Vite에 맞는 `/react` 엔트리를 쓴다. 쿠키를
   안 쓰는 구조라 신규/재방문 구분 자체가 없다.
3. **`src/ga4.js`(GA4, 임시)** — 위 두 방식으로는 재방문을 정확히 못 재서
   임시로 병행 도입. 유일하게 쿠키(`_ga`)를 쓰고 데이터가 Google로
   전달된다. 광고 개인화·Google Signals는 꺼서 붙였다. 도입 배경·제거
   조건은 [ADR-002](docs/decisions/ADR-002-temporary-ga4-for-revisit-accuracy.md).

셋 다 쓴다는 사실은 `SiteFooter`에 고지돼 있다 — "외부 도구를 안 쓴다"는
더는 정확하지 않으니 이 문구를 다시 단순화하지 말 것. GA4는 쿠키를 쓰는
유일한 도구라 그 사실도 고지문에 그대로 남겨둔다.

### 사용법

앱 시작 시 한 번만 `startAnalytics()`를 부른다(`src/main.jsx`) — 이게
`page_view`를 찍고, 탭 가시성 변화·`pagehide`에 체류 시간 전송을 건다.
이 외의 행동 이벤트는 발생 지점에서 `track(event, props?)`를 직접
부른다.

```js
import { track } from './analytics.js'

// 지금 붙어 있는 지점들 (App.jsx)
track('category_change', { category: c.key })
track('brand_expand', { brand: brand.name, category: brand.category ?? 'none' })
track('offer_link_click', { brand: brandName, platform: offer.platform })
track('membership_open')
```

새 이벤트를 추가하려면:

1. API 쪽 화이트리스트에 이름을 추가한다
   (`EventController.ALLOWED_EVENTS`, delivery-discount-api) — 안 하면
   서버가 조용히 버려서 프론트만 고쳐서는 로그에 안 쌓인다.
2. 발생 지점에서 `track('새이벤트', { ...props })`를 호출한다. `props`는
   문자열 값의 얕은 객체만 — 서버가 문자열 120자·6개 초과분은 잘라낸다.
3. 접는 동작처럼 "관심 신호가 아닌" 액션은 굳이 안 남긴다 — 이벤트 수가
   신호 대 잡음비를 해친다.

### 개인정보 관련 동작

- **DNT/GPC를 존중한다.** `navigator.doNotTrack === '1'` 이거나
  `navigator.globalPrivacyControl === true`이면 `track()`도
  `startAnalytics()`도 아무것도 보내지 않는다. 브라우저 설정에서
  "추적 안 함(Do Not Track)"을 켜고 새로고침하면 확인할 수 있다
  (개발자 도구 콘솔에서 `navigator.doNotTrack`로도 값 확인 가능).
- **쿠키를 안 쓴다.** `visitorId`/`visitCount`는 `localStorage`,
  `sessionId`는 `sessionStorage` — 사용자가 사이트 데이터를 지우면
  전부 끊긴다.
- **체류 시간은 sendBeacon으로 나간다.** `application/json`으로 보내면
  CORS 프리플라이트에 걸려 조용히 유실되므로 `text/plain`으로 보낸다
  (API README·ADR-005 참고). 이 부분을 건드릴 때는 반드시 실제 페이지
  이탈(새 탭으로 이동, 탭 닫기)로 서버 로그에 `page_exit`가 찍히는지
  확인할 것 — devtools의 인위적인 이벤트 디스패치로는 재현되지 않을 수
  있다.
