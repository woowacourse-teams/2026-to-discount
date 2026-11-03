# 269 홈 리뉴얼 시안: 주문 금액별 앱 비교 (savings-compare)

이슈: [#269](https://github.com/woowacourse-teams/2026-to-discount/issues/269). 묶음 이슈 [#230](https://github.com/woowacourse-teams/2026-to-discount/issues/230)의 시안 하나. 웹만 바꾼다. API 변경 없음.

**이 문서는 버리는 시안(껍데기)의 설계다.** 병합하지 않는다. PR은 초안으로 두고 프리뷰만 본다.

## 결론

주문 금액을 고르면 브랜드 한 줄마다 앱 네 곳(배민, 쿠팡이츠, 요기요, 땡겨요)의 칸을 나란히 두고, **그 금액에서 실제로 받는 할인**을 칸에 적는다. 받는 칸 중 가장 큰 칸을 강조하고, 최소주문을 못 넘는 칸은 흐리게 두고 이유를 적는다.

- 새 파일은 `web/src/shells/savings-compare/` 아래에만 둔다: `SavingsCompareShell.jsx`, `data.js`, `data.test.js`, `savings-compare.css`.
- 바꾸는 기존 파일은 `web/src/main.jsx` 하나다(2곳, 아래 "main.jsx"). 로직 파일(`api.js`, `filters.js`, `couponModel.js`, `offerLink.js`, `popularStrip.js`)과 `App.jsx`는 고치지 않는다.
- `docs/PROJECT-STRUCTURE.md`는 커밋 전에 `python scripts/generate_project_structure.py`로 다시 만든다(새 파일이 생기므로).

## 변경 전파 점검 ([`CHANGE-PROPAGATION.md`](../CHANGE-PROPAGATION.md))

| 묶음 | 이번 변경이 닿는가 | 판단 |
| --- | --- | --- |
| 1 확실성 판정 | 읽기만 닿음. `filters.js`의 `comparable`, `displayBestAmount`를 부르고 판정을 다시 쓰지 않음 | 안 고쳐도 됨. 어댑터가 판정을 복제하면 이 묶음이 하나 늘어나므로 복제 금지 |
| 4 최소주문 출처 | `minOrderAmount`를 읽어 문턱으로 씀 | 지어내지 않음. 모르면(`null`) 비우지 않고 "최소주문 미확인"을 그림 |
| 6 화면에 나가는 글자 | 새 문구가 생김 | 시안용 임시 문구만 세션이 정함(이슈 결정). 수집기 말("확인", "미확인", "판독", "관측")은 새로 만들지 않음. 기존 정식 라벨 "최소주문 미확인"은 `couponModel.js`가 이미 내는 문구 |
| 7 행동 이벤트 | `track(...)` | 이번 시안은 쏘지 않음(이슈: 생략 가능). 대조 스크립트가 걸릴 일 없음 |
| 8 배포 순서 | 병합하지 않음 | 해당 없음. 프리뷰만 |
| 9 새 파일 | 파일 추가 | `web/scripts/run-node-tests.mjs`가 `src/` 아래 `*.test.js`를 재귀로 모두 돌려 `package.json`에 적을 필요 없음(2026-11-03 코드 확인). 구조 문서만 다시 만듦 |

## 데이터 읽는 길

화면은 운영 API 데이터로 그린다. 새 호출 경로를 만들지 않는다.

1. `fetchBrands()`, `fetchBanners()`(`api.js`)를 마운트 뒤 부른다. `window.__SSR__`이 있으면 그 `brands`, `banners`를 첫 값으로 쓴다(`App.jsx`와 같은 방식).
2. 배너를 받으면 `setHubLinks(banners)`(`offerLink.js`)를 부른다. 안 부르면 쿠팡이츠가 아닌 앱의 허브 폴백이 비어 링크가 앱 홈으로 떨어진다. `App.jsx:281`이 같은 일을 한다.
3. 필터와 정렬은 `defaultFilters()` → `applyFilters(brands, filters)`로 그대로 받는다(분류 칩은 `CATEGORIES`, `filters.categories`에 넣음). 기본 정렬은 `applyFilters`가 낸 순서를 쓴다. **주문 금액으로 다시 정렬하지 않는다**(정렬 규칙이 서버와 짝이라 어댑터가 새로 짜면 묶음 1이 늘어남).
4. 5천원 미만 거르기(`minAmount5k`)가 기본으로 켜져 있어 작은 할인 오퍼는 칸에서 빠진다. 이 시안은 기본 필터를 그대로 쓴다. 칸이 `-`로 보이는 경우 중 하나가 이것이므로 PR 본문에 적는다.

## 어댑터 `data.js`

`SavingsCompareShell`이 쓸 값을 기존 모듈에서 불러 껍데기용 모양으로 바꾸는 얇은 층이다. 순수 함수만 둔다(테스트하려고).

### 브랜드 한 줄의 모양

```js
// rowOf(brand, orderAmount) → 한 줄
{
  name,                 // brand.name
  category,             // brand.category (분류 칩이 씀)
  capturedAt,           // latestCaptured(brand.offers) — 줄 아래 "MM.DD HH:mm 기준"
  cells: [              // PLATFORMS 순서(배민, 쿠팡이츠, 땡겨요, 요기요)로 항상 네 칸
    { platform,         // 'baemin' | ...
      state,            // 'none' | 'blocked' | 'ok' | 'best' | 'unknown'
      offer,            // 대표 오퍼 또는 null
      amountText,       // amountText(offer)
      minText,          // 아래 "칸 문구"
      chips,            // chipsOf(offer) 중 채널/조건 칩 몇 개
      href,             // offerLink(offer, brand.links, brand.name)
    }, ...
  ],
}
```

### 칸의 대표 오퍼 고르기 (계산 로직을 새로 짜지 않는 방법)

한 앱에 오퍼가 여럿일 수 있다(확정, 랜덤, 선착순이 `offerKey`로 갈림). 대표는 `couponModel.js`의 `splitOffers(앱의 오퍼들, includesFrom(filters)).best[0]`을 쓴다. 최고가 없으면 `splitOffers`가 정한 맨 앞이 대표다. 어댑터가 정렬이나 우선순위를 따로 정하지 않는다.

- `splitOffers`는 이슈가 나열한 모듈 목록에 이름이 없지만 `couponModel.js`가 내보내는 함수라 같은 파일 안이다. 고치지 않고 부르기만 한다.
- 오퍼를 대표 하나로 줄이므로 구간(`tiers`)이 여럿인 오퍼는 대표 구간 금액만 칸에 선다(알려진 한계, 아래 리뷰 포인트).

### 칸의 상태 (없음과 모름을 다르게)

| state | 조건 | 그리는 것 |
| --- | --- | --- |
| `none` | 그 앱에 오퍼가 없음 | `-` 한 글자. 흐림 없음, 누를 수 없음 |
| `unknown` | 오퍼는 있으나 `minOrderAmount == null` | 금액 + 기존 라벨 "최소주문 미확인". 흐리지 않고 강조 후보에서도 뺌(문턱을 모르니 받는다고 말하지 못함) |
| `blocked` | `minOrderAmount > 주문 금액` | 금액을 흐리게, 이유 "최소주문 n원". 누르면 열림(링크는 그대로) |
| `ok` | `minOrderAmount <= 주문 금액` (`0`이면 항상) | 금액 + 조건 |
| `best` | `ok` 칸 중 `offer.amount`가 가장 큼. 동점은 모두 | `ok`와 같되 강조 |

- **이 판정이 이 시안에서 유일한 새 비교다.** 숫자 두 개를 견주는 것(`minOrderAmount <= orderAmount`, `ok` 칸끼리 `amount` 최댓값)이고, 어떤 오퍼가 견줄 수 있는지는 `splitOffers`와 `comparable`에 맡긴다. 이슈의 "계산 로직 금지"와 부딪히지만 개념("이 금액에서 실제로 받는 할인")이 이 비교 없이 서지 않는다. 비교는 `data.js`의 `cellState` 한 함수에 가두고 `data.test.js`가 박는다.
- 묶음 행사(`isBundle`, 금액 없는 1+1)와 `amount == null` 오퍼는 `best` 후보에서 뺀다. 칸에는 `amountText`가 내는 원문을 그린다.
- 품절(`soldOut`)과 `comparable`이 아닌 대표(불확정, 랜덤, 특정메뉴)는 `best` 후보에서 뺀다. 칸에는 `chipsOf`가 내는 칩("불확정" 등)과 함께 그린다. 후보 판정은 `comparable(offer, includesFrom(filters))`를 그대로 부른다.
- `best`가 하나도 없는 줄은 강조 칸 없이 그린다(`ok`만 있거나 전부 `blocked`).

### 칸 문구

| 자리 | 값 | 출처 |
| --- | --- | --- |
| 금액 | `amountText(offer)` | `couponModel.js` |
| 최소주문, 값 있음 | `최소주문 ${minLabel(m)}원`. `0`이면 `minLabel`이 내는 "최소주문 없음"을 그대로 | `minLabel`은 숫자 문자열만 낸다. "최소주문", "원"은 어댑터가 붙인다(시안 임시 문구) |
| 최소주문, 모름 | `최소주문 미확인` | 기존 정식 라벨. 새로 만들지 않음 |
| 첫 주문, 채널, 멤버십 | `chipsOf(offer)` 중 `kind`가 `condition`, `channel`, `membership`인 칩, 최대 2개 | 월 1회 같은 문구는 오퍼 `conditions` 문장이라 `chipsOf`가 못 올리면 칸에서 줄여 보이되 숨기지 않음(`note`는 접지 않고 한 줄 말줄임 대신 두 줄 허용) |

- `qualifiersOf`는 `chipsOf`가 이미 쓰므로 어댑터가 직접 부르지 않는다(이슈가 `qualifiersOf` 사용을 적었지만 `chipsOf` 안의 `condition` 칩이 같은 값이다).

### 신뢰 표시 (목표 1)

- 화면 위쪽에 전체 기준 시각 하나: `latestCaptured`를 모든 브랜드의 오퍼에 건 값. 문구는 "MM.DD HH:mm 기준".
- 브랜드 줄마다 그 브랜드의 `latestCaptured` 시각을 작게.
- 시각 문자열은 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ... })`로 만든다. **"n분 전" 같은 상대 시각은 쓰지 않는다**: 렌더 시점마다 값이 달라 하이드레이션과 스크린샷에서 흔들린다.
- `capturedAt`이 없으면 시각 칸을 그리지 않고 "시각 없음"도 쓰지 않는다(없는 말을 새로 만들지 않음).

## 화면 (360px)

위에서 아래로. 첫 화면(스크롤 전)에 개념이 다 보여야 한다.

1. **머리**: 제목 한 줄과 기준 시각. 배너·가이드는 안 그림.
2. **주문 금액 칩**: `10,000 / 15,000 / 20,000 / 25,000 / 30,000원` 가로 선택. 기본 `20,000원`(임시값). 텍스트 입력은 두지 않는다(모바일 키보드가 첫 화면을 가림).
3. **분류 칩**: `CATEGORIES`. 선택 없음이 전체.
4. **앱 헤더 줄**: 앱 네 개 아이콘(`PlatformBadge`)을 칸과 같은 가로 위치에 고정.
5. **브랜드 줄**: 왼쪽 위에 `BrandLogo`와 이름과 기준 시각, 그 아래 앱 네 칸. 강조 칸은 굵은 바탕과 "최고" 대신 글자 굵기와 테두리로(새 문구 회피).
6. **더 보기**: 처음 20줄, 버튼으로 20줄씩.

- 칸은 `grid-template-columns: repeat(4, 1fr)`. 360px에서 한 칸 약 80px라 금액(`18자 안`)과 최소주문 줄을 두 줄로 쌓는다. 이름은 `shortBrandName`(`couponModel.js`)으로 줄인다.
- 글자 크기와 칸 높이는 CSS 변수로 두고 스크린샷에서 조정한다. `cqw` 컨테이너 단위는 쓰지 않는다(`main.jsx`의 iOS 재배치 우회 대상이 되기 때문).
- 클릭: 칸 전체가 `<a href={href}>`. 웹 주소(`https`)는 `target="_blank"` `rel="noreferrer"`, 커스텀 스킴은 같은 탭(`CouponCard.jsx:56~63`과 같음). `onClick`에서 `openWithNotice(e, href)`(`offerLink.js`)를 부른다. 쿠팡이츠는 이 안내 없이 열면 허브에서 브랜드를 고르는 설명이 빠진다(묶음 8번의 쿠팡이츠 링크 규칙). `track`은 부르지 않는다.
- `none` 칸은 `<a>`가 아니라 `<span>`.
- 접근성: 칸마다 `aria-label`에 `브랜드 앱 금액 최소주문 상태`를 담는다. 흐린 칸은 색만이 아니라 글로도 이유가 보인다(최소주문 n원).

## main.jsx (기존 파일 변경, 이 브랜치 한정)

```jsx
import SavingsCompareShell from './shells/savings-compare/SavingsCompareShell.jsx'   // 추가
...
<ErrorBoundary><SavingsCompareShell initial={ssr} /></ErrorBoundary>                  // App → 교체
...
if (ssr && false) {  // 시안: 서버 HTML은 App 것이라 하이드레이션하지 않는다           // 1줄 변경
```

- 서버가 보내는 HTML(`api/ssr.js`)은 `App`을 그린 것이라 시안 트리와 구조가 다르다. 하이드레이션하면 불일치가 난다. 이슈는 "프리뷰에서 보이면" 바꾸라고 했지만 구조상 반드시 나므로 **처음부터 이 한 줄을 바꾼다.** `ssr`이 있어도 `createRoot`로 새로 그린다(`ssr.brands`, `ssr.banners`는 첫 데이터로 계속 씀). PR 본문에 적는다.
- `if (ssr && false)` 안의 iOS 재배치(`relayout`)도 같이 안 돈다. 시안은 `cqw`를 안 쓰므로 필요 없다.
- `App.jsx`와 다른 컴포넌트는 지우지 않는다. `import App`은 남겨 두되 쓰지 않으면 ESLint가 `no-unused-vars`로 막는지 구현자가 `npm run build`와 린트로 본다(막으면 `import` 줄만 지우지 말고 주석 처리한다. 다른 시안 브랜치와 합치기 쉽게).

## 테스트

`web/src/shells/savings-compare/data.test.js`(`node:test`). 결론은 테스트로 박는다.

- **상태 다섯**: 한 줄에 네 앱 오퍼를 섞어 `none`, `unknown`, `blocked`, `ok`, `best`가 각각 나오는지. 최소주문 `0`은 `ok`. 문턱과 주문 금액이 같으면 `ok`(경계).
- **동점**: `best` 두 칸이 같은 금액이면 둘 다 `best`.
- **없음과 모름**: 오퍼 없음은 `minText`가 없고, 모름은 "최소주문 미확인". 둘이 같은 문자열이 되면 실패.
- **후보 제외**: 품절, 불확정(`capped`), 랜덤, 묶음 행사는 `best`가 되지 않는다. `comparable`을 실제로 부르는지 보려고 `certainty` 값을 `filters.test.js` 픽스처에서 가져온다.
- **칸 순서**: `PLATFORMS` 순서로 항상 네 칸.
- **링크**: 칸의 `href`가 `offerLink`의 결과와 같다(쿠팡이츠 오퍼는 `COUPANGEATS_LINK` 폴백).
- **시각**: `capturedAt` → 한국 시각 문자열. 자정 경계(UTC 15:30 → 다음 날 00:30).

화면 확인(구현자):

1. `npm test`, `npm run build` 통과.
2. `git diff --stat main -- web/src/*.js`에 변경 0줄. `git diff --stat main -- web/src` 전체에서 `shells/` 밖 변경은 `main.jsx` 하나.
3. 360px 스크린샷: 첫 화면에 주문 금액 칩과 강조 칸이 보이는 것, `blocked`와 `unknown`과 `none` 세 칸이 한 장에 모두 보이는 것(보이는 줄이 없으면 주문 금액을 바꿔 한 장 더).
4. 실제 운영 API 데이터로 그린 것(주소 `VITE_API_BASE_URL`을 로컬에서 운영으로 지정). 칸을 눌러 앱 링크가 열린다(쿠팡이츠는 안내 뒤).
5. 하이드레이션 불일치 경고가 콘솔에 없다.

## 하지 않는 것

- 새 npm 의존성, 새 API 필드, 분석 이벤트, 필터 시트, 인기 띠(`popularToday`). 이슈가 `popularToday`를 읽기 목록에 넣었지만 이 시안의 개념(금액별 비교)에 쓰이지 않아 읽지 않는다. 필요하면 다른 시안에서 쓴다.
- 주문 금액 저장(`localStorage`). 새로고침하면 기본값으로 돌아온다.
- 병합, 운영 배포. 프리뷰 브랜치 `preview/shell-savings-compare`는 구현 뒤 사람이나 sub 세션이 올린다(`docs/WORKFLOW.md` §3-3).

## 리뷰 포인트

- **구간이 여럿인 오퍼는 대표 구간 하나로 칸을 정한다.** 예: 대표가 "30,000원↑ 7,000원"이고 "20,000원↑ 4,000원" 구간도 있을 때, 주문 금액 25,000원이면 칸은 `blocked`인데 실제로는 4,000원을 받는다. 이 시안은 이 한계를 받아들이는가? 받지 않으면 `conditionTable(offer).rows`로 구간별 판정을 하게 되어 어댑터가 커진다.
- **최소주문을 모르는 칸을 강조 후보에서 뺀다.** 목표 1(신뢰성)을 따른 것인데, 쿠팡이츠처럼 모르는 값이 많은 앱이 늘 비강조가 된다. 이 선택이 맞는가?
- 기본 주문 금액 `20,000원`과 칩 값은 임시다. 운영 데이터의 최소주문 분포로 정한 값이 아니다.
- `ssr`을 처음부터 무시하는 한 줄(`main.jsx`)은 이슈의 "보이면 바꿔도 됨"보다 앞선 판단이다. **구조상 불일치가 반드시 난다는 것은 코드 읽기로만 봤고 프리뷰에서 확인하지 않았다.**
