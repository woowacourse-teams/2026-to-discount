# 234 홈 리뉴얼 시안: 큰 카드 피드 (feed)

- 이슈: #234 (묶음 이슈 #230)
- 성격: **버리는 시안(껍데기).** 병합하지 않는다. PR은 초안으로 두고 프리뷰(`preview/shell-feed`)만 본다.
- 영역: 웹 (`web/`). api, 수집기는 건드리지 않는다.

## 1. 목표와 개념

리뉴얼 목표(사용자 2026-11-03, 우선순위 순): 신뢰성 → 핵심(얼마, 어느 앱, 조건)을 빠르게 → 누를 곳을 빨리.

이 시안의 개념: 브랜드 로고와 큰 금액이 든 세로 피드 카드. 화면 아래에 고정된 '받으러 가기' 버튼(엄지 영역). 스크롤하며 고르는 탐색형.

## 2. 범위

| 하는 것 | 하지 않는 것 |
| --- | --- |
| `web/src/shells/feed/` 아래 새 파일 | `web/src/*.js`, `App.jsx`, 기존 컴포넌트 수정 또는 삭제 |
| `web/src/main.jsx` 한 곳(홈을 `<FeedShell />`로) | 새 npm 의존성 |
| CSS 파일 하나 (`shells/feed/feed.css`) | 로직 새로 짜기(정렬, 필터, 금액 계산) |
| 실제 앱 링크 열기 (`offerLink`) | 분석 이벤트(생략 가능) |

## 3. 파일

| 파일 | 역할 |
| --- | --- |
| `web/src/shells/feed/FeedShell.jsx` | 홈 한 화면. 데이터 불러오기, 피드, 하단 고정 버튼 |
| `web/src/shells/feed/FeedCard.jsx` | 카드 한 장 |
| `web/src/shells/feed/data.js` | 어댑터. 기존 모듈을 불러 카드용 모양으로 바꾼다 |
| `web/src/shells/feed/feed.css` | 이 시안의 스타일 전부 |

### 3-1. `data.js` (얇은 어댑터, 계산 금지)

기존 함수를 부르고 이름만 바꿔 담는다. 새 판정과 새 계산식을 넣지 않는다.

- 목록: `fetchBrands()`(`api.js`) → `applyFilters(brands, defaultFilters())`(`filters.js`). 정렬은 기본값(할인금액 높은 순, 신규 앞). `sortBrands`를 따로 부르지 않는다. `applyFilters`가 이미 부른다.
- 분류 칩: `CATEGORIES`. 고르면 `applyFilters`에 `categories`만 바꿔 넘긴다.
- 카드 한 장(브랜드 하나):
  - `name`, `category`: 브랜드 그대로.
  - `amount`: `displayBestAmount(offers, includesFrom(filters))`가 준 값에 `won` 표기. 없으면 대표 오퍼의 `amountText(offer)`.
  - 대표 오퍼: `splitOffers`가 아니라 `couponModel.js`에서 쓸 수 있는 것만 쓴다. 대표 하나는 `offers` 중 `amount`가 `displayBestAmount`와 같은 첫 오퍼로 고른다(동점이면 `minOrderAmount` 낮은 쪽). 이 선택 한 줄 외에 판정을 하지 않는다.
  - `app`: 대표 오퍼의 `platform`(`platforms.js`의 라벨, `PlatformBadge`).
  - `chips`: `chipsOf(offer)`에서 `onCard`인 것(채널, 멤버십, 한정, 첫 주문 등). 줄이되 숨기지 않는다.
  - `min`: `minLabel(offer.minOrderAmount)`. 값이 있으면 `원 이상`을 붙여 한 줄, `null`이면 줄을 그리지 않는다(문구 규칙: 모르면 비운다). `0`이면 `최소주문 없음`.
  - `qualifiers`: `qualifiersOf(offer)`.
  - `capturedAt`: 카드의 `latestCaptured(offers)`.
  - `href`: `offerLink(offer, brand.links, brand.name)`.
- 인기 띠는 만들지 않는다. 필요하면 `popularToday(brands)`를 그대로 읽어 상위 몇 개를 카드 위에 띄우는 정도까지만 허용한다(선택).

> 구현 시 확인할 것: 브랜드 객체의 링크 칸 이름이 `links`인지 `App.jsx`/`CouponCard.jsx`의 `offerLink` 호출부에서 먼저 본다. 이름을 추측해 쓰지 않는다.

### 3-2. 화면 (360px 기준)

위에서 아래로:

1. 머리줄: 서비스 이름, 데이터 기준 시각(§4 신뢰성).
2. 분류 가로 칩 한 줄(`CATEGORIES`, 가로 스크롤).
3. 피드 카드(세로 한 열).
4. 하단 고정 바: 지금 맨 위로 보이는 카드(또는 마지막으로 누른 카드)의 '받으러 가기' 버튼. 엄지 영역, 화면 폭 꽉 채움, `position: fixed; bottom: 0`, `env(safe-area-inset-bottom)` 여백.

