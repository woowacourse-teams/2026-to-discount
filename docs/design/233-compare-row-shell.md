# 233: 홈 리뉴얼 시안 - 브랜드 비교표 (compare-row)

- 이슈: [#233](https://github.com/woowacourse-teams/2026-to-discount/issues/233) (묶음 이슈 #230)
- 상태: 설계 초안(승인 대기)
- 범위: `web/src/shells/compare-row/` 새 파일, `web/src/main.jsx` 한 줄
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 `preview/shell-compare-row` 프리뷰만 본다.

## 1. 목표와 개념

리뉴얼 목표(사용자 2026-11-03, 우선순위 순)는 신뢰성, 핵심 빠른 전달, 클릭 유도다. 이 시안의 개념은 하나다.

- 브랜드 한 줄에 앱별 금액을 나란히 둔다. 가장 큰 값을 색으로 강조한다.
- '같은 치킨, 어느 앱이 제일 싸나'를 표 하나로 답한다.
- 앱 칸을 누르면 그 앱의 링크가 열린다.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 홈 진입점 | `main.jsx`가 `<App initial={ssr} />`를 그린다. SSR 데이터(`window.__SSR__`)가 있으면 `hydrateRoot`, 없으면 `createRoot` | `web/src/main.jsx:97-131` |
| 브랜드 모양 | `brand.name`, `brand.category`, `brand.links`, `brand.offers[]`. 오퍼는 `platform`, `amount`, `minOrderAmount`, `qualifier`, `certainty`, `capturedAt`, `soldOut`, `tiers` | `filters.js`, `couponModel.js`, `CouponCard.jsx:56` |
| 링크 만드는 법 | `offerLink(offer, brand.links, brand.name)` | `CouponCard.jsx:56`, `OfferChip.jsx:45` |
| 쿠팡이츠 링크 | 공유 링크를 누르면 기본 이동을 막고 안내를 띄운 뒤 연다. 이 처리는 `openWithNotice(e, href)`가 한다 | `offerLink.js:106` |
| 허브 링크 | `setHubLinks(banners)`를 먼저 불러야 배너에서 얻는 허브 링크가 선다. `main.jsx`는 SSR 배너로 이 호출을 한다 | `main.jsx:96`, `offerLink.js:164` |
| 앱 4곳 | `PLATFORMS`가 `baemin`, `coupangeats`, `ddangyo`, `yogiyo` 순. 자사 채널(`own`)은 앱이 아니라 필터 밖 | `platforms.js` |
| 오퍼 고르기 | `splitOffers(offers, include)`가 최고(동점은 전부)와 나머지를 낸다. 최고 판정은 `displayBestAmount`, `comparable`로 서버 규칙과 같다 | `couponModel.js:18` |
| 카드 칩 | `chipsOf(offer).filter(onCard)`를 `headOrder`로 정렬하면 운영 카드와 같은 칩이 나온다 | `couponModel.js:129-153` |
| 확인 시각을 화면에 쓰는 곳 | **없다.** `latestCaptured`는 최신순 정렬에만 쓰인다 | `web/src` 전체 검색 |
| 문구 검사 | `check-copy.mjs`는 `src/*.jsx`만 읽는다. 하위 폴더의 `.jsx`는 지금 검사 밖이지만 규칙(`docs/COPY-STYLE.md`)은 그대로 적용된다 | `web/scripts/check-copy.mjs:9` |

## 3. 결정

### 3-1. 파일 (새 파일은 이 폴더 안에만)

| 파일 | 역할 |
| --- | --- |
| `web/src/shells/compare-row/CompareRowShell.jsx` | 화면. 데이터를 받아 표를 그린다 |
| `web/src/shells/compare-row/data.js` | 얇은 어댑터. 기존 모듈을 불러 표 모양으로 바꾼다 |
| `web/src/shells/compare-row/compare-row.css` | 이 시안의 CSS 전부. 클래스 접두사 `crow-` |

`main.jsx`의 한 줄: `<App initial={ssr} />`를 `<CompareRowShell initial={ssr} />`로 바꾸고 import를 더한다. 이 변경은 시안 브랜치에서만 있고 병합하지 않는다.

- `App.jsx`와 다른 컴포넌트는 지우지 않는다.
- `App.css`는 `main.jsx`가 그대로 불러온다. 새 화면은 `crow-` 클래스만 쓴다.
- 새 npm 의존성은 없다.
- `index.html`, SSR 서버(`api/ssr.js`)는 홈 HTML을 App 모양으로 그린다. 하이드레이션이 어긋나지 않도록 시안은 `hydrateRoot`를 쓰지 않고 `createRoot`로 그린다(3-6).

### 3-2. 어댑터 `data.js`: 기존 함수를 부르기만 한다

내보내는 함수 하나: `loadCompareRows()` → `{ rows, stamp, categories }`.

- `fetchBrands()`(+ `fetchBanners()`로 `setHubLinks`)로 받는다. 배너 호출이 실패해도 표는 그린다(허브 링크만 비게 된다).
- `applyFilters(brands, defaultFilters())`로 거른 뒤 정렬한다. 운영 홈과 같은 기본값(5천원 이상, 할인 큰 순, 신규 앞)이다. 필터와 정렬 규칙을 새로 쓰지 않는다.
- 카테고리 필터는 `CATEGORIES`를 그대로 쓴다. 고른 분류를 `filters.categories`에 넣어 `applyFilters`를 다시 부른다.
- 행: 브랜드 하나 `{ name, shortName, stamp, cells: [4칸] }`. 칸은 `PLATFORMS` 순서로 고정한다. 앱마다 칸 위치가 같아야 표로 읽힌다.
- 칸 하나 `{ platform, offer, amountText, min, chips, isTop, href }`.
  - 오퍼 고르기: 그 브랜드의 해당 앱 오퍼를 `splitOffers(…, include)`에 넣어 `best[0]`을 쓴다. `include`는 `includesFrom(defaultFilters())`.
  - 금액 글: `amountText(offer)`.
  - 최소주문: `minLabel(offer.minOrderAmount)`. 모르면 `null`이고 화면이 `최소주문 미확인`을 그린다(기존 라벨, `conditionTable`과 같다).
  - 칩: `chipsOf(offer).filter(onCard)`를 `headOrder`로 정렬. 첫 주문, 채널, 멤버십, 랜덤, 특정메뉴, 불확정이 여기에 들어 있다.
  - 강조 여부: `isTop = splitOffers 결과의 hasBest && best에 이 오퍼가 있음`. 동점이면 해당 칸 전부 강조한다. 서버 순서와 어긋나지 않는다.
  - 링크: `offerLink(offer, brand.links, brand.name)`. 모양이 비면 `href`는 `undefined`이고 칸은 눌리지 않는 글자로 그린다.
- 그 앱 오퍼가 없는 칸은 `offer: null`로 두고 화면이 `-`로 그린다. 없음과 모름을 둘 다 `-`로 그려도 되는지는 §7.
- 확인 시각 `stamp`: `latestCaptured(brand.offers)`(행), 전체는 행들의 `latestCaptured` 중 최댓값. 글자로 바꾸는 한 줄(`Intl.DateTimeFormat`, `Asia/Seoul`)만 어댑터에 둔다. 이 변환은 계산 로직이 아니라 표시 서식이다.

어댑터에 판정, 정렬, 금액 비교를 새로 쓰지 않는다. 그런 줄이 필요해지면 그 값은 기존 모듈에 이미 있는 것이다. 없으면 시안이 그 값을 보여주지 않는다.

### 3-3. 화면 (360px 기준)

위에서 아래로:

1. 머리 줄: 제목 한 줄과 전체 `stamp`. 첫 화면에서 값이 언제 것인지 먼저 읽힌다(목표 1).
2. 분류 칩 한 줄(가로 스크롤). `CATEGORIES`의 라벨 그대로.
3. 표 머리: 앱 네 칸의 아이콘. `PlatformBadge`(`logos.jsx`)를 쓴다. 한글 이름은 아이콘 아래 `PLATFORMS[].label`.
4. 브랜드 행(스크롤):
   - 폭 배분: 화면 360px, 좌우 여백 12px로 본문 336px. 브랜드 칸 약 80px, 앱 칸 네 개가 각 약 64px.
   - 브랜드 칸: `BrandLogo`(`logos.jsx`)와 `shortBrandName(brand)`. 그 행의 `stamp`를 작은 글씨로.
   - 앱 칸: 금액을 큰 글씨, 아래에 최소주문 한 줄, 그 아래 칩. 칸 전체가 링크다(누를 곳이 큼, 목표 3).
   - 최고 칸: 진한 배경색과 굵은 글씨. 색만으로 가르지 않는다. 굵기와 윤곽선을 함께 쓴다(색각 이상 대비).
   - 칩이 많으면 줄이 늘어난다. 칩은 줄이되(작은 글씨) 숨기지 않는다.
5. 표 아래 안내 줄 없음. 새 문구를 늘리지 않는다.

가로로 4칸이 360px에 들어가는지가 이 시안의 첫 위험이다. `15,000원`이 64px 칸에 12px 굵은 글씨로 들어가는지 구현 중에 먼저 확인한다. 안 들어가면 `원`을 작은 글씨로 내려 두 줄로 하지 않고 칸 폭을 줄여 브랜드 칸을 좁힌다(브랜드 칸 72px).

### 3-4. 클릭

- 칸은 `<a href={href} target=…>`다. 쿠팡이츠는 `openWithNotice(e, href)`를 `onClick`에 걸어 기존 안내와 같은 길로 연다. 이 처리를 빼면 쿠팡이츠 칸만 안내 없이 열린다.
- 분석 이벤트는 생략한다(이슈 허용). 그래서 프리뷰의 클릭 수는 `offer_link_click`에 안 쌓인다. 프리뷰는 `dev`로 찍혀 운영 집계에 안 섞이지만, 이 시안의 클릭률은 이 방식으로는 못 잰다. 한계로 둔다.
- `href`가 없는 칸은 링크가 아닌 `<div>`로 그린다. 빈 `href`로 페이지가 새로고침되지 않는다.

### 3-5. 문구

새 문구를 정하지 않는다(`docs/CHANGE-PROPAGATION.md` 6번). 쓰는 글은 아래뿐이다.

- 기존 모듈이 내는 글: 금액, `최소주문 미확인`, `최소주문 없음`, 칩 글, 분류 라벨, 앱 이름.
- 제목과 시각 서식은 §7에서 개발자에게 묻는다. 확인되기 전 시안에는 시각을 `MM.dd HH:mm` 숫자만 그리고 라벨은 두지 않는다.
- `확인`, `미확인`, `판독` 같은 수집기 말은 시각 라벨에 쓰지 않는다.

### 3-6. 하이드레이션

운영 홈은 서버가 App을 그린 HTML을 보낸다. 시안이 `CompareRowShell`로 바꾸면 서버 HTML과 트리가 달라 하이드레이션 경고와 깜박임이 난다.

- 시안은 `window.__SSR__`가 있어도 `hydrateRoot` 대신 `createRoot(rootEl).render(tree)`로 그린다. 서버가 그린 내용은 통째로 대체된다.
- 이를 위해 `main.jsx`의 변경은 한 줄이 아니라 "트리 한 줄과 분기 조건 한 줄"이 된다. 이슈의 "main.jsx 한 줄 제외"를 **두 군데로 넓혀야 하는지**는 §7에서 묻는다. 한 줄로 끝내려면 `if (ssr)`를 `if (false)`로 바꾼다.
- `setHubLinks`는 SSR 배너가 있을 때 `main.jsx`가 부른다. 시안은 `data.js`가 `fetchBanners()`로 받아 스스로 부른다.

## 4. 동반 변경 묶음(`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 해당 | 이번 작업에서 |
| --- | --- | --- |
| 1번 확실성 판정 | 읽기만 | `splitOffers`, `displayBestAmount`를 그대로 불러 최고 강조가 서버 정렬과 같다. 판정을 다시 쓰지 않으므로 판정표(`certainty-cases.json`)를 안 건드린다 |
| 2번 배너 모양 | 읽기만 | `fetchBanners`는 허브 링크용으로만 읽는다. 배너를 그리지 않는다 |
| 3~5번 | 해당 없음 | 묶음 배너, 최소주문 출처, 알림을 안 만진다 |
| 6번 화면 글자 | 해당 | §3-5. 새 문구를 정하지 않고 기존 모듈이 내는 글만 쓴다. 제목과 시각 라벨은 개발자 확인 전까지 비운다 |
| 7번 행동 이벤트 | 해당 | 이벤트를 쏘지 않는다. `ALLOWED_EVENTS`, `verify-analytics-event-contract.mjs`를 안 만진다 |
| 8번 배포 순서 | 해당 없음 | API 변경이 없다. 병합하지 않는 시안이라 배포되지 않는다. 프리뷰만 mono `preview/shell-compare-row`로 올린다 |
| 9번 새 파일 | 해당 | 아래 |

9번 새 파일:

- `docs/PROJECT-STRUCTURE.md`를 `python scripts/generate_project_structure.py`로 다시 만든다. 안 하면 푸시 훅이 막는다. 시안 브랜치에는 포함하되 병합하지 않으므로 되돌릴 일은 없다.
- `data.test.js`를 만들면 `run-node-tests.mjs`가 `src/**/*.test.js`를 전부 돈다(#221 설계 4번 표 확인). `package.json`은 고치지 않는다. 이 사실은 구현자가 `web/scripts/run-node-tests.mjs`를 열어 다시 본다.
- `.jsx`는 `check-copy.mjs`가 하위 폴더를 안 읽는다. 시안은 구현자가 `shells/compare-row/*.jsx`의 JSX 텍스트를 손으로 읽어 평서형 문장과 금지어가 없는지 본다. 검사를 넓히는 일은 시안 범위 밖이다(후속 조치 후보).

## 5. 시험

로직을 새로 짜지 않으므로 시험은 어댑터가 기존 규칙을 바꾸지 않았는지에 둔다.

### `web/src/shells/compare-row/data.test.js`(새 파일, `node --test`)

`fetch`를 가짜로 꽂고 `loadCompareRows()`를 부른다.

- 칸 순서가 항상 `PLATFORMS` 순서이고 네 칸이다(앱 오퍼가 없는 칸은 `offer: null`).
- 한 앱에 확정 오퍼와 랜덤 오퍼가 같이 있을 때 칸의 오퍼가 확정이다(`splitOffers.best` 규칙).
- 동점 최고이면 해당 칸이 둘 다 `isTop`이다.
- 확정이 하나도 없는 브랜드(랜덤, 특정메뉴, 불확정뿐)는 어느 칸도 `isTop`이 아니다. 특정메뉴 쿠폰이 4,999원처럼 큰 글씨로 서지 않는다.
- 자사(`own`) 오퍼는 칸에 들어가지 않는다.
- 쿠팡이츠 칸의 `href`는 `offerLink`의 결과와 같다.
- 확인 시각 서식이 `Asia/Seoul`로 나온다(UTC 입력 `2026-11-02T15:30:00Z` → `11.03 00:30`).
- 호출 순서가 입력 순서에 안 흔들린다: 같은 입력을 섞어 넣어도 행 순서가 `applyFilters` 결과와 같다.
- 어댑터 코드에 `sort(`, `Math.max`, `Math.min`이 없다(소스 문자열을 읽는 검사). 계산 로직 금지를 구조로 지킨다. 이 검사는 문구가 아니라 호출 이름을 본다.

### 전체

- `npm test`와 `npm run build`가 통과한다. 기존 시험은 그대로여야 한다. 바뀌면 시안이 로직 파일을 건드린 것이다.
- 범위 검사: `git diff --stat main -- web/src` 결과가 `web/src/shells/compare-row/*`와 `web/src/main.jsx` 말고는 없다. `web/src/*.js` diff 0줄.
- 검사 명령은 PR 본문에 출력 그대로 남긴다.

## 6. 프리뷰와 확인

- 구현이 끝나면 mono `preview/shell-compare-row` 브랜치로 push한다(사람 또는 sub 세션, `docs/WORKFLOW.md` §3-3). CI가 미러로 옮겨 프리뷰를 띄운다. 미러에 직접 push하지 않는다.
- 운영 API로 그린다: 프리뷰에서 `VITE_API_BASE_URL`이 운영 API를 가리키는지 `resolveApiBase`로 먼저 본다. 아니면 빈 표가 나온다.
- 360px 스크린샷 두 장: 첫 화면 위쪽과 한 브랜드 행 확대. 결과 댓글에 단다.
- 눈으로 볼 것:
  - 첫 화면에서 브랜드 행 3개 이상이 보이는가.
  - 최고 칸이 한눈에 보이는가(회색조로 바꿔도 구분되는가).
  - 쿠팡이츠 칸을 눌렀을 때 안내가 뜨고 앱이 열리는가. 나머지 앱 칸도 눌러 링크가 열리는가.
  - 첫 주문, 월 1회 같은 조건이 숨지 않았는가.

## 7. 개발자에게 묻는 것

- **제목과 시각 라벨 문구.** 화면에 확인 시각을 쓰는 곳이 지금 없다. 시안은 숫자만 둔다. 라벨 후보를 정해 주면 넣는다. `확인`은 수집기 말이라 피한다.
- **`main.jsx`를 두 군데 바꿔도 되는가.** 하이드레이션 어긋남을 피하려면 트리 한 줄과 `if (ssr)` 분기가 둘 다 바뀐다. 한 줄만 허용하면 SSR HTML과 시안이 어긋나 경고와 깜박임이 난다(3-6).
- **앱 오퍼가 없는 칸과 모르는 칸을 둘 다 `-`로 그려도 되는가.** 기존 데이터에는 그 둘을 가를 값이 없다.
- **자사 채널 오퍼를 이 시안에서 뺀다.** 표 칸이 배달앱 넷이라 둘 곳이 없다. 숨기는 셈이니 시안 평가 때 이 손실을 같이 본다.
- 확인하지 않은 것: 64px 칸에 `15,000원`과 칩이 들어가는지는 실제 렌더로 보지 않았다(3-3의 위험). 쿠팡이츠 안내 흐름이 표 칸의 `onClick`에서 카드와 똑같이 도는지, iOS 사파리 실기는 보지 않았다.

## 8. 끊기면 무엇이 보이나

- `setHubLinks`를 안 부르면 허브 링크에 기대는 앱 칸(오퍼 링크와 브랜드 링크가 둘 다 없는 경우)이 앱 홈으로만 열린다. 화면은 멀쩡하다.
- 쿠팡이츠 칸에 `openWithNotice`를 안 걸면 안내 없이 같은 탭으로 넘어간다. 시험은 `href`만 보므로 초록이다. 프리뷰에서 눌러 본다.
- `PLATFORMS` 순서를 어댑터가 따르지 않으면 앱 위치가 행마다 흔들려 표가 표로 안 읽힌다. 칸 순서 시험이 잡는다.
- 최고 강조를 `Math.max`로 새로 구하면 특정메뉴 쿠폰이 최고로 칠해진다(서버 정렬과 어긋난 사고, 1번 묶음). 소스 검사와 `isTop` 시험이 잡는다.
- 하이드레이션을 쓰면 서버 HTML과 달라 경고가 나고 깜박인다(3-6).

## 9. 구현 순서

1. `data.js`와 `data.test.js`. 기존 시험이 그대로인지 먼저 본다.
2. `CompareRowShell.jsx`와 `compare-row.css`. 360px에서 칸 폭부터 맞춘다.
3. `main.jsx` 변경(§7의 답에 따라).
4. `npm test`, `npm run build`, 범위 검사, 구조 문서 다시 만들기.
5. 프리뷰 push와 360px 스크린샷을 결과 댓글에.

## 10. 대안과 버린 이유

| 대안 | 버린 이유 |
| --- | --- |
| 칸마다 새 최고 계산 | 판정이 둘이 된다. 1번 묶음의 사고가 난 길이다. `splitOffers`를 부르기만 한다 |
| 앱 칸을 가로 스크롤 | 한눈에 비교가 안 된다. 이 시안의 개념과 어긋난다 |
| 금액을 `7천원`으로 줄여 쓰기 | 새 표기라 개발자 확인이 필요하다. 기존 `amountText`를 먼저 시험한다 |
| `App.jsx`에 `?home=` 분기 추가 | 로직 파일을 건드린다. 시안은 `main.jsx` 밖을 안 고친다 |
