# 282 홈 리뉴얼 시안: 요약판 + 오늘의 한 장 (digest-hero)

이슈: [#282](https://github.com/woowacourse-teams/2026-to-discount/issues/282). 묶음 이슈 [#230](https://github.com/woowacourse-teams/2026-to-discount/issues/230)의 시안 하나. 웹만 바꾼다. API 변경 없음. **버리는 시안이라 병합하지 않는다.** PR은 초안으로 두고 프리뷰만 본다.

## 결론

홈을 `<DigestHeroShell />` 하나로 바꾼 시안을 만든다. 위에서 아래로 세 덩어리다.

1. **요약 3칸**: 오늘 할인 수, 최고 금액, 새로 생긴 수.
2. **오늘 최고 할인 한 장**: 큰 카드 하나와 검은 큰 버튼(누르면 실제 앱 링크).
3. **목록**: 나머지 브랜드를 한 줄씩. 줄마다 앱별 금액, 조건, 최소주문, 확인 시각.

계산은 새로 짜지 않는다. 기존 모듈 함수를 부르고, 화면 모양으로 옮기는 얇은 어댑터(`data.js`) 하나만 둔다.

- 새 파일은 `web/src/shells/digest-hero/` 아래에만 둔다: `DigestHeroShell.jsx`, `data.js`, `digest-hero.css`.
- 바꾸는 기존 파일은 `web/src/main.jsx` 한 곳뿐이다(아래 "main.jsx").
- 새 npm 의존성 없음. CSS는 `digest-hero.css` 하나.

## 변경 전파 점검

[`docs/CHANGE-PROPAGATION.md`](../CHANGE-PROPAGATION.md)에서 이번 작업이 닿는 묶음은 다음과 같다. 병합하지 않는 시안이라 "나머지를 같이 고친다"는 필요 없고, 닿는 이유와 지키는 방법만 적는다.

| 묶음 | 닿는가 | 지키는 방법 |
|---|---|---|
| 1. 확실성 판정 | 읽기만 | 최고 후보 판정을 새로 짜지 않고 `filters.js`의 `applyFilters`, `displayBestAmount`, `couponModel.js`의 `splitOffers`를 그대로 부른다. 웹판 판정을 시안에서 복제하면 서버 정렬과 배지가 어긋난다 |
| 4. 최소주문 출처 | 읽기만 | 최소주문을 모르면 지어내지 않는다. `minLabel`이 null이면 기존 정식 라벨 "최소주문 미확인"을 그린다 |
| 6. 화면에 나가는 글자 | **닿음** | 새 문구는 아래 "문구" 표에 모은다. 수집기 말을 새로 만들지 않는다. 시안이라 세션이 정해도 된다는 결정이 이슈에 있다(2026-11-03) |
| 7. 행동 이벤트 | 안 닿음 | `track(...)`을 쏘지 않는다. 이슈가 분석 이벤트 생략을 허용했다. 이벤트를 쏘면 `ALLOWED_EVENTS` 대조가 걸린다 |
| 8. 배포 순서 | 안 닿음 | API 변경 없음. 병합하지 않음 |
| 9. 새 파일 | **닿음** | `docs/PROJECT-STRUCTURE.md` 재생성(커밋 전 `python scripts/generate_project_structure.py`). 새 `*.test.js`를 만들면 `web/package.json` `test` 명령에 넣는다(아래 "테스트") |

## 배경

홈 리뉴얼 목표(사용자 2026-11-03, 우선순위 순): 화면의 신뢰성, 핵심(얼마, 어느 앱, 조건)을 빠르게, 누를 곳을 빨리. 이 시안은 세 갈래 시안의 장점을 한 화면에 쌓아 본다.

- digest([#259](https://github.com/woowacourse-teams/2026-to-discount/issues/259)): 3칸 요약
- first-3s([#274](https://github.com/woowacourse-teams/2026-to-discount/issues/274)): 큰 카드 하나와 검은 큰 버튼
- trust-compact([#270](https://github.com/woowacourse-teams/2026-to-discount/issues/270)): 신뢰 정보가 붙은 촘촘한 목록

세 시안의 코드는 이 설계자 세션에서 읽지 않았다. 아래 화면 구성은 이슈 본문의 개념 설명만 근거로 한다. **같은 이름의 다른 브랜치가 있으면 구현자가 먼저 볼 것.**

## 화면 구성 (360px)

첫 화면(스크롤 전)에 요약 3칸과 큰 카드 한 장과 버튼이 보이고, 목록은 그 아래에서 시작한다.

```
┌──────────────────────────┐
│ 오늘 할인   최고    새로    │  ← 1. 요약 3칸
│   N곳     12,000원   M곳   │
├──────────────────────────┤
│ [로고] 브랜드명  [앱 칩]    │  ← 2. 오늘 최고 할인 카드
│ 12,000원 할인              │
│ 30,000원 이상 · 첫 주문      │
│ HH:MM 기준                 │
│ [■■■ 쿠폰 받으러 가기 ■■■]   │  ← 검은 큰 버튼
├──────────────────────────┤
│ 3. 목록 (줄마다)            │
│ [로고] 브랜드  최고 금액     │
│  배민 8,000 쿠팡 - 요기 ... │
│  최소주문 · 조건 칩 · 시각    │
└──────────────────────────┘
```

### 1. 요약 3칸

| 칸 | 값 | 어디서 |
|---|---|---|
| 오늘 할인 수 | 목록 브랜드 수 | `applyFilters`가 돌려준 배열 길이 |
| 최고 금액 | 맨 위 브랜드의 최고 금액 | `displayBestAmount(브랜드.offers, include)` |
| 새로 생긴 수 | 최고 오퍼가 신규인 브랜드 수 | `hasNewBest`를 걸러 센 개수 |

- "오늘 할인 수"의 단위는 **브랜드 수**다(오퍼 수가 아니다). 오퍼 수는 같은 브랜드의 앱별 오퍼를 겹쳐 세서 부풀려진다.
- 숫자가 0이면 칸을 비우지 않고 `0`을 그린다. 단, 데이터를 아직 못 받은 상태와 받았는데 0건인 상태는 다르다(아래 "상태").

### 2. 오늘 최고 할인 한 장

- 대상: 요약의 최고 금액을 낸 브랜드(목록 맨 위). 대표 오퍼는 `splitOffers(브랜드.offers, include).best[0]`.
- **금액**: `amountText(오퍼)`. 줄이되 숨기지 않는다.
- **조건**: 아래를 한 줄로 이어 그린다. 없는 것은 건너뛴다.
  - 최소주문: `minLabel(오퍼.minOrderAmount)`. null이면 "최소주문 미확인"(이슈 결정).
  - 칩: `chipsOf(오퍼)`에서 `scope === 'offer'`인 것(채널, 멤버십, 한정, 첫 주문 등). 순서는 `chipsOf`가 준 그대로.
  - 조건 문장: `qualifiersOf`가 칩으로 올린 것 말고 `오퍼.conditions`가 있고 칩과 겹치지 않으면 그대로 붙인다.
- **앱**: `PLATFORM_BY_KEY[오퍼.platform].label`.
- **버튼**: 검은 바탕 전체 폭 `<a href={offerLink(오퍼, 브랜드.links, 브랜드.name)}>`. 쿠팡이츠 링크는 `onClick`에서 `openWithNotice(e, href)`를 부른다(아래 "링크").
- **시각**: 이 브랜드 오퍼의 `latestCaptured(브랜드.offers)`를 `HH:mm 기준`으로 그린다(아래 "신뢰 정보").

### 3. 목록

- 큰 카드의 브랜드를 뺀 나머지를 `applyFilters`가 준 순서 그대로 그린다. 순서를 시안에서 다시 정하지 않는다.
- 줄 하나 = 브랜드 하나. 눌러 열리는 상세는 없다. 줄의 버튼이 대표 오퍼 링크를 연다.
- 줄에 담는 값:
  - 로고와 이름: 로고는 `logos.jsx`의 `BrandLogo`, 이름은 `shortBrandName(브랜드)`.
  - 최고 금액: 대표 오퍼의 `amountText`.
  - 앱별 금액 칸 4개(배민, 쿠팡이츠, 땡겨요, 요기요): `PLATFORMS` 순서 고정.
  - 조건 줄: 최소주문 라벨, 칩, 확인 시각.
- 목록 길이: 처음 10줄. 더 보기 버튼은 두지 않는다(시안). 나머지는 이슈 #230에서 비교할 때 필요하면 늘린다.

#### 앱별 금액 칸: 없음과 모름을 가른다

| 상황 | 그리는 것 | 판정 |
|---|---|---|
| 그 앱에 오퍼가 없다 | `-` | 브랜드 오퍼 중 `platform`이 같은 것이 0개 |
| 오퍼는 있는데 금액을 모른다 | 오퍼 `rawText`가 있으면 그것, 없으면 "금액 미확인" | `amountText(오퍼)`가 빈 문자열 |
| 오퍼는 있는데 견줄 수 없다(랜덤, 특정메뉴, 불확정) | 금액과 함께 그 칩(`badgesOf`가 준 `qualifier-*`) | 칩이 금액 바로 옆에 붙음 |
| 품절 | 금액에 "품절" | `오퍼.soldOut` |

- 앱 하나에 오퍼가 여럿이면(확정, 랜덤, 선착순이 따로 섬, `offerKey`) 그 앱 칸의 대표는 **`splitOffers`의 순서에서 가장 앞에 오는 그 앱 오퍼**다. 시안에서 금액을 다시 견주지 않는다.
- "금액 미확인"은 `couponModel.js` `conditionTable`이 쓰는 "금액 ?" 및 "최소주문 미확인"과 같은 계열이다. 수집기 말을 새로 만든 것은 아니지만 **표에 올려 둔다**(아래 "문구").

## 신뢰 정보 (목표 1)

화면이 내는 값이 언제 읽힌 것인지 보여준다.

- 큰 카드와 줄 모두 `latestCaptured(브랜드.offers)`를 쓴다. 이 함수는 `capturedAt` 문자열 중 가장 늦은 것을 돌려준다(없으면 null).
- 표기는 **절대 시각** `HH:mm`(한국 시각)이다. "n분 전" 같은 상대 시각은 쓰지 않는다. 서버가 그린 HTML과 브라우저가 첫 렌더에서 다른 값을 내서 하이드레이션 불일치가 난다(`App.jsx`가 시각, 화면 폭을 effect에서 읽는 이유와 같다).
- 한국 시각 변환은 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })` 하나를 `data.js`에 둔다. 서버(UTC)에서도 같은 결과가 나온다.
- 오늘이 아니면 날짜를 붙인다(`M/D HH:mm`). 판정은 변환한 한국 날짜 문자열이 오늘과 같은지 비교하는 것뿐이다. 오늘을 아는 시각은 **브라우저에서만** 쓰므로 첫 렌더에서는 날짜 비교 없이 `HH:mm`만 그리고, 마운트 뒤 effect에서 날짜를 붙인다.
- `capturedAt`이 null이면 시각 칸을 **비운다**(지어내지 않는다). 칸을 비우는 것과 "미확인" 문구를 적는 것이 부딪히면 기존 규칙(COPY-STYLE 1-5, 모르면 비운다)을 따른다. 최소주문만 이슈 결정으로 라벨을 그린다.
- 새벽(00~07시)은 수집이 돌기 전이라 값이 지난주 것일 수 있다. `App.jsx`의 새벽 안내(`isNight`)는 시안에 가져오지 않는다. 목표 1과 맞닿으므로 **묶음 #230에서 합칠 때 정할 후속 항목**으로 남긴다.

## 데이터 어댑터 `data.js`

### 규칙

- `import`만 한다: `api.js`, `filters.js`, `couponModel.js`, `offerLink.js`, `platforms.js`. `popularStrip.js`는 이 시안에서 쓰지 않는다(목록 순서는 `applyFilters`가 정하고, 인기 띠는 이 개념에 없다).
- 계산식, 정렬, 판정을 새로 쓰지 않는다. 시안 모양으로 **옮기는** 일만 한다: 이름 바꾸기, 배열 만들기, 문자열 서식, 없음/모름 구분.
- 전부 순수 함수다. DOM, localStorage, 현재 시각을 읽지 않는다.

### 함수 하나: `buildDigestHero(brands)`

```js
// 입력: fetchBrands()가 준 배열(또는 SSR initial.brands)
// 출력: { summary, hero, rows } 또는 { summary: null, hero: null, rows: [] }
export function buildDigestHero(brands) { ... }
```

1. `filters = { ...defaultFilters(), sorts: [{ key: 'amount', dir: 'desc' }, { key: 'minOrder', dir: 'asc' }] }`.
   - **정렬을 둘로 주는 이유**: `applyFilters`는 정렬이 기본값(`amount desc` 하나)과 정확히 같으면 신규 브랜드를 맨 위로 끌어올린다(`filters.js:378`). 큰 카드는 "최고 금액"이어야 해서 끌어올림을 피한다. 둘째 기준 `minOrder asc`는 같은 금액일 때 낮은 최소주문을 앞에 둔다.
   - **고려한 대안**: 정렬을 기본값으로 두고 결과에서 최고 금액을 직접 찾는 방법. 그러면 금액 견줌을 시안에서 다시 하게 돼 "로직을 새로 짜지 않는다"와 부딪혀 버렸다.
2. `list = applyFilters(brands, filters)`.
3. `include = includesFrom(filters)`.
4. `summary = { count: list.length, best: displayBestAmount(list[0].offers, include), fresh: list.filter((b) => hasNewBest(b.offers, include)).length }`.
5. `hero = row(list[0])`, `rows = list.slice(1, 11).map(row)`.
6. `row(brand)`가 돌려주는 모양:

```js
{
  name, shortName, logoName: brand.name,
  main: { amount, platformLabel, href, minText, chips, note },
  apps: [{ key, label, state: 'none' | 'unknown' | 'ok', amount, soldOut, chips }],   // PLATFORMS 순서 고정
  capturedAt,   // latestCaptured(brand.offers) 그대로(ISO 문자열 또는 null)
}
```

- `list`가 비면 `{ summary: null, hero: null, rows: [] }`을 돌려준다. `list[0].offers` 같은 접근이 터지지 않게 첫 줄에서 막는다.
- `displayBestAmount`가 null이면(대표 오퍼가 묶음 행사뿐이면 `splitOffers`가 묶음을 대표로 올린다) 금액은 `amountText(main 오퍼)`를 쓴다. 요약의 "최고 금액" 칸은 null일 때 `-`.
- `main`의 오퍼는 `splitOffers(brand.offers, include).best[0]`.
- 요약의 "최고 금액"은 hero 금액과 같은 값이다. 둘이 어긋나면 시안이 거짓말을 한다. 구현 테스트가 이 둘을 대조한다(아래 "테스트").

### 문구를 만드는 곳

문구는 `data.js`가 아니라 컴포넌트가 정한다. `data.js`는 키와 값(`state: 'none'`)만 낸다. 그래야 문구 한 곳 표(아래)와 코드 한 곳이 대응된다.

## 링크

- 큰 카드와 줄의 버튼 모두 `href = offerLink(오퍼, 브랜드.links, 브랜드.name)`.
- 기존 `CouponCard.jsx:56`과 같은 호출이다. 인자 순서를 바꾸지 않는다.
- 쿠팡이츠(`coupangeats://` 또는 `share.coupangeats.com`) 링크는 `onClick={(e) => openWithNotice(e, href)}`로 연다. 이 함수가 안내 화면과 앱 열기 폴백을 맡는다. 붙이지 않으면 기본 이동만 일어나 쿠팡이츠 허브에서 "쿠폰 받기"를 누르라는 안내가 사라진다(`offerLink.js:84-89`).
- `openWithNotice`는 내부에서 `track('link_fallback')`과 `watchAppOpen`을 부른다. 시안에서 `analytics.js`를 직접 import하지 않아도 이미 안에서 쓴다. 시안 자체는 이벤트를 새로 쏘지 않는다.
- `href`가 `undefined`일 수 있다(앱 링크 표에 없는 `own` 등). 그때 `<a>` 대신 `<span>`으로 그려 버튼을 비활성으로 둔다. `href` 없는 `<a>`는 눌러도 아무 일이 없어 "눌렀는데 안 열림"으로 보인다.
- `setHubLinks`는 `main.jsx`가 SSR 배너로 한 번 부른다. 시안이 `fetchBanners`를 다시 부르면 갱신된 허브 링크를 쓸 수 있으나, 요약, 큰 카드, 목록은 배너를 그리지 않는다. **배너 화면은 이 시안에 없다**(범위 밖). 허브 링크 갱신만을 위해 마운트 뒤 `fetchBanners().then(setHubLinks)` 한 번만 부른다(`App.jsx:280-283`과 같은 모양, 실패는 삼킨다).

## 상태

| 상태 | 그리는 것 |
|---|---|
| 아직 못 받음(`brands === null`, 오류 없음) | 요약 3칸과 큰 카드 자리를 같은 높이의 빈 틀(스켈레톤)로. 값 자리에 `0`을 쓰지 않는다 |
| 받았는데 0건(`list.length === 0`) | 요약 `0 / - / 0`과 "오늘 표시할 할인이 없어요" 한 줄(임시 문구) |
| 받기 실패 | 한 줄과 "다시 시도" 버튼. 버튼은 `fetchBrands`를 다시 부른다 |

- "못 받음"과 "0건"을 한 가지로 그리지 않는다. 둘 다 숫자 0으로 그리면 서버 장애가 "오늘 할인 없음"으로 읽힌다(AGENTS.md "먼저 알 것").

## main.jsx

이 브랜치에서만 아래를 바꾼다.

```diff
-import App from './App.jsx'
+import DigestHeroShell from './shells/digest-hero/DigestHeroShell.jsx'
 ...
-    <ErrorBoundary><App initial={ssr} /></ErrorBoundary>
+    <ErrorBoundary><DigestHeroShell initial={ssr} /></ErrorBoundary>
```

- `App.jsx`와 다른 컴포넌트는 지우지 않는다. import 한 줄과 JSX 한 줄만 바뀐다.
- `DigestHeroShell`이 받는 `initial`은 `App`과 같은 모양(`{ brands, banners }`)이다. `initial.brands`가 있으면 첫 렌더에 쓰고 다시 부르지 않는다. 없으면 마운트 뒤 `fetchBrands()`.
- 위 diff에서 `import`가 한 줄 더 바뀐다. 이슈의 "main.jsx 한 줄 제외" 기준은 "import와 JSX 쌍, 사실상 한 곳"으로 읽는다. **구현자는 `git diff --stat main`에서 main.jsx 외에 shells 밖 변경이 0줄인지만 본다.**
- 기존 `App.css`는 `main.jsx`가 계속 import한다. 시안 CSS는 `.dh-` 접두사로 클래스를 만들어 `App.css`와 이름이 겹치지 않게 한다.

### 하이드레이션 불일치

서버(`api/ssr.js`)는 지금 `App`을 그려 HTML을 보낸다. 시안은 다른 트리를 그리므로 하이드레이션에서 불일치가 난다.

1. 구현자는 프리뷰에서 먼저 확인한다. 불일치가 보이면(콘솔의 hydration 경고, 화면 깜박임) 아래로 간다.
2. 이슈 결정에 따라 `main.jsx`에서 `ssr`을 무시하는 한 줄을 더 바꾼다: `const ssr = null`(원래 줄은 주석으로 남김). 이때 `window.__SSR__`를 안 읽으므로 `setHubLinks(ssr.banners)`도 안 불리고 마운트 뒤 `fetchBanners().then(setHubLinks)`가 대신한다. 위 "링크"의 한 번 호출이 이 경우의 허브 링크 경로다.
3. 바꿨으면 PR 본문에 적는다.
4. `main.jsx`의 iOS `relayout` 코드는 `ssr`이 있을 때만 돈다. `ssr`을 무시하면 `createRoot` 경로를 타서 같이 빠진다. 시안 CSS가 `cqw` 컨테이너 단위를 쓰지 않으면 영향 없음. **시안에서는 `cqw`를 쓰지 않는다**(실기에서 iOS 겹침이 난 단위, `main.jsx:113-116`).

## 문구

시안용 임시 문구다. 병합하지 않으므로 세션이 정했다. 병합 후보가 되면 [`COPY-STYLE`](../COPY-STYLE.md) 3절대로 개발자에게 다시 묻는다. **이 표의 문구는 승인된 것이 아니다.**

| 자리 | 문구 | 근거 |
|---|---|---|
| 요약 칸 이름 | `오늘 할인`, `최고 금액`, `새로 생김` | 명사구. 수집기 말 없음 |
| 요약 단위 | `N곳`(할인, 새로) | 기존 화면의 "업데이트 N곳"에서 쓰는 단위 |
| 큰 카드 머리 | `오늘 최고 할인` | 이슈 개념 문구 |
| 큰 카드 시각 | `HH:mm 기준` | 값이 읽힌 때를 알리는 명사구 |
| 버튼 | `쿠폰 받으러 가기` | 이슈 목표 문구 |
| 앱에 오퍼 없음 | `-` | 이슈 결정 |
| 금액을 모름 | `금액 미확인` | `conditionTable`의 `'금액 ?'`와 `'최소주문 미확인'` 계열. **새로 만든 문구라 가장 먼저 검토** |
| 최소주문 모름 | `최소주문 미확인` | 기존 정식 라벨(`couponModel.js:176`), 이슈 결정 |
| 최소주문 0 | `최소주문 없음` | `minLabel`이 내는 기존 라벨 |
| 0건 | `오늘 표시할 할인이 없어요` | 임시 |
| 받기 실패 | `불러오지 못했어요`, `다시 시도` | 임시. 기존 실패 화면 문구가 있으면 그것을 따른다(구현자 확인) |

- 금지어(확인, 대조, 표기, 파서, 미확인, 관측, 수집, 판독, 추정, 실측, 정정) 중 **"미확인"**이 위 표에 두 번 있다. 둘 다 기존 코드가 이미 사용자 화면에 내는 정식 라벨(`couponModel.js:176`의 `'최소주문 미확인'`)과 그 계열이다. 이슈 결정이 "새로 만들지 않는다"에서 최소주문 라벨을 허용했으므로 **`금액 미확인`만 새 조합이다.** 그 자리는 구현자가 `금액 ?`(기존 `conditionTable` 표기)로 바꿔도 된다. 구현자는 둘 중 하나를 골라 PR 본문 "설계 변동"에 적는다.
- `web/scripts/check-copy.mjs`(npm test에 포함)는 JSX 글자에서 시각 뒤 `오픈` 없는 것을 잡는다. 시각을 JSX 글자로 직접 쓰지 않는다. `HH:mm 기준`은 값으로 만든 문자열이라 걸리지 않지만 **걸리는지 구현자가 `npm test`로 확인한다.**

## 테스트

기존 `npm test`와 `npm run build`가 통과해야 한다. 새 테스트 하나를 더한다.

### `web/src/shells/digest-hero/data.test.js`

- 경로가 `web/src/*.test.js`가 아니라 `web/src/shells/digest-hero/`이다. `web/package.json`의 `test` 명령은 파일을 하나씩 나열하는 방식이다(AGENTS.md: 안 넣으면 안 돈다). **`test` 사슬에 이 파일을 넣는다.** 넣을 때 기존 나열 방식과 맞춘다. 구현자는 `web/package.json`을 열어 모양을 먼저 본다.
- 이 파일은 `web/package.json`을 바꾸므로 "shells 밖 diff 0줄"과 부딪힌다. **이슈 완료 조건은 `web/src/*.js` 기준**(`git diff --stat main -- web/src/*.js`)이라 `package.json`은 걸리지 않는다. 그래도 PR 본문 "설계 변동"에 한 줄 적는다.
- 병합하지 않는 시안이므로 테스트는 어댑터의 함정만 박는다. 화면 렌더 테스트는 하지 않는다.

테스트 항목:

1. **요약과 큰 카드가 같은 값**: 브랜드 픽스처 3개로 `summary.best`가 `hero.main.amount`의 숫자와 같다.
2. **신규 브랜드가 큰 카드를 가로채지 않음**: 금액이 낮은 신규 브랜드와 금액이 높은 기존 브랜드를 주면 `hero`는 금액이 높은 쪽이다(정렬 둘로 주는 이유를 박는다).
3. **없음과 모름의 구분**: 한 앱에 오퍼가 없으면 `state: 'none'`, 오퍼가 있고 `amount`가 null이면 `state: 'unknown'`. 둘이 같은 값이 아니다.
4. **최소주문 null**: `minOrderAmount`가 null이면 `main.minText`가 `'최소주문 미확인'`이다. 0이면 `'최소주문 없음'`이다.
5. **빈 입력**: `[]`와 `null`에서 던지지 않고 `{ summary: null, hero: null, rows: [] }`.
6. **링크 보존**: 오퍼에 `link`가 있을 때 `main.href`가 `offerLink`의 결과와 같다(어댑터가 링크를 가공하지 않는다).
7. **앱 칸 순서**: `apps`의 `key` 순서가 `PLATFORMS`와 같다.
8. **시각**: `capturedAt` 문자열 `2026-11-03T01:05:00Z`가 `10:05`(한국 시각)로 나온다. null이면 빈 값.

## 완료 확인 (구현자용)

- 360px 스크린샷에서 첫 화면에 요약 3칸, 큰 카드, 검은 버튼이 보인다. 목록 첫 줄이 보이는지는 필수가 아니다.
- 실제 운영 API 데이터로 그려지고, 큰 카드 버튼과 줄 버튼이 앱 링크를 연다.
- `git diff --stat main -- web/src/*.js`에 `main.jsx` 말고 shells 밖 변경이 없다.
- `npm test`, `npm run build` 통과. `docs/PROJECT-STRUCTURE.md`를 다시 만들어 커밋한다.
- 프리뷰: `preview/shell-digest-hero` 브랜치를 사람 또는 sub 세션이 push한다(`docs/WORKFLOW.md` §3-3). 설계자와 구현자는 push하지 않는다.
- PR 본문 맨 위에 프리뷰 주소 `https://beggars-git-preview-shell-digest-hero-nn98s-projects.vercel.app`. PR은 초안으로 두고 병합하지 않는다.

## 열린 질문

**전부 확인하지 않은 가정이다.** 답이 없어도 시안은 아래 기본값으로 만든다.

1. `금액 미확인` 문구를 쓸지, 기존 `금액 ?`로 둘지. 기본값: `금액 미확인`.
2. 요약 "오늘 할인" 숫자의 범위가 기본 필터(5,000원 이상, 랜덤과 특정메뉴 제외)를 따르는 것이 맞는지. 기본값: 기본 필터를 따른다. 이 수가 기존 홈의 카드 수와 같아야 한다고 보지만 **기존 홈의 숨김 브랜드(`hiddenBrands`) 적용은 시안에 넣지 않는다.** 그래서 숨김을 쓰는 사용자에게는 기존 홈보다 브랜드가 더 보일 수 있다.
3. 새벽 안내(`isNight`)를 이 시안에 넣을지. 기본값: 넣지 않고 #230 합칠 때 정한다.
4. 앱별 금액 칸을 줄마다 4개 모두 그릴지, 오퍼가 있는 앱만 그릴지. 기본값: 4개 모두(없음 `-`를 보여야 이슈 결정의 "없음과 모름은 다르게"가 드러난다).