카드 한 장:

- 위: 로고(`BrandLogo`), 브랜드 이름, 앱 배지.
- 가운데: **금액을 가장 크게**(예: 28~32px, 굵게). 그 옆이나 아래에 채널, 멤버십 칩.
- 아래: 조건 한 줄(최소주문, 첫 주문 등). 조건은 줄이되 숨기지 않는다. 칩이 넘치면 한 줄 말줄임이 아니라 두 줄까지 감싼다.
- 카드 전체가 링크다. 누르면 `offerLink` 주소를 연다(§5). 하단 버튼도 같은 주소다.

첫 화면(스크롤 전)에 로고 + 큰 금액 카드 한 장 이상과 하단 고정 버튼이 함께 보여야 한다. 이것이 개념이 드러나는 기준이다.

하단 버튼이 가리키는 카드: 단순함을 위해 **화면 가운데에 가장 가까운 카드**를 `IntersectionObserver`로 잡는다. 버튼에 그 브랜드 이름과 금액을 같이 적어("교촌치킨 8,000원 받으러 가기") 무엇을 여는지 보이게 한다. 관찰 실패(미지원)면 첫 카드로 둔다.

## 4. 신뢰성 (목표 1)

- 머리줄에 전체 카드의 `latestCaptured` 중 최신 시각을 `HH:MM 기준`으로 적는다(형식은 시안용).
- 카드마다 자기 `capturedAt`이 하루 이상 오래됐으면 시각을 카드에 작게 표시한다. 최신 카드는 표시하지 않는다(시끄럽다).
- `capturedAt`이 없으면 시각을 그리지 않는다. 지어내지 않는다(CHANGE-PROPAGATION 4번 원칙과 같다).
- 신규 표식은 `isUpdated`(`filters.js`)를 그대로 쓴다.

**문구는 개발자가 정한다** (CHANGE-PROPAGATION 6번, `docs/COPY-STYLE.md`). 수집기 말("확인", "미확인", "판독")은 쓰지 않는다. 위 `기준`, `받으러 가기`(이슈가 준 말)는 시안용 임시 문구이고 병합 대상이 아니라서 정식 문구 결정은 열린 질문으로 둔다.

## 5. 클릭과 링크

