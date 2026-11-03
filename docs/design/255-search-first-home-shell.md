# 255: 홈 리뉴얼 시안 - 검색 먼저(search-first) 껍데기

- 이슈: [#255](https://github.com/woowacourse-teams/2026-to-discount/issues/255) (묶음 이슈 #230)
- 상태: 설계 초안(승인 대기)
- 범위: `web/src/shells/search-first/` 새 파일, `web/src/main.jsx` 이 브랜치 한정 한 줄(필요하면 두 줄)
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 프리뷰만 본다.

## 1. 문제

- 홈 리뉴얼 시안 여러 개를 프리뷰로 비교하려 한다. 이 시안은 "찾는 사람이 1초 안에 원하는 브랜드 카드로 간다"는 한 가지 개념만 보인다.
- 목표 우선순위: ① 값이 언제 어디서 확인됐는지 믿을 수 있게, ② 얼마·어느 앱·조건을 빠르게 강조, ③ 쿠폰 받으러 가는 곳을 빨리 보여 클릭률과 재방문율을 올림.
- 로직을 새로 짜면 시안끼리 비교가 아니라 계산 차이를 비교하게 된다. 그래서 데이터와 계산은 기존 모듈을 그대로 읽는다.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 홈 진입점이 어디인가 | `main.jsx`가 `window.__SSR__`가 있으면 `hydrateRoot`, 없으면 `createRoot`. 트리는 `<ErrorBoundary><App initial={ssr} /></ErrorBoundary>` | `web/src/main.jsx:95-131` |
| 서버 렌더도 `App`을 그리는가 | 그린다. `entry-server.jsx`가 `App`을 고정으로 임포트한다. 이 시안은 서버 렌더를 고치지 않는다 | `web/src/entry-server.jsx:8,40` |
| 시안 홈과 서버 HTML이 어긋나는가 | **어긋난다.** 서버는 `App`을 그려 보내는데 클라이언트가 `SearchFirstShell`로 `hydrateRoot`하면 불일치가 난다. 이슈 결정이 `ssr`을 무시하는 한 줄을 허용했다 | 이슈 "결정" 4번째 줄 |
| 브랜드 한 건의 모양 | `name`, `category`, `offers[]`, `links`(앱별 링크), `searchAliases`, `menus`, `popularityToday`, `popularityPrevious`. 오퍼는 `platform`, `amount`, `minOrderAmount`, `qualifier`, `conditions`, `tiers`, `soldOut`, `capturedAt`, `link` | `couponModel.js`, `filters.js`, `brandAutocomplete.js` |
| 링크 함수의 인자 | `offerLink(offer, brand.links, brand.name)`. 쿠팡이츠는 앱이 안 열리면 `openWithNotice`가 공유 링크로 넘기고 안내 문구를 띄운다. 같은 파일의 기존 내보내기이므로 읽어 쓴다 | `CouponCard.jsx:56`, `offerLink.js:106,184` |
| 최소주문을 모를 때 | `minLabel(null)`은 `null`. 정식 라벨 "최소주문 미확인"은 `conditionTable`의 행(`min`)에 있다. 이슈 결정이 이 라벨을 그리라고 했다 | `couponModel.js:37-41,176` |
| 대표 금액 | `displayBestAmount(offers)`는 특정메뉴 정렬값 4,999를 찍지 않고 액면만 돌려준다. 값이 없으면 `null` | `filters.js:441` |
| 최신 확인 시각 | `latestCaptured(offers)`는 ISO 문자열 또는 `null` | `filters.js:289` |
| 인기 순위 | `popularToday(brands)`는 상위 다섯의 `{ brand, rank, change }`. 클릭이 적은 새벽에는 3곳 미만일 수 있다(`STRIP_MIN`은 이 함수가 아니라 부르는 쪽 몫) | `popularStrip.js:30` |
| 검색 | `findBrandSuggestions(brands, input, limit)`가 이름, 별칭, 메뉴, 초성, 한영 전환을 모두 다룬다. 읽기만 한다 | `brandAutocomplete.js:106` |
| 화면 문구 검사가 이 시안을 보는가 | **안 본다.** `check-copy.mjs`는 `src/` 최상위 `*.jsx`만 읽는다(`readdirSync('src')`). `shells/` 아래는 금지어 검사가 닿지 않는다 | `web/scripts/check-copy.mjs:9` |
| 새 테스트가 도는가 | 돈다. `run-node-tests.mjs`가 `src/` 아래 `*.test.js`를 재귀로 찾는다. `package.json`은 안 고친다 | `web/scripts/run-node-tests.mjs:15` |

## 3. 결정

### 3-1. 파일 구성

모두 `web/src/shells/search-first/` 아래. 이슈가 정한 대로 CSS는 한 파일.

| 파일 | 역할 |
| --- | --- |
| `SearchFirstShell.jsx` | 홈 컴포넌트. 불러오기, 검색 입력, 칩, 결과 카드를 그린다. 상태는 `brands`, `banners`, `query` 셋 |
| `data.js` | 얇은 어댑터. 기존 모듈에서 불러와 화면용 모양으로만 바꾼다. 계산 금지 |
| `data.test.js` | 어댑터 시험(§5) |
| `shell.css` | 이 시안의 스타일 전부. 클래스 이름은 `sf-` 접두사로 `App.css`와 안 겹치게 한다 |

### 3-2. 데이터 흐름

1. 마운트 때 `fetchBrands()`와 `fetchBanners()`를 부른다. 배너는 실패해도 빈 배열로 둔다(`App`과 같은 규칙, 배너는 부가 정보). 받은 배너는 `setHubLinks(banners)`에 넘긴다. 안 넘기면 허브 링크 단계가 비어 링크 사다리가 짧아진다.
2. 브랜드 실패는 에러 문구와 다시 시도 버튼 하나. 시안 문구라 세션이 정해도 된다.
3. 검색어가 비면 칩 영역, 있으면 결과 카드를 보인다.

### 3-3. `data.js`가 내보내는 것

계산은 하나도 하지 않는다. 기존 함수를 부르고 이름만 붙인다.

- `frequentBrands(brands)`: `popularToday(brands)`의 `brand`를 그대로 칩 목록으로 낸다. 세 곳이 안 되면 `sortBrands(brands, { sorts: <기본 정렬> })`의 앞 다섯으로 채운다. 기본 정렬은 `defaultFilters().sorts`를 읽어 쓴다(새 값을 쓰지 않는다).
  - "자주 찾는 브랜드"의 근거는 서버가 센 오늘 클릭 수다. 한 사람의 방문 이력이 아니다.
- `searchBrands(brands, query)`: `findBrandSuggestions(brands, query, 8)`을 그대로 부른다. 결과 순서는 그 함수의 순서이고 다시 정렬하지 않는다.
- `cardOf(brand)`: 카드 하나에 필요한 값을 한 번에 만든다.
  - `name`, `category`
  - `amount`: `displayBestAmount(brand.offers)`. `null`이면 카드는 금액 자리에 `amountText(대표 오퍼)`를 쓴다(1+1 묶음 같은 금액 없는 행사).
  - `apps`: `PLATFORMS`(`platforms.js`)의 네 앱 순서대로 한 칸씩. 칸마다 `{ platform, state, amount, link, minText, chips }`.
  - `checkedAt`: `latestCaptured(brand.offers)`.
- 앱 칸의 `state`는 셋이다.
  - `none`: 그 앱에 오퍼가 없다. 화면은 `-`.
  - `unknownAmount`: 오퍼는 있는데 금액을 모른다(`amount == null`). 화면은 `amountText`가 돌려주는 원문(`rawText`), 원문도 비면 상세 표와 같은 "금액 ?"(`couponModel.js:170`). `-`로 그리지 않는다(없음과 구분). §7 첫 질문 참고.
  - `known`: 금액이 있다.
- `minText`: 오퍼의 `minOrderAmount`를 `minLabel`에 넣어, 숫자면 `<숫자>원↑`(`conditionTable`의 `min` 형식과 같다), `0`이면 `minLabel`이 주는 "최소주문 없음", `null`이면 "최소주문 미확인". 라벨 세 개 모두 기존 모듈이 내는 글자이고 새 문구가 아니다.
- `chips`: 칩 선별은 `chipsOf(offer)`를 부른 뒤 `onCard`로 거른 것에 `headOrder`를 적용한 결과를 그대로 쓴다. 금액과 조건은 줄이되 숨기지 않는다는 이슈 규칙을 이 세 함수가 이미 지킨다. `qualifiersOf`가 주는 "첫 주문"은 `chipsOf` 안에 들어 있어 따로 부르지 않는다.

앱 칸의 대표 오퍼는 그 앱 오퍼 중 `splitOffers(앱 오퍼, false).best[0]`을 쓴다. 직접 고르는 식을 쓰지 않는다(§4 1번 묶음, 규칙이 하나여야 한다).

### 3-4. 화면 (360px 기준, 위에서 아래로)

1. **검색창**: 첫 화면 한가운데. 큰 입력 하나와 지우기 버튼. 자동 포커스는 켜지 않는다(모바일에서 키보드가 화면을 덮어 칩이 가려진다).
2. **자주 찾는 브랜드 칩**: 검색어가 없을 때만. 로고(`BrandLogo`)와 이름. 누르면 입력창에 이름을 채워 결과를 바로 보인다(1탭).
3. **결과 카드**: 검색어가 있을 때. 카드 하나는
   - 위: 브랜드 로고, 이름, 대표 금액 큰 글씨(`amount`), 조건 칩 한두 개.
   - 아래: 앱 네 칸. 칸마다 앱 이름, 금액 또는 `-`, 최소주문 줄, 눌러서 앱을 여는 버튼.
   - 맨 아래 작은 글씨: "<날짜 시각> 기준"(`checkedAt`). 없으면 줄을 그리지 않는다.
4. 결과가 없으면 "찾는 브랜드가 없어요" 한 줄과 칩 영역을 다시 보인다. 문구는 시안용 임시다.

목표별 대응.

| 목표 | 이 시안에서 |
| --- | --- |
| ① 신뢰성 | 카드마다 최근 확인 시각, 모르는 값은 기존 라벨, 없는 값은 `-`로 구분해 그린다 |
| ② 핵심 강조 | 금액을 카드에서 가장 크게, 최소주문과 조건은 금액 바로 아래 한 줄 |
| ③ 누를 곳 | 카드 안 앱 버튼이 첫 화면 결과에서 스크롤 없이 보인다. 앱 버튼이 곧 쿠폰 받으러 가기 |

### 3-5. 클릭

- 앱 버튼은 `<a href={offerLink(offer, brand.links, brand.name)}>`다. `http`로 시작하면 `target="_blank" rel="noreferrer"`(`CouponCard.jsx:56-63`과 같은 모양).
- `onClick`에서 `openWithNotice(e, href, { offerPrompt: true })`를 부른다. 쿠팡이츠 안내 문구와 앱 미설치 대체 이동을 기존 코드가 한다.
- 분석 이벤트는 쏘지 않는다(이슈가 생략을 허용). `track`을 임포트하지 않으므로 `ALLOWED_EVENTS` 대조(7번 묶음)는 닿지 않는다.
- 링크가 `undefined`로 나오는 경우(`offerLink`의 사다리 마지막 `PLATFORM_APP_LINKS`까지 없을 때)는 버튼을 `disabled`로 그린다. 링크 없는 `<a>`를 만들지 않는다.

### 3-6. `main.jsx` 변경

이 브랜치 한정, 이슈가 허용한 범위.

- `import App from './App.jsx'`는 두고 `import SearchFirstShell from './shells/search-first/SearchFirstShell.jsx'`를 더한다.
- `<App initial={ssr} />`를 `<SearchFirstShell />`로 바꾼다. `App.jsx`와 다른 컴포넌트는 지우지 않는다. `App` 임포트가 안 쓰이면 린트가 걸리는지 구현자가 `npm run lint`(있으면)로 보고, 걸리면 그 임포트 줄을 지운다.
- 프리뷰에서 하이드레이션 불일치가 보이면(콘솔 경고, `onRecoverableError`의 복구 오류) 서버가 보낸 `ssr`을 무시한다: `const ssr = window.__SSR__`를 `const ssr = null`로 바꾼다. 한 줄이다. `if (ssr) setHubLinks(...)`와 `hydrateRoot` 분기가 같이 꺼지고 `createRoot`로 그린다. 허브 링크는 `SearchFirstShell`이 배너를 직접 받아 `setHubLinks`를 부르므로 유지된다(§3-2 1번). PR 본문에 이 한 줄을 적는다.
- `main.jsx`의 diff는 많아야 두 줄이다. `git diff --stat main -- web/src/*.js`는 `web/src/` 최상위 `.js`만 보므로 `main.jsx`는 그 목록에 아예 안 잡힌다. 완료 조건 확인은 `git diff --stat main -- web/src ':!web/src/shells'`로 하고, 나오는 것이 `main.jsx` 하나뿐이어야 한다(§5).

### 3-7. 문구

- 화면 문구는 시안용이라 세션이 정해도 된다. 단 "확인", "미확인", "판독", "관측" 같은 수집기 말은 **새로 만들지 않는다.** 기존 모듈이 내는 "최소주문 미확인", "최소주문 없음"만 예외다.
- 신뢰성 줄은 "확인"을 피해 "<날짜 시각> 기준"으로 쓴다.
- `check-copy.mjs`가 `shells/`를 안 보므로(§2) 구현자가 아래 명령으로 직접 센다. 0건이어야 한다. 검사기의 금지어 여덟 개에 "확인"을 더했다. 주석에 쓴 "확인"은 화면 문구가 아니므로 `.jsx`의 따옴표 안 글자만 본다.
  - `grep -nE "대조|표기|파서|관측|판독|추정|실측|정정|확인" web/src/shells/search-first/SearchFirstShell.jsx`
  - "최소주문 미확인"은 기존 정식 라벨(`couponModel.js:176`)이다. `minLabel`이 `null`을 주므로 이 글자는 `data.js` 한 곳에만 상수로 둔다. `.jsx`에 "미확인"이 직접 보이면 새로 만든 것이다.

## 4. 동반 변경 묶음(`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 해당 | 이번 작업에서 |
| --- | --- | --- |
| 1번 확실성 판정 | 읽기만 | 대표 금액과 대표 오퍼는 `displayBestAmount`, `splitOffers`가 낸다. 판정을 직접 쓰지 않는다. 직접 쓰면 서버 정렬과 배지가 어긋난다 |
| 4번 최소주문 출처 | 읽기만 | 모르면 "최소주문 미확인". 값을 지어내지 않는다 |
| 6번 화면에 나가는 글자 | **해당** | 새 문구는 시안용 임시. 수집기 말을 쓰지 않는다. 검사 스크립트가 못 닿아 §3-7의 grep으로 대신한다 |
| 7번 행동 이벤트 | 해당 없음 | 이벤트를 안 쏜다 |
| 8번 저장소 경계와 배포 순서 | 해당 | 웹만 바꾼다. API 변경 없음이라 순서 문제가 없다. 프리뷰 먼저, 병합하지 않는다 |
| 9번 새 파일 | 해당 | `web/src/shells/**/*.test.js`는 `run-node-tests.mjs`가 재귀로 찾으므로 `package.json`을 안 고친다. `docs/PROJECT-STRUCTURE.md`는 새 파일 때문에 다시 만들어야 푸시 훅이 통과한다(`python scripts/generate_project_structure.py`). 병합하지 않는 브랜치라 구조 문서 diff가 남는 것은 알려진 비용이다 |
| 2, 3, 5번 | 해당 없음 | 배너 모양, 묶음 배너, 알림을 안 만진다. 배너는 `setHubLinks`로만 읽는다 |

## 5. 시험

### `web/src/shells/search-first/data.test.js`(새 파일)

`node:test`, 기존 `web/src/*.test.js`와 같은 방식. 픽스처는 브랜드 한두 개를 직접 만든다. 네트워크를 안 탄다.

- 앱 칸: 네 앱 중 오퍼가 없는 앱은 `state: 'none'`, 금액을 모르는 오퍼는 `unknownAmount`, 금액이 있으면 `known`. **없음과 모름이 다른 값으로 나오는지**가 이 시험의 핵심이다.
- `minText`: `minOrderAmount`가 `null`이면 "최소주문 미확인", `0`이면 "최소주문 없음", `7000`이면 `7,000원↑`.
- 대표 금액: 특정메뉴 쿠폰뿐인 브랜드에서 `amount`가 4,999가 아니라 `displayBestAmount`가 돌려주는 액면(또는 `null`)인지. 정렬 천장을 화면에 안 찍는 규칙을 박는다.
- `frequentBrands`: 인기 순위가 세 곳 미만이면 기본 정렬 앞 다섯으로 채워지고, 세 곳 이상이면 `popularToday` 순서를 그대로 쓴다.
- 껍데기 밖 변경이 없음: 아래 명령은 시험이 아니라 구현자가 PR 전에 한 번 돌리고 출력을 남긴다.
  - `git diff --stat main -- web/src ':!web/src/shells'`가 `web/src/main.jsx` 하나만 보인다.
  - 이슈의 `git diff --stat main -- web/src/*.js`는 출력이 비어야 한다. 단 **이 명령은 `.jsx`를 안 본다**(양성 신호가 없다). 그래서 위 명령을 함께 돌린다.

### 기존 검사

- `npm test`와 `npm run build`가 통과한다. 새 폴더가 `build-logo-manifest.mjs`, `prerender.mjs`, SSR 빌드에 영향이 없는지 빌드 출력으로 본다.
- 360px 스크린샷: 첫 화면(검색어 없음), 검색 결과 카드 하나(금액 있는 앱과 `-`인 앱이 같이 보이는 브랜드로), "최소주문 미확인" 칸이 보이는 카드. 세 장을 PR 댓글에 단다. 촬영은 `web/scripts/dev/banner-shot.mjs`를 참고한다(`docs/WORKFLOW.md` §5).

## 6. 구현 순서

1. `data.js`와 `data.test.js`. 시험이 초록이 되게 한다.
2. `SearchFirstShell.jsx`와 `shell.css`.
3. `main.jsx` 한 줄. 로컬에서 운영 API를 읽어 360px로 확인한다.
4. 하이드레이션 경고가 보이면 `ssr`을 `null`로 바꾸는 한 줄을 더하고 PR 본문에 적는다.
5. `npm test`, `npm run build`, 구조 문서 다시 만들기, 문구 grep.
6. 사람이나 sub 세션이 `preview/shell-search-first`로 push한다(`docs/WORKFLOW.md` §3-3). 프리뷰 주소: `https://beggars-git-preview-shell-search-first-nn98s-projects.vercel.app`.

## 7. 결정이 필요한 것

- **금액을 모르는 앱 칸을 어떻게 그리는가.** 이슈 결정은 "오퍼가 없으면 `-`, 값을 모르면 기존 라벨"이다. 최소주문 쪽 기존 라벨은 "최소주문 미확인"으로 분명하지만, 금액 모름의 기존 라벨은 `conditionTable`의 "금액 ?"(`couponModel.js:170`)뿐이고 상세 표 전용이다. 이 설계는 `amountText`의 원문(`rawText`)을 우선 그리고 원문도 없을 때만 "금액 ?"를 쓰는 것으로 가정했다. **다른 라벨을 원하면 알려 달라.** 시안이라 되돌리기 쉽다.
- **"자주 찾는 브랜드"의 기준이 오늘 인기(서버 집계)인가.** 사용자별 이력이 없어 이 시안은 서버 인기를 쓴다. 개인 이력을 원하면 새 저장 로직이 필요해 "로직을 새로 짜지 않는다"와 부딪히므로 이 시안에서는 하지 않는다.
- 확인하지 않은 것
  - 운영 API 응답에서 `brand.links`가 실제로 어떤 앱 키를 갖는지는 코드로만 읽었고 서버 조회는 안 했다. 구현자가 프리뷰에서 앱 버튼 네 개의 `href`를 눌러 확인한다.
  - 하이드레이션 불일치가 실제로 나는지는 프리뷰를 띄워 봐야 안다. 위 §3-6의 한 줄은 그때만 쓴다.

## 8. 끊기면 무엇이 보이나

- `setHubLinks`를 안 부르면 허브 링크가 비어 앱 버튼이 한 단계 아래 링크(앱 열기)로 떨어진다. 화면은 멀쩡하고 눌렀을 때 목적지만 얕아진다.
- 대표 금액을 `bestConfirmedAmount`로 읽으면 특정메뉴 쿠폰뿐인 브랜드에 4,999원이 진짜 가격처럼 찍힌다. `displayBestAmount`를 쓰는 이유다.
- `minLabel(null)`의 `null`을 그대로 그리면 최소주문 줄이 비어 보인다. 비면 "없음"으로 읽혀 목표 1(신뢰성)과 반대가 된다.
- `ssr`을 두고 시안으로 갈아끼우면 첫 화면에서 서버가 그린 `App`이 잠깐 보이거나 복구 오류가 난다. 값은 틀리지 않고 깜박임뿐이다.

## 변경 이력

- 2026-11-03 구현: 권한자 댓글로 바뀐 설계 내용은 없다. 구현 중 설계와 달라진 점 둘.
  - `main.jsx`에서 `const ssr = null`을 처음부터 적용했다(§3-6은 프리뷰에서 불일치가 보이면). 서버는 `App`을 그려 보내므로(§2) 시안과 어긋나는 것이 구조상 확실해서다. 프리뷰를 띄워 본 뒤 정한 것이 아니다.
  - `App` 임포트를 두는 정도로는 부족했다. 쓰이지 않으면 번들에서 지워져 `coupon-card-*.css` 조각이 안 생기고 `scripts/ssr-template.mjs`가 빌드를 죽인다. 그래서 `globalThis.__App = App` 한 줄로 붙들었다. `main.jsx` diff는 두 줄이 아니라 6줄 안팎이다.
