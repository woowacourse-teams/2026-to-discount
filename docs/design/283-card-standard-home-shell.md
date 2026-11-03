# 283 홈 리뉴얼 시안: 표준 카드 하나 (card-standard)

이슈: [#283](https://github.com/woowacourse-teams/2026-to-discount/issues/283). 묶음 이슈 #230의 시안 하나. 웹만 바꾼다. API 변경 없음.

**버리는 시안(껍데기)이다. 병합하지 않는다.** PR은 초안으로 두고 프리뷰만 본다. 이 문서는 구현자가 시안을 빠르게 뽑게 하는 것과, 최종 설계로 넘길 카드 기준안을 적는 것 두 가지가 목적이다.

## 결정

이슈 본문 "결정 (2026-11-03, 설계 점검 뒤)"와 "지킬 것"에 맞춘다.

- 새 파일은 `web/src/shells/card-standard/` 아래에만 만든다. 파일은 셋: `CardStandardShell.jsx`, `data.js`, `card-standard.css`.
- `data.js`가 기존 모듈을 불러 화면용 모양으로 바꾼다. 계산 규칙을 새로 짜지 않는다. 정렬, 필터, 최고 오퍼 선택, 칩, 링크는 전부 기존 함수의 결과를 그대로 쓴다.
- `web/src/main.jsx`는 홈 컴포넌트 한 줄만 바꾼다(`<App initial={ssr} />` → `<CardStandardShell />`). `App.jsx`와 다른 컴포넌트는 지우지 않는다.
- 새 npm 의존성 없음. CSS 파일은 `card-standard.css` 하나.
- 문구는 세션이 정해도 된다(병합하지 않는 시안). 수집기 말("확인", "미확인", "판독", "관측")을 새로 만들지 않는다. 이미 있는 정식 라벨 "최소주문 미확인", "금액 ?"은 그대로 쓴다.
- 없음과 모름을 다르게 그린다. 그 앱에 오퍼가 없으면 `-`, 값을 모르면 기존 라벨.

## 화면

홈은 카드의 세로 목록이다. 상단 제목 한 줄과 분류 칩 한 줄(가로 스크롤) 아래에 카드가 이어진다. 360px 첫 화면에서 카드 한 장이 통째로 보이는 것이 기준이다.

카드 한 장의 위에서 아래 순서(순서가 뜻이다. 목표 1 신뢰, 2 핵심 전달, 3 누를 곳):

| 줄 | 내용 | 데이터 출처 |
| --- | --- | --- |
| 1. 머리 | 브랜드 로고(40px), 브랜드 이름, 오른쪽에 "오늘 인기 N위"(있을 때만) | `BrandLogo`(`logos.jsx`), `brand.name`, `popularToday` |
| 2. 금액 | 큰 금액(굵게, 대표 오퍼) + 오른쪽에 어느 앱인지(앱 아이콘과 이름) | `splitOffers().best[0]`, `amountText`, `PLATFORM_BY_KEY` |
| 3. 조건 칩 | 쿠팡와우, 11시 오픈, 첫 주문, 포장/배달 등. 줄이 넘치면 줄바꿈하고 자르지 않는다 | `headOrder(chipsOf(o).filter(onCard))` |
| 4. 최소주문 | `최소주문 15,000원↑`. 0이면 `최소주문 없음`. 모르면 `최소주문 미확인` | `minLabel` |
| 5. 앱 4칸 | 배민, 쿠팡이츠, 땡겨요, 요기요 순서로 칸 넷. 칸마다 앱 약칭과 그 앱 대표 금액. 대표 앱 칸은 강조 | `PLATFORMS`, 앱별 `splitOffers` |
| 6. 신뢰 줄 | `오늘 14:20 기준` + 확정 배지(대표가 확정일 때만) | `latestCaptured`, `certaintyOf` |
| 7. 버튼 | 받으러 가기. 폭 전체, 높이 44px 이상 | `offerLink` |

### 줄별 규칙

**대표 오퍼(2, 3, 4줄).** `splitOffers(brand.offers, include)`의 `best[0]`이 대표다. `include`는 `includesFrom(filters)`. `hasBest`가 거짓(확정 금액이 없는 브랜드)이면 `best[0]`은 "순서 맨 앞"이라 확정 값이 아니다. 이때 3줄 칩에 기존 칩이 `불확정`, `랜덤`, `특정메뉴`를 단다. 새 규칙을 만들지 않고 칩이 말하게 둔다. 6줄 확정 배지는 안 단다.

**금액(2줄).** `amountText(o)`가 문자열을 낸다. 품절이면 취소선과 "품절"을 단다(`CouponCard`의 `Amt`와 같은 모양). 묶음 행사(1+1)는 `amountText`가 원문을 주므로 그대로 그린다. 금액도 원문도 비어 있으면 `금액 ?`(`conditionTable`의 기존 라벨).

**조건 칩(3줄).** `chipsOf`는 상세용 칩(`note`, `until`)까지 섞어 주므로 `onCard`로 거른다. `CouponCard`의 `Tags`와 같은 거름이다. 순서는 `headOrder`. 금액이나 조건을 줄이되 숨기지 않는다는 이슈 규칙 때문에 칩이 많아도 `+N`으로 접지 않고 줄바꿈한다.

**최소주문(4줄).** `minLabel(m)`이 `null`이면 `최소주문 미확인`을 직접 쓴다(`couponModel.js` 176행의 같은 문자열). 0이면 `minLabel(0)`이 준 `최소주문 없음`을 그대로 쓰고 "원"을 붙이지 않는다. 0보다 크면 `최소주문 ${minLabel(m)}원↑`. `CouponCard`의 `Min`이 같은 갈래로 가른다. `null`을 빈 칸으로 두지 않는 것이 `Min`과 다른 점이고 이번 시안의 결정이다.

**앱 4칸(5줄).** 칸 순서는 `PLATFORMS` 배열 순서. 칸마다 `brand.offers`에서 그 앱 오퍼만 골라 `splitOffers(그 오퍼들, include).best[0]`로 대표를 구한다.
- 그 앱 오퍼가 없다: `-`.
- 있는데 금액을 모른다: `금액 ?`.
- 대표 앱 칸(2줄과 같은 오퍼): 강조색과 굵게.
- 자사(`own`) 오퍼는 칸에 없다. 4칸은 배달앱만이다. 대표가 `own`이면 어느 칸도 강조하지 않는다.
- 칸은 누르는 곳이 아니다. 누를 곳은 7줄 버튼 하나다.

**신뢰 줄(6줄).** `latestCaptured(brand.offers)`는 ISO 문자열이나 `null`이다.
- 형태: 오늘이면 `오늘 14:20 기준`, 어제면 `어제 14:20 기준`, 그 전이면 `11/01 14:20 기준`. 한국 시각(`Asia/Seoul`)으로 센다.
- `null`이면 줄 전체를 그리지 않는 대신 `시각 ?`를 그린다. 없음을 빈 칸으로 두면 "방금 맞춘 값"으로 읽힌다(AGENTS.md 먼저 알 것 1번).
- 오늘이 아닌 값은 글자색을 낮춰 눈에 띄지 않게 하지 않는다. 오히려 날짜가 보이게 둔다. 신뢰성(목표 1)이 이 줄의 일이다.
- 시각 포맷은 `data.js`의 작은 함수 하나다. `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ... })`로 조각을 얻고 날짜 비교만 한다. 조건 분기를 늘리지 않는다.
- 확정 배지: `certaintyOf(대표) === 'exact'`일 때만 `확정`. 배지가 없는 카드는 칩(불확정 등)이 이미 값의 성격을 말한다.
- "기준"은 `check-copy.mjs`의 금지 목록(`표기`, `관측` 등)에 없다. "확인"은 쓰지 않는다.

**버튼(7줄).** `<a>` 하나. `href`는 `offerLink(대표, brand.links, brand.name)`.
- `CouponCard`의 `OfferLinkA`와 같게: 웹 주소(`http`)면 `target="_blank" rel="noreferrer"`, 커스텀 스킴(`coupangeats://`, `ddangyo://`, `baemin://`)이면 같은 탭.
- `onClick`은 `openWithNotice(e, href)`를 부른다. 쿠팡이츠 안내 토스트가 이 함수에 있다. 빼면 쿠팡이츠를 누른 사람이 안내 없이 허브로 간다(`offerLink.js` 102행 주석). `offerPrompt`는 켜지 않는다.
- 분석 이벤트(`track`)는 생략한다. 이슈가 허용했다.
- 카드를 누르면 열려야 한다(완료 조건 2). 앵커를 카드 전체에 씌우지 않고(링크 안에 칩이 들어가게 됨), 버튼 `<a>`의 `::after`를 카드 크기로 펼친다(stretched link). 카드가 `position: relative`, 버튼 `::after`가 `position: absolute; inset: 0`. 앵커는 카드당 하나라 접근성 트리에 중복이 없다.
- `aria-label`: `${brand.name} ${amountText(대표)}, 앱으로 이동`(`OfferLinkA`와 같은 문장).
- 버튼 글자는 `받으러 가기`. 이슈의 개념 이름이다.

### 목록

`applyFilters(brands, defaultFilters())`의 결과를 그대로 그린다. 운영 홈의 기본 상태(5천원 미만 제외, 할인금액 높은 순, 신규 앞)와 같은 목록이다. 사용자가 분류 칩을 누르면 `categories` 집합만 바꿔 같은 함수를 다시 부른다. 새 정렬이나 새 거름을 `data.js`에 두지 않는다. 숨긴 브랜드(`hiddenBrands`)는 이번 시안에서 다루지 않는다.

- `visibleCategories(brands, selected)`로 분류 칩 목록을 만든다(오퍼 5개 이하 분류 숨김 규칙이 이미 있다). 라벨은 `CATEGORIES`의 것.
- "오늘 인기": `popularToday(list)`가 5개 이하를 낸다. `STRIP_MIN`(3) 미만이면 그리지 않는다(`popularStrip.js` 머리 주석의 규칙). 3개 이상이면 `이름 → 순위` 맵을 만들어 1줄 오른쪽에 `오늘 인기 N위`를 단다. 이 입력은 분류 칩을 뺀 목록이어야 하므로 기본 필터로 만든 목록(`categories` 빈 집합)을 쓴다. 분류를 골라도 순위가 바뀌지 않는다(#147 규칙).

## `data.js`

얇은 어댑터다. 계산 로직을 두지 않는다. 내보내는 것:

- `loadHome()`: `fetchBrands()`와 `fetchBanners()`를 부른다. 배너는 실패해도 `[]`로 삼킨다(`App.jsx` 273~283행과 같은 정책). 배너가 오면 `setHubLinks(banners)`를 부른다. 지금 `setHubLinks`가 쓰는 마커는 쿠팡이츠뿐이고 `coupangeatsLink()`가 허브 맵을 읽지 않아 링크 결과가 달라지지 않는다. 그래도 운영과 같은 호출 순서를 지켜 두는 값싼 보험이다.
- `toCards(brands, { categories })`: 위 목록 규칙으로 카드 모델 배열을 만든다. 카드 모델은 `{ name, brand, top, cells[4], chips, minText, capturedText, confirmed, href, popularRank }`. 안에서 `applyFilters`, `splitOffers`, `chipsOf`, `onCard`, `headOrder`, `minLabel`, `amountText`, `latestCaptured`, `certaintyOf`, `offerLink`, `popularToday`를 부르고 모양만 바꾼다.
- `capturedText(iso, now)`: 신뢰 줄 문자열. 이 파일에서 유일하게 "계산"에 가까운 부분이다. 단위 시험은 두지 않는다(병합하지 않는 시안). 대신 아래 "확인"에서 실제 값으로 본다.

`href`는 렌더 때마다 `offerLink`를 다시 불러 얻는다. `setHubLinks`가 배너 도착 뒤에 바뀔 수 있으므로 `toCards` 결과를 `brands`와 `banners` 둘 다 의존하는 `useMemo`에 둔다.

## `CardStandardShell.jsx`

- 마운트 때 `loadHome()`. 받는 동안 카드 모양 회색 자리 세 장. 실패하면 "다시 시도" 버튼 하나(`reloadKey`를 올림, `App.jsx` 260~271행과 같은 방식).
- 서버 렌더 데이터(`window.__SSR__`)는 쓰지 않는다. `initial` 속성은 만들지 않는다.
- 클라이언트에서만 시각을 읽으므로 하이드레이션 불일치 걱정은 `main.jsx` 쪽 문제다(아래).
- `./card-standard.css`를 이 파일에서 가져온다. 운영 `App.jsx`의 `import('./styles/coupon-card.css')`는 가져오지 않는다.

## `main.jsx` 변경

- `import App from './App.jsx'`는 둔다(이슈: 기존 컴포넌트를 지우지 않는다). 바꾸는 줄은 `<ErrorBoundary><App initial={ssr} /></ErrorBoundary>`의 `<App initial={ssr} />` → `<CardStandardShell />` 하나다. 이 컴포넌트를 쓰려면 import 한 줄(`./shells/card-standard/CardStandardShell.jsx`)이 늘어난다. 정적 import로 쓴다. diff는 두 줄이지만 같은 한 가지 변경이고, 이슈의 "main.jsx 한 줄" 허용 범위로 읽는다. 어긋난다고 보면 리뷰 포인트로 올린다.
- `App`이 안 쓰이게 되어 린트가 경고하면 `import App`은 그대로 두고 경고만 PR 본문에 적는다(이 저장소에 린트 단계가 없음. 있으면 구현자가 확인).
- **하이드레이션 불일치.** 서버(`api/ssr.js`)가 `App`으로 그린 HTML이 `#root`에 들어 있고, 그 위에 `hydrateRoot`로 셸을 얹으면 구조가 달라 React가 복구 오류를 낸다. 프리뷰에서 콘솔 오류나 깜박임이 보이면 `if (ssr) { hydrateRoot... }` 분기를 건너뛰게 한 줄 더 바꾼다(결정에서 허용: `ssr`을 무시). 예: `const ssr = window.__SSR__` 아래에서 하이드레이션 조건만 `if (ssr && false)`로 막고 `createRoot`로 가게 한다. 이때 PR 본문에 적는다.
- 프리뷰 주소가 SSR을 타는지는 구현자가 프리뷰에서 본다. 타지 않으면 위 변경은 필요 없다.
- 그 밖에 `setHubLinks(ssr.banners)`, 분석 시작, 오류 보고 등 `main.jsx`의 나머지는 건드리지 않는다.

## CSS (`card-standard.css`)

- 클래스는 전부 `cs-` 접두사. 운영 CSS와 이름이 겹치지 않게 한다.
- `.brand-logo`와 `.platform-badge`의 모양은 운영 `brand-card.css`가 정한다. `main.jsx`가 `App.css`를 가져오므로 셸에서도 적용될 것으로 보이나, 구현자가 360px 스크린샷으로 로고와 앱 아이콘이 깨지지 않는지 본다. 깨지면 `.cs-card .brand-logo { ... }`처럼 접두사 아래에서 크기를 고정한다. 운영 CSS 파일은 고치지 않는다.
- 폭은 360px 기준. 가로 스크롤이 생기면 안 된다(분류 칩 줄만 예외).
- 금액은 가장 크고 굵게(28px 이상). 대표 앱 칸과 버튼이 두 번째로 눈에 띄게. 운영의 앱 색(`data-platform`)을 새로 만들지 않고 `PlatformBadge`의 아이콘 색에 맡긴다.

## 전파 확인 (`docs/CHANGE-PROPAGATION.md`)

이 시안은 읽기만 하고 규칙을 새로 쓰지 않는다. 묶음별로 본다.

- **1번 확실성**: 대표 오퍼 선택과 확정 배지가 `splitOffers`, `certaintyOf`에서 나온다. `filters.js`를 고치지 않으므로 판정표 계약(`certainty-cases.json`)이 영향을 받지 않는다. 같은 묶음의 나머지(Java 쪽)를 건드릴 이유가 없다.
- **2번 배너 모양, 3번 묶음 배너**: 배너 화면을 그리지 않는다. `fetchBanners`는 허브 링크 갱신에만 쓴다. 해당 없음.
- **4번 최소주문 출처**: 모르는 값을 `최소주문 미확인`으로 그린다. 지어내지 않는 원칙과 맞다. 틀린 문턱을 띄우지 않는다.
- **6번 화면에 나가는 글자**: 이 묶음이 가장 크게 걸린다.
  - `check-copy.mjs`는 `src/*.jsx`만 읽는다(`readdirSync('src')`, 하위 폴더 제외). `shells/card-standard/*.jsx`는 검사 밖이다. 그래서 `npm test`가 초록이어도 문구 규칙을 어긴 채 올라갈 수 있다. 구현자가 이 파일의 JSX 글자를 수동으로 읽어 금지어(`대조`, `표기`, `파서`, `관측`, `판독`, `추정`, `실측`, `정정`), 평서형 문장 끝 `…다.`, 시각 뒤 `오픈` 없는 `n시`가 없는지 본다. 검사 스크립트는 고치지 않는다(이슈: 기존 로직 파일 diff 0줄). 최종 설계로 넘길 때는 검사 범위를 하위 폴더까지 넓히는 일을 같이 해야 한다.
  - 새 문구 목록(시안용 임시, 병합 안 함): `받으러 가기`, `오늘 인기 N위`, `오늘/어제 HH:MM 기준`, `확정`, `시각 ?`, `다시 시도`. 기존 라벨 재사용: `최소주문 미확인`, `최소주문 없음`, `금액 ?`, `불확정`, `랜덤`, `특정메뉴`, `품절`. 수집기 말은 없다.
- **7번 행동 이벤트**: `track`을 쓰지 않으므로 이벤트 계약 스크립트(`verify-analytics-event-contract.mjs`)에 닿지 않는다. 다만 이 셸을 보는 동안은 `offer_link_click`이 안 쌓인다. 프리뷰 클릭률 비교는 별도 수단이 필요하다. 이 시안은 시각 비교용이라 받아들인다.
- **8번 배포 순서**: 웹만이고 병합하지 않는다. 프리뷰 브랜치 `preview/shell-card-standard`는 sub 세션이나 사람이 올린다. 구현자는 push하지 않는다.
- **9번 새 파일**: 새 `web/src/*.test.js`는 만들지 않는다. 테스트 사슬을 바꾸지 않는다. `docs/PROJECT-STRUCTURE.md`는 새 파일 때문에 다시 만든다(`python scripts/generate_project_structure.py`), 커밋 전에 한다.
- **올바른 순서의 시점 결합**: 이 셸은 운영 API의 현재 응답 모양을 읽는다. `certainty`가 없는 옛 응답이면 `certaintyOf`가 `exact`로 떨어져 모두 확정으로 보이는데, 이 문제는 운영 홈과 같다(2026-09-24 사고). 프리뷰는 운영 API를 보므로 해당 없음.

## 테스트와 확인

기존 `npm test`와 `npm run build`가 통과해야 한다. 새 테스트 파일은 없다. 그러므로 **"안 깨졌다"만으로는 시안이 맞다고 말할 수 없다.** 아래를 실제 운영 API 데이터로 본다.

- 양성 신호: 화면에 카드가 N장(N ≥ 1) 그려지고 `fetchBrands()`의 `applyFilters` 결과 길이와 같다. 0장이면 "데이터 없음"이 아니라 로딩 실패다.
- 360px 스크린샷: 첫 화면에 로고, 큰 금액, 칩, 4칸, 신뢰 줄, 버튼이 한 카드 안에 보인다. 결과 댓글에 단다.
- 값이 다른 세 카드를 골라 이슈의 세 판정(최소주문 있음/없음/모름, 앱 칸 `-`/금액/`금액 ?`, 확정/불확정)이 각각 맞게 그려지는지 본다. 운영 데이터에 없는 경우(예: `최소주문 미확인`)는 있는 척하지 않고 "운영 데이터에 없어 미확인"이라고 결과 댓글에 적는다.
- 링크: 카드 아무 곳이나 눌러 앱 링크 `href`가 열리는지(데스크톱 브라우저에서 `href` 값과 `target`을 확인, 실기는 사람이). 쿠팡이츠 카드에서 안내 토스트가 뜨는지.
- 차이 확인: `git diff --stat main -- web/src/*.js`에 `shells` 밖 변경이 없다. `main.jsx`는 위에서 설명한 한두 줄만.
- 문구: 위 6번 수동 확인.

## 설계로 넘길 기준(이 시안이 답하는 것)

최종 설계가 이 카드를 기준안으로 삼을 수 있도록, 시안을 본 사람이 판단할 질문을 적어 둔다.

- 6줄(신뢰 줄)이 카드마다 있어야 하는가, 목록 맨 위에 한 번만 두면 되는가.
- 5줄(앱 4칸)이 첫 화면에 있어야 하는가. 높이가 카드를 키워 첫 화면에 카드 한 장만 남는지.
- 카드 전체를 누르게 하는 것이 맞는가(실수 터치 vs 클릭률).
- `최소주문 미확인`을 칸 비움 대신 그리는 것이 신뢰에 도움이 되는가, 소음인가.

## 열린 질문

1. 쿠팡이츠 카드에서 `openWithNotice`의 안내 토스트(1.5~3.5초)가 시안 비교에서 클릭 후 경험을 흐린다. 시안에서는 운영과 같게 두는 것으로 정했다. 틀렸다면 알려 달라.
2. 프리뷰가 SSR HTML을 먼저 보내는지 구현 전에는 모른다. 불일치 처리(`main.jsx` 한 줄 더)는 프리뷰에서 본 뒤 정한다.

## 변경 이력

- 2026-11-03: 구현 중 발견. `main.jsx`가 `App`을 안 쓰면 번들러가 `App`의 지연 조각(`coupon-card-*.css`)을 버려 `npm run build`의 `ssr-template.mjs`가 "CouponCard CSS를 못 찾았다"로 죽는다. 설계에 없던 `main.jsx` 변경이라 최소로 넣었다: `window.__legacyHome = App` 한 줄(참조만 남김). 빌드 통과를 확인했다. 스크립트는 고치지 않았다.