- `offerLink`가 `coupangeats://` 또는 쿠팡이츠 공유 링크를 주면 `openWithNotice(e, href)`(`offerLink.js`)로 연다. 안 하면 안내 없이 허브로 떨어진다(#141).
- 그 밖의 링크는 `<a href target="_blank" rel="noopener">`로 연다. 앱 링크 스킴(`baemin://`, `yogiyolink://`)은 `target`을 주지 않는다(새 탭이 about:blank만 띄운다, `offerLink.js` 주석). 판정은 `href`가 `https://`로 시작하는지 하나로 한다.
- 링크가 `undefined`면(`offerLink`가 사다리 끝까지 못 찾음) 카드를 링크로 그리지 않고 버튼을 비활성으로 둔다.
- 쿠팡이츠 허브 링크는 `setHubLinks(banners)`가 채운다. `fetchBanners()`를 한 번 불러 `setHubLinks`에 넘긴다(`App.jsx` 280행과 같은 순서). 실패는 삼킨다.
- 분석 `track(...)`은 생략한다. 이벤트 이름을 새로 만들지 않으므로 묶음 7(행동 이벤트)은 건드리지 않는다.

## 6. `main.jsx` 변경 (한 줄 규칙)

이슈는 "한 줄 제외"를 허용한다. 하지만 홈이 SSR로 먼저 그려진다는 점 때문에 `<App initial={ssr} />`만 바꿔서는 안 된다.

- 문제: `window.__SSR__`가 있으면 `hydrateRoot`가 서버가 그린 `App` HTML을 이어받으려 한다. `FeedShell` 트리는 다르므로 하이드레이션 불일치 오류가 난다.
- 처리: 이 브랜치 한정으로 `ssr`이 있어도 `createRoot`를 쓰게 하고, `<App initial={ssr} />` 자리를 `<FeedShell />`로 바꾼다. 서버가 그린 `App` HTML은 `createRoot().render`가 덮어쓴다(깜박임은 프리뷰에서 감수).
- 구현은 최소 diff로 한다: `const ssr = window.__SSR__` 다음에 이 브랜치용 한 줄(`FeedShell`일 때 `ssr`을 무시)과 `tree`의 한 줄. 이 둘 때문에 `main.jsx` diff는 2~3줄이 된다. 이슈의 "main.jsx 한 줄 제외"를 **세 줄 이내**로 읽는다(열린 질문 1).
- 같은 이유로 `setHubLinks(ssr.banners)`는 그대로 둔다(문제 없고 `FeedShell`이 `fetchBanners`로 다시 채운다).
- `import FeedShell from './shells/feed/FeedShell.jsx'`는 `App` import 옆에 한 줄 더한다.
- `App.css`는 `main.jsx`가 이미 불러온다. `feed.css`는 `FeedShell.jsx`가 불러온다. 전역 선택자(`body`, `.brand-logo` 등)를 덮어쓰지 않고 `.feed-` 접두사만 쓴다. `BrandLogo`가 쓰는 `.brand-logo` 스타일은 `App.css`에 있으므로 재사용한다.
- `markVariantOnRoot()`(A/B 변형 표식)는 그대로 돈다. 이 시안은 변형을 쓰지 않는다.

## 7. 변경 전파 점검 (`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 닿는가 | 이유 |
| --- | --- | --- |
| 1 확실성 | 읽기만 | `displayBestAmount`, `applyFilters`를 부를 뿐 판정을 복제하지 않는다. 금액 판정을 `data.js`에 새로 쓰면 이 묶음이 깨진다. 그래서 §3-1의 "계산 금지"를 못박았다 |
| 2 배너 모양, 3 묶음 배너 | 아니오 | `EventBanner`를 안 쓴다. 배너는 허브 링크용으로만 읽는다 |
| 4 최소주문 | 읽기만 | `minLabel`이 `null`이면 줄을 비운다. 지어내지 않는다 |
| 5 알림 | 아니오 | |
| 6 글자 | **예** | 새 화면 문구(`기준`, `받으러 가기`, 하단 버튼 문구). 시안이라 병합하지 않지만 문구 결정은 개발자 몫이다. 열린 질문 2 |
| 7 행동 이벤트 | 아니오 | `track`을 쓰지 않는다. 쓰게 되면 `ALLOWED_EVENTS` 대조가 필요하다 |
| 8 배포 순서 | 아니오 | api 변경 없음. 프리뷰 절차(`WORKFLOW.md` §3-3)를 따른다 |
| 9 새 파일 | **예** | 아래 §8 |

## 8. 새 파일 규칙 (묶음 9)

- `web/src/shells/feed/*.test.js`를 만들면 `web/package.json`의 `test`에 넣어야 한다. 이 시안은 어댑터가 얇아 테스트를 **기본으로는 만들지 않는다.** 만들면 `scripts/run-node-tests.mjs`가 그 경로를 줍는지 먼저 본다(줍지 않으면 test 명령에 직접 넣는다).
- `docs/PROJECT-STRUCTURE.md`를 다시 만든다(`python scripts/generate_project_structure.py`). 안 하면 push 훅이 막는다. 시안 PR이 병합되지 않아도 훅은 push 때 돈다.
- `node --test`는 `.jsx`를 못 읽는다(`logos.jsx` 주석). 테스트할 계산이 있으면 `data.js`(순수 JS)에 둔다. 그래서 `data.js`는 JSX를 쓰지 않는다.

## 9. 완료 조건과 검증

이슈 완료 조건 → 확인 수단:

1. **360px 첫 화면에 개념이 드러남.** 360px 스크린샷(로고, 큰 금액, 하단 고정 버튼이 한 화면). 스크린샷은 구현 세션이 결과 댓글에 단다.
2. **실제 운영 API 데이터, 카드를 누르면 앱 링크가 열림.** 프리뷰에서 카드 3종(배민, 요기요, 쿠팡이츠)을 눌러 주소 확인. 쿠팡이츠는 안내가 뜬 뒤 이동하는지.
3. **기존 로직 파일 diff 0줄.** `git diff --stat main -- web/src/*.js`에 shells 밖 변경 없음. `main.jsx` 외 변경이 있으면 실패.
4. `npm test`, `npm run build` 통과.

빈 상태와 실패 상태(관측 구분):

- 불러오는 중: 카드 모양 자리표시 3장. "없음"으로 읽히지 않게 한다.
- 실패: 오류 문구와 다시 시도 버튼(`App.jsx`의 실패 화면과 같은 동작). 실패를 빈 목록으로 그리지 않는다.
- 분류를 골라 0건: 빈 목록이라고 말하고 분류 해제 버튼.

구현 담당: `web-implementer`. 프리뷰 push(`preview/shell-feed`)는 사람 또는 sub 세션이 한다.

## 10. 열린 질문

1. `main.jsx`가 §6대로 2~3줄 바뀌는 것이 이슈의 "main.jsx 한 줄 제외"에 들어가는가. (아니면 SSR 하이드레이션 불일치를 감수해야 한다.)
2. 임시 문구(`기준`, 하단 버튼 문구)를 그대로 프리뷰에 써도 되는가. 정식 문구는 시안이 채택된 뒤 정한다.
3. 하단 버튼이 "화면 가운데 카드"를 따라 바뀌는 방식이 맞는가, 아니면 "대표 1곳 고정"인가. 이 설계는 따라가는 쪽으로 정했다.
4. 인기 띠(`popularToday`)를 이 시안에 넣을 것인가. 이 설계는 기본 제외, 선택 사항이다.
