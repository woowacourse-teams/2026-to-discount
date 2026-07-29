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

- `src/App.jsx` — 브랜드 카드 그리드, 브랜드별 상세 패널, 카테고리 필터, 멤버십 드로어, 고지 푸터
  - `CATEGORIES` — 필터 탭 목록(라벨). 브랜드별 분류·앱별 바로가기는
    여기 없다 — API가 `brand.category`/`brand.links`로 내려준다.
    **브랜드를 추가·수정하려면 delivery-discount-api의
    `src/main/resources/brands.yml`을 고친다**(프론트 재배포 불필요).
    새 카테고리를 만들 때만 이 배열에 탭을 추가하면 된다.
  - `SiteFooter` — 비영리·비제휴, 수집 방법, 면책, 상표 고지. 법적 성격을
    밝히는 자리라 임의로 축약하지 않는다.
- `src/api.js` — `API_BASE`(고정 백엔드 주소) + `/api/brands` 호출
- `src/analytics.js` — 방문 측정. `track(event, props)` + `startAnalytics()`
- `public/logos/` — 브랜드 로고 (파일명 = API가 내려주는 대표명, 규칙은 `public/logos/README.md` 참고)
- `public/platform-icons/` — 배민/쿠팡이츠/땡겨요/요기요 아이콘
- `public/links/` — 각 앱에서 공유 기능으로 받은 브랜드 바로가기 원본 메모

## 상세 패널

브랜드 카드를 펼치면 앱별 상세(할인금액/최소주문금액 목록, 조건, 판독 원문,
확인일)가 나온다. 펼치는 방법은 둘 — 카드 헤더 클릭, 금액 칩 클릭(바로가기
링크가 있는 칩은 링크가 우선이라 제외). 마우스가 있는 환경에서는 hover 시
"눌러서 펼치기" 안내만 뜨고 펼쳐지지는 않는다.

상세 값은 API가 내려주며 지금은 대부분 비어 있다. 비어 있으면 감추지 않고
"미확인"으로 표시한다 — 조건이 없는 것과 모르는 것은 다르기 때문이다.
채우는 계획은 tracker 레포의
`docs/plans/2026-07-29-offer-detail-collection.md`.

## 방문 측정 (analytics)

`src/analytics.js`가 경로·재방문·체류·행동을 API(`/api/events`)로만
보낸다. 외부 분석 도구는 안 쓴다 — 왜 자체 구현인지, 무엇을 수집하고
무엇을 안 하는지는 delivery-discount-api의
[ADR-005](../delivery-discount-api/docs/decisions/ADR-005-first-party-analytics.md).
수집 사실 자체는 `SiteFooter`에 고지돼 있다.

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
