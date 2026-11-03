# 232: 홈 리뉴얼 시안 - 앱별 탭 (app-tabs)

- 이슈: [#232](https://github.com/woowacourse-teams/2026-to-discount/issues/232) (묶음 이슈 #230)
- 성격: **버리는 시안(껍데기)**. 병합하지 않는다. PR은 초안으로 두고 프리뷰(`preview/shell-app-tabs`)만 본다.
- 분야: WEB. 서버, 수집기, 원장은 건드리지 않는다.

## 1. 문제와 목표

홈 리뉴얼 시안 여러 개를 빠르게 뽑아 프리뷰로 비교한다. 이 시안의 가설은 하나다.

> 사용자는 이미 깐 앱 기준으로 고른다. 상단에서 앱을 먼저 고르면 "그 앱에서 얼마를 받나"가 바로 보인다.

리뉴얼 목표(사용자 2026-11-03, 우선순위 순)와 이 시안의 대응:

| 순위 | 목표 | 이 시안에서 |
| --- | --- | --- |
| 1 | 값이 언제, 어디서 확인됐는지 믿을 수 있게 | 카드에 앱 이름과 마지막 확인 시각(`latestCaptured`)을 둔다 |
| 2 | 핵심(얼마, 어느 앱, 조건)을 빠르게 | 금액을 가장 크게, 그 아래 조건 칩과 최소주문 한 줄 |
| 3 | 누를 곳을 빨리 | 카드 전체와 오른쪽 "쿠폰 받기" 버튼이 같은 앱 링크를 연다 |

## 2. 선택한 구조

대안 둘을 비교했다.

| 안 | 내용 | 판단 |
| --- | --- | --- |
| A. 탭마다 기존 필터 `platforms`만 바꿔 `applyFilters` 호출 | 코드가 가장 적다 | 자사앱(`own`) 오퍼가 모든 탭에 통과한다(`applyFilters`가 `OWN`을 항상 통과시킴). 정렬에도 자사앱 금액이 섞인다 |
| B. 탭마다 오퍼를 그 앱 것만 남긴 브랜드 배열을 만든 뒤 `applyFilters` 호출 | 어댑터가 오퍼 배열만 자른다. 정렬, 5천원 거르기, 확정 판정은 기존 함수 그대로 | **선택** |

B를 고른 이유: "탭마다 그 앱의 최고 할인 순"은 그 앱 오퍼만으로 최고액을 재야 성립한다. 자르는 일은 모양 바꾸기이고, 순서와 판정은 `sortBrands`, `comparable`이 한다.

## 3. 파일

모두 새 파일이고 `web/src/shells/app-tabs/` 아래에만 둔다.

- `AppTabsShell.jsx`: 화면 한 개. 데이터 불러오기, 탭 상태, 카드 목록.
- `data.js`: 얇은 어댑터. 기존 모듈을 불러 껍데기용 모양으로 바꾼다. 계산 로직 금지.
- `app-tabs.css`: CSS 파일 하나. 클래스 접두어 `at-`로 기존 `App.css`와 겹치지 않게 한다.

기존 파일 변경은 `web/src/main.jsx` 한 줄뿐이다.

```
- <ErrorBoundary><App initial={ssr} /></ErrorBoundary>
+ <ErrorBoundary><AppTabsShell /></ErrorBoundary>
```

`import AppTabsShell from './shells/app-tabs/AppTabsShell.jsx'` 줄이 하나 더 필요하다. 이슈의 "한 줄 제외"는 이 교체와 그 import로 읽는다(**가정**, 완료 조건 diff 점검에서 둘을 함께 센다). `App.jsx`와 다른 컴포넌트는 지우지 않는다.

## 4. 데이터 흐름 (`data.js`)

| 필요한 값 | 읽는 곳 (고치지 않음) |
| --- | --- |
| 브랜드 목록, 배너 | `api.js`의 `fetchBrands`, `fetchBanners` |
| 허브 링크 등록 | `offerLink.js`의 `setHubLinks(banners)` (쿠팡이츠 외 앱의 마지막 링크 사다리) |
| 탭 목록 | `platforms.js`의 `PLATFORMS`. 이슈의 순서(전체/배민/쿠팡이츠/요기요/땡겨요)에 맞춰 키 순서 `baemin, coupangeats, yogiyo, ddangyo`를 어댑터에 고정 |
| 탭별 목록 | `filters.js`의 `defaultFilters`, `applyFilters`, `includesFrom` |
| 카드 금액 | `filters.js`의 `displayBestAmount`, `couponModel.js`의 `amountText` |
| 조건 칩, 최소주문 | `couponModel.js`의 `chipsOf`+`onCard`+`headOrder`, `qualifiersOf`, `minLabel` |
| 마지막 확인 시각 | `filters.js`의 `latestCaptured` |
| 링크 | `offerLink.js`의 `offerLink(offer, brand.links, brand.name)` |
| 오늘 인기 | `popularStrip.js`의 `popularToday` (선택, 5절) |

어댑터 함수 (이름은 구현자가 바꿔도 된다):

- `loadHome()`: `fetchBrands()`와 `fetchBanners()`를 함께 부르고 `setHubLinks(banners)` 호출. 배너가 실패해도 브랜드는 그린다(허브 링크만 비어 `PLATFORM_APP_LINKS`까지 내려간다).
- `tabBrands(brands, tab)`: `tab`이 `all`이면 `applyFilters(brands, defaultFilters())`. 앱 키면 각 브랜드의 `offers`를 `platform === tab`인 것만 남기고, 남은 오퍼가 없는 브랜드는 버린 뒤 `applyFilters(자른 목록, {...defaultFilters(), platforms: new Set([tab])})`.
- `cardOf(brand, tab)`: 화면용 객체 `{ name, brand, amount, offer, chips, minOrder, capturedAt, href }`로 바꾼다. `offer`는 그 탭에서 `displayBestAmount`와 같은 금액을 가진 오퍼(전체 탭은 앱 이름을 함께 보여 줌).

### 4-1. 기본 필터를 그대로 쓰는 것과 그 결과

`defaultFilters()`는 5천원 미만을 숨기고(`minAmount5k`), 랜덤과 특정메뉴 쿠폰을 최고 할인에 넣지 않는다. 시안은 운영 홈과 같은 기본값을 쓴다. 따라서 탭 안에 브랜드가 적게 나올 수 있다. 땡겨요 탭이 비면 빈 상태 문구가 필요한데, **새 문구는 세션이 정하지 않는다**(COPY-STYLE, `docs/CHANGE-PROPAGATION.md` 6번). 빈 탭은 문구 없이 그리거나(탭만 보이고 목록 없음), 기존에 쓰인 문구를 재사용한다. 어느 쪽으로 할지 개발자에게 묻는다(7절 질문 1).

## 5. 화면 (360px 기준)

위에서 아래로:

1. **머리**: 서비스 이름 한 줄. 아래에 "마지막 확인 N분 전" 한 줄(전체 브랜드의 `latestCaptured` 최댓값). 신뢰 목표(1순위)를 첫 화면에 드러내는 자리.
2. **앱 탭**: 가로 세그먼트 5칸(전체, 배민, 쿠팡이츠, 요기요, 땡겨요). 360px에 5칸이 들어가야 한다. 칸 폭은 `flex: 1`, 글자는 줄바꿈 없이 13px 안팎, 선택 칸은 채움색. 앱 아이콘은 `logos.jsx`의 `platformIconSrc`가 있으면 쓰되 넣지 못하면 글자만으로 충분하다.
3. **카드 목록**: 탭 선택에 따라 `tabBrands` 결과를 위에서부터. 한 카드는 한 줄 높이 두 줄 정도.
   - 왼쪽: `BrandLogo`(기존 컴포넌트, `logos.jsx`)와 브랜드 이름.
   - 가운데: 금액을 크게(`amountText`). 아래에 조건 칩(첫 주문, 포장/배달, 멤버십, 선착순 등. `chipsOf`에서 `onCard`인 것을 `headOrder`로 정렬)과 최소주문 한 줄(`minLabel`).
   - 오른쪽: "쿠폰 받기" 버튼. 카드 전체도 같은 링크다.
   - 맨 아래 작은 글씨: 앱 이름과 확인 시각(카드의 `capturedAt`).
4. 선택: 탭 목록 위에 "오늘 인기" 띠(`popularToday`). 3곳 미만이면 안 그린다(함수의 규칙). 시간이 없으면 뺀다.

### 5-1. 줄이되 숨기지 않을 것

이슈 규칙 "금액, 조건은 줄이되 숨기지 않는다"의 구체화:

- 최소주문이 없는 오퍼는 `minLabel`이 내는 기존 표기를 그대로 쓴다(`최소주문 미확인`을 지어내지 않음, CHANGE-PROPAGATION 4번).
- 칩이 넘치면 줄바꿈하지 않고 가로로 잘리게 두되, **금액과 최소주문은 어떤 폭에서도 잘리지 않는다**.
- 묶음 행사(`isBundle`)는 `amountText`가 원문(`1+1` 등)을 낸다. 금액으로 바꾸지 않는다.
- 품절(`soldOut`) 오퍼는 `displayBestAmount`가 제외한다. 품절만 남은 브랜드는 금액이 `null`이니 카드에 금액 칸을 비우고 칩만 둘지 목록에서 뺄지는 구현이 기존 `CouponCard.jsx`의 처리를 읽고 같게 맞춘다.

### 5-2. 클릭

- `offerLink(offer, brand.links, brand.name)`로 href를 만든다. 쿠팡이츠 링크에 대한 안내 오버레이가 필요하면 `openWithNotice(e, href)`를 `onClick`에 건다(기존 함수, `CouponCard.jsx`와 같은 사용). 쿠팡이츠를 이 함수 없이 열면 허브에서 브랜드를 눌러야 한다는 안내 없이 넘어간다.
- 분석 이벤트(`track`)는 생략한다. 새 이벤트 이름을 만들면 `EventController.ALLOWED_EVENTS`와 어긋나 조용히 버려지므로(CHANGE-PROPAGATION 7번) 아예 쏘지 않는다.

## 6. 어디까지 번지나 (CHANGE-PROPAGATION)

이 시안이 닿는 묶음을 점검했다.

| 묶음 | 닿나 | 이유 |
| --- | --- | --- |
| 1 확실성 판정 | 읽기만 | `applyFilters`, `displayBestAmount`를 그대로 불러 판정을 다시 쓰지 않는다. 어댑터에 `certainty` 분기를 쓰지 않는다 |
| 2, 3 배너 모양, 묶음 배너 | 읽기만 | 배너는 `setHubLinks` 입력으로만 쓰고 `EventBanner`는 그리지 않는다 |
| 4 최소주문 출처 | 읽기만 | 지어내지 않고 `minLabel`을 따른다 |
| 6 화면 글자 | **닿음** | 새 문구를 세션이 정하지 않는다. 쓰는 글자는 이미 쓰이는 라벨(`PLATFORMS.label`, `OWN_LABEL`)과 개발자가 확정한 것뿐. 머리의 "마지막 확인" 줄 문구는 7절 질문 2 |
| 7 행동 이벤트 | 안 닿음 | `track` 호출 0건 |
| 8 배포 순서 | 안 닿음 | 병합하지 않고 프리뷰만. API 변경 없음 |
| 9 새 파일 | **닿음** | 아래 |

9번 새 파일 점검:

- `docs/PROJECT-STRUCTURE.md`: 푸시 훅(`scripts/githooks`)이 막으면 `python scripts/generate_project_structure.py`로 다시 만들어 같이 커밋한다. 이 파일은 `web/src/shells/` 밖이라 이슈의 "shells 밖 변경 없음" 점검(`git diff --stat main -- web/src/*.js`)은 `web/src/*.js`만 보므로 영향 없다. 단 훅이 막으면 이 재생성은 필요하다.
- `web/src/*.test.js` 사슬: 새 `*.test.js`를 `shells/` 아래에 만들지 않는다(`web/package.json`의 `test`를 고쳐야 하고, 껍데기에 맞지 않는다). 대신 `data.js`는 계산이 없고 기존 함수 호출만이라 새 단위 테스트가 없다. **이 선택의 비용**: 어댑터 오류(예: 탭 자르기)는 테스트가 못 잡는다. 완료 조건을 실제 운영 API로 그린 스크린샷과 탭별 첫 카드 대조로 대신한다(아래 8절).
- 새 확장자는 `.jsx`, `.js`, `.css`뿐이고 Vite가 묶어 내보낸다. nginx `types`(`/ops/` 한정)는 닿지 않는다.

SSR 하이드레이션: `main.jsx`는 `window.__SSR__`가 있으면 `hydrateRoot`로 서버가 그린 `App` HTML에 새 트리를 붙인다. 시안이 `App`과 다른 트리를 내므로 **불일치 오류**가 날 수 있다(React가 클라이언트 렌더로 복구하고 `onRecoverableError`가 텔레메트리를 쏜다). 이 동작은 **미확인**이고 프리뷰에서 확인한다. 깜박이거나 서버 HTML이 남으면, 같은 위치의 `const ssr = window.__SSR__`를 `null`로 바꾸는 줄을 하나 더 쓰는 것을 허용하고 PR 본문에 적는다(`main.jsx` 변경이 한 줄에서 두 줄로 늘어남).

## 7. 개발자에게 묻는 것

1. 앱 탭에 보일 오퍼가 없을 때(예: 땡겨요) 빈 상태에 문구를 둘까, 기존 문구를 재사용할까, 빈 채로 둘까.
2. 머리의 확인 시각 줄에 쓸 문구. 임시로 "N분 전 확인" 꼴을 쓰고 확정 문구는 개발자가 정한다. 시안에서만 쓰고 병합 전 다시 정한다.
3. "쿠폰 받기" 버튼 글자. 기존 카드에서 이미 쓰는 글자가 있으면 그것을 재사용한다(구현이 `CouponCard.jsx`에서 찾아 복사). 없으면 "받기"만.

세 질문 모두 답이 없어도 시안은 진행한다. 임시 문구는 PR 본문 리뷰 포인트에 **굵게** 적는다.

## 8. 완료 확인

구현 세션(`web-implementer`)이 아래를 확인하고 결과 댓글에 단다.

| 확인 | 방법 |
| --- | --- |
| 기존 로직 파일 diff 0 | `git diff --stat main -- web/src/*.js`에 `shells/` 밖 변경 없음. `main.jsx`는 `.jsx`라 이 명령에 안 잡히므로 `git diff main -- web/src/main.jsx`를 따로 보고 import 한 줄과 교체 한 줄만인지 센다 |
| 기존 테스트, 빌드 | `npm test`, `npm run build` 통과 |
| 첫 화면에 개념 | 360px 스크린샷: 탭 5칸이 한 줄에 들어가고 선택 탭의 카드가 보임 |
| 실제 데이터 | 운영 API로 그려진 화면. 탭별 첫 카드가 해당 앱 오퍼의 최고 할인인지 눈으로 대조(예: 배민 탭 첫 카드 금액이 홈의 배민 오퍼 중 최고액과 같음) |
| 링크 | 카드를 눌러 앱 링크가 열림(쿠팡이츠는 안내 오버레이 뒤) |
| 부재 주장 | "빈 탭", "카드 0개"를 말하기 전에 같은 시각의 `/api/brands` 응답에서 해당 앱 오퍼가 있는지 먼저 센다(AGENTS.md 먼저 알 것 1번). API 오류로 못 받은 것과 정말 없는 것을 구분한다 |
| 프리뷰 | `preview/shell-app-tabs` push는 사람 또는 sub 세션이 한다(`docs/WORKFLOW.md` §3-3) |

## 9. 하지 않는 것

- 정렬, 판정, 링크 규칙을 어댑터에서 새로 짜기.
- 새 npm 의존성, 새 문구, 새 분석 이벤트.
- `App.jsx`, `filters.js` 등 기존 파일 수정.
- API 변경, 병합.
