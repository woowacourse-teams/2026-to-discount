# 238 홈 리뉴얼 시안: 카테고리 먼저 (category-grid)

- 이슈: #238 (묶음 이슈 #230)
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 프리뷰(`preview/shell-category-grid`)만 본다.
- 영역: `web/` 한정. API, 수집기, 원장은 건드리지 않는다.

## 1. 한 줄 요약

홈 첫 화면을 카테고리 아이콘 그리드로 바꾼다. 카테고리 칸마다 그 카테고리의 최고 할인 금액과 1위 브랜드를 보이고, 칸을 누르면 그 카테고리 목록이 열린다. 목록의 카드를 누르면 `offerLink`로 실제 앱 링크가 열린다.

리뉴얼 목표(사용자 2026-11-03, 우선순위 순)에 이 시안이 답하는 방식:

1. **신뢰성:** 칸마다 "언제 확인됐는지"(`latestCaptured`)를 금액 옆에 둔다. 값이 없으면 시각 칸을 비우고 지어내지 않는다.
2. **핵심 전달:** 금액을 가장 크게, 앱 이름과 조건(최소주문, 첫 주문 등)을 그 아래 한 줄로 둔다.
3. **누를 곳:** 카테고리 칸 안에 "쿠폰 받으러 가기" 링크를 바로 둔다. 목록까지 한 번 더 들어가지 않아도 1위 쿠폰의 앱이 열린다.

## 2. 읽은 것과 변경 전파 점검

`docs/CHANGE-PROPAGATION.md`에서 이 변경이 걸리는 묶음을 찾았다.

| 묶음 | 걸리는가 | 판단 |
| --- | --- | --- |
| 1. 확실성 판정 | 읽기만 | `filters.js`의 `displayBestAmount`, `sortBrands`를 **불러 쓴다.** 판정을 새로 짜지 않으므로 서버와 어긋날 일이 없다. 특정메뉴 4,999원을 금액으로 찍는 사고를 막으려고 금액은 반드시 `displayBestAmount`로 읽는다. |
| 2. 배너 모양, 3. 묶음 배너 | 안 걸림 | 이 시안은 배너를 그리지 않는다. 배너는 쿠팡이츠 허브 링크(`setHubLinks`) 용도로만 받는다. |
| 6. 화면에 나가는 글자 | **걸림** | 새 문구는 세션이 정하지 않는다(`docs/COPY-STYLE.md`). 이 문서의 §5 "새 문구"에 쓸 문구를 모았고, 구현 세션은 이 목록 밖의 문구를 넣지 않는다. 시안이라 개발자가 프리뷰에서 문구를 확정한다. |
| 7. 행동 이벤트 | 안 걸림 | 이슈가 분석 이벤트 생략을 허용한다. `track(...)`을 부르지 않으므로 `ALLOWED_EVENTS` 대조도 필요 없다. |
| 8. 배포 순서 | 안 걸림 | API 변경이 없다. 프리뷰 브랜치만 나간다. |
| 9. 새 파일 | **걸림** | 아래 §7. |

같은 묶음의 나머지를 이번 작업에 넣지 않는 이유: 6번의 나머지 자리(원장 검사, 배너 검사, `platforms.js` 라벨)는 새 문구를 정식으로 넣을 때 필요하다. 병합하지 않는 시안은 정식 반영 대상이 아니므로 넣지 않는다. 좋은 부분을 모아 정식 이슈로 옮길 때 그 묶음 전체를 다시 점검한다.

## 3. 범위

고치는 파일은 둘, 새로 만드는 파일은 `web/src/shells/category-grid/` 아래에만 둔다.

| 파일 | 일 |
| --- | --- |
| `web/src/main.jsx` | 홈 렌더를 `<CategoryGridShell />`로 바꾼다(§6). |
| `web/src/shells/category-grid/data.js` | 기존 모듈을 불러 화면용 모양으로 바꾸는 얇은 어댑터. |
| `web/src/shells/category-grid/CategoryGridShell.jsx` | 화면 컴포넌트. 상태는 "고른 카테고리" 하나. |
| `web/src/shells/category-grid/category-grid.css` | 이 시안의 CSS 전부. 클래스 이름은 `cg-` 접두사. |
| `web/src/shells/category-grid/data.test.js` | 어댑터 시험(§8). |

고치지 않는 파일: `api.js`, `filters.js`, `couponModel.js`, `offerLink.js`, `popularStrip.js`, `App.jsx`, `entry-server.jsx`와 그 밖의 `web/src/*`. 새 npm 의존성 없음.

## 4. 데이터: `data.js`

계산 로직을 두지 않는다. 기존 함수를 부르고 이름을 바꿔 담기만 한다. 아래 흐름이 어댑터의 전부다.

### 4-1. 불러오기

`loadHome()`: `fetchBrands()`와 `fetchBanners()`를 함께 부른다.

- 브랜드 실패는 던진다(화면이 오류 상태를 그린다).
- 배너 실패는 빈 배열로 둔다(`App`, `entry-server`와 같은 규칙: 배너는 부가 정보).
- 받은 배너를 `setHubLinks(banners)`에 넘긴다. 안 하면 쿠팡이츠 외 허브 링크 사다리가 비어 링크가 앱 홈으로만 떨어질 수 있다. `main.jsx`가 SSR 데이터가 있을 때만 이 호출을 하는데, 이 시안은 SSR 데이터를 쓰지 않으므로(§6) 어댑터가 직접 부른다.

### 4-2. 카테고리 칸

`categoryTiles(brands)`는 `CATEGORIES` 순서대로 칸을 낸다.

1. 필터: `defaultFilters()`에서 `categories`만 `new Set([key])`로 바꿔 `applyFilters(brands, f)`를 부른다. 기본 필터(5,000원 이상, 전 앱, 멤버십 전부)가 기존 홈과 같이 걸린다.
2. 보일 칸: `visibleCategories(brands)`로 오퍼가 모자란 카테고리를 뺀다. 기존 홈의 카테고리 탭과 같은 규칙이다.
3. 1위 브랜드: 2번 결과(`sortBrands`가 이미 금액 큰 순으로 세움)의 앞에서부터 `displayBestAmount(brand.offers, include)`가 null이 아닌 첫 브랜드. `include`는 `includesFrom(f)`.
4. 1위 오퍼: `splitOffers(brand.offers, include).best[0]`. 대표 쿠폰 선택 규칙을 카드(`CouponCard`)와 같게 쓴다.
5. 칸에 담을 값:

| 칸 이름 | 값을 읽는 곳 |
| --- | --- |
| `key`, `label` | `CATEGORIES` |
| `count` | `applyFilters` 결과 길이 |
| `brandName` | 1위 브랜드 `name` |
| `amount` | `amountText(offer)` |
| `platform` | `offer.platform` |
| `minOrder` | `minLabel(offer.minOrderAmount)` (null이면 칸 비움) |
| `chips` | `chipsOf(offer)`에서 `onCard`인 것을 `headOrder`로 정렬 |
| `capturedAt` | `latestCaptured(brand.offers)` |
| `href` | `offerLink(offer, brand.links, brand.name)` |

`onCard`, `headOrder`는 `couponModel.js`에 이미 있는 export다.

6. 1위 오퍼가 없는 카테고리(`displayBestAmount`가 전부 null)는 칸에 금액 없이 "건수"만 두고 `href`를 비운다. 숨기지 않는다.

### 4-3. 카테고리 목록

`brandsOf(brands, key)`는 위 1번과 같은 `applyFilters` 결과를 돌려준다. 목록 줄마다 §4-2의 4~5번과 같은 변환(`rowOf(brand)`)을 쓴다. 칸과 목록 줄이 같은 변환 함수 하나를 공유한다.

## 5. 화면: `CategoryGridShell.jsx`

360px 기준. 상태는 `selectedKey`(null이면 그리드, 있으면 그 카테고리 목록) 하나다. 라우터를 쓰지 않는다. 브라우저 뒤로가기로 그리드에 돌아가게 하려면 기존 `backClose.js`를 읽어 보고 맞으면 쓰고, 안 맞으면 화면 안 "← 카테고리" 버튼만 둔다(시안이므로 버튼으로 충분).

### 5-1. 첫 화면(그리드)

위에서 아래로:

1. **머리:** 서비스 이름 한 줄과 그리드 전체의 "확인 시각"(`latestCaptured` 중 가장 늦은 값). 값이 없으면 시각을 그리지 않는다.
2. **카테고리 그리드:** 2열 × n행. 칸 하나는 아래를 담는다.
   - 카테고리 이름(`label`)과 큰 아이콘 자리. 아이콘 이미지는 없으므로 기존 `BrandLogo`로 1위 브랜드 로고를 쓴다(새 이미지 파일을 만들지 않는다. 이미지 추가는 이 시안의 범위 밖).
   - 최고 할인 금액(`amount`): 칸에서 가장 큰 글씨. 앞에 "최대"를 붙이지 않는다. `displayBestAmount`가 확정 금액만 주기 때문이다.
   - 한 줄 조건: 앱 이름(`PLATFORM_BY_KEY` 라벨), 최소주문(`minOrder`), 칩 최대 둘. 줄이되 숨기지 않는다. 최소주문이 null이면 이 칸만 비운다.
   - 확인 시각: 칸 맨 아래 작은 글씨.
   - "쿠폰 받으러 가기" 링크: 칸 안 오른쪽 아래. `<a href target rel>`로 `href`를 연다. 쿠팡이츠 링크는 `openWithNotice`를 쓴다(§5-3).
3. 칸의 링크 밖 영역을 누르면 그 카테고리 목록으로 간다.

### 5-2. 카테고리 목록

- 머리: "← 카테고리" 버튼, 카테고리 이름, 건수.
- 줄(카드) 하나: 브랜드 로고, 이름, 금액(큼), 앱, 최소주문, 칩, 확인 시각, 줄 전체가 링크.
- 줄 순서는 `applyFilters` 결과 순서 그대로다. 정렬을 새로 하지 않는다.

### 5-3. 링크 열기

- `offerLink`가 돌려준 값이 없으면(`undefined`) 링크를 그리지 않는다.
- `href`가 쿠팡이츠 링크면 `onClick={(e) => openWithNotice(e, href)}`. 이 함수가 기본 이동을 막고 안내를 띄운 뒤 연다. 안 부르면 쿠팡이츠 링크는 안내 없이 열린다(`openWithNotice` 주석, #141 참고).
- 그 밖의 링크는 `target="_blank" rel="noopener noreferrer"`. 커스텀 스킴(`baemin://`)은 `target`을 주지 않는다. 기존 `OfferChip.jsx`가 이 구분을 어떻게 하는지 먼저 읽고 같게 한다.
- 분석 이벤트는 보내지 않는다.

### 5-4. 상태

- 로딩: 기존 `BrandGridSkeleton`을 쓸 수 있으면 쓰고, 맞지 않으면 회색 칸 6개.
- 오류: 한 줄 안내와 "다시 시도" 버튼(`loadHome` 재호출). 문구는 아래 새 문구 표.
- 빈 결과(카테고리에 오퍼 없음): 안내 한 줄.

### 새 문구 (개발자 확인 필요)

`docs/COPY-STYLE.md`를 구현 세션이 먼저 읽고 어긋나는 것이 있으면 이 표를 고쳐서 쓴다. 표에 없는 문구는 넣지 않는다.

| 자리 | 문구(안) |
| --- | --- |
| 링크 | 쿠폰 받으러 가기 |
| 머리 시각 | 확인 `MM.DD HH:mm` |
| 뒤로 | ← 카테고리 |
| 건수 | `n`곳 |
| 오류 | 불러오지 못했어요 / 다시 시도 |
| 비어 있음 | 지금 받을 수 있는 쿠폰이 없어요 |

"확인"은 수집기 말이 사용자 화면에 샌 전례(CHANGE-PROPAGATION §6)가 있는 단어다. **시각 앞 단어는 프리뷰에서 개발자가 정한다.** 시각 형식은 한국 시각(Asia/Seoul)으로 읽고, 브라우저 시간대에 의존하지 않는다.

## 6. `main.jsx` 변경

이슈 완료 조건은 "main.jsx 한 줄 제외"다. 그런데 한 줄로는 안 된다. 근거:

- 서버(`api/ssr.js` → `entry-server.jsx`)는 요청마다 `App`을 그린 HTML을 보낸다. `window.__SSR__`가 있으면 `main.jsx`가 `hydrateRoot`로 `App` 트리에 붙는다.
- 홈을 `CategoryGridShell`로 바꾸면 서버 HTML(`App`)과 클라이언트 트리(시안)가 다르다. 하이드레이션이 어긋나 복구 오류가 나고, iOS 보정(`relayout`)이 서버 HTML 클래스를 건드린다.

그래서 변경은 이 둘이다(둘 다 `main.jsx`, 시안 브랜치 한정).

1. `import CategoryGridShell from './shells/category-grid/CategoryGridShell.jsx'`와 `import './shells/category-grid/category-grid.css'` 추가.
2. 트리의 `<App initial={ssr} />`를 `<CategoryGridShell />`로 바꾼다.
3. 하이드레이션 분기 `if (ssr)`를 `if (ssr && !SHELL)`로 바꾸고, 위에 `const SHELL = true`를 둔다. 그러면 항상 `ReactDOM.createRoot(rootEl).render(tree)`로 그린다. `hydrateRoot` 분기와 `relayout` 블록은 지우지 않으므로 diff가 작고, 시안을 버릴 때 되돌리기 쉽다.

`setHubLinks(ssr.banners)` 줄은 그대로 둔다. 어댑터가 같은 값으로 다시 설정하므로 해롭지 않다.

`App.css` import와 `homeUnderDirectLanding()`은 그대로 둔다. `App.css`의 전역 규칙이 시안과 겹칠 수 있어 시안 CSS는 `.cg-` 접두사 클래스만 쓰고 전역 요소(`body`, `button`)를 건드리지 않는다.

완료 조건 문장은 구현 PR에서 "main.jsx 한 줄 제외"를 "main.jsx import 둘, 상수 한 줄, 트리 한 줄, 분기 한 줄"로 읽는다. 이슈 작성자에게 이 해석을 알린다(§9 질문 1).

## 7. 새 파일 점검 (CHANGE-PROPAGATION §9)

- `docs/PROJECT-STRUCTURE.md`를 `python scripts/generate_project_structure.py`로 다시 만든다. 안 하면 push 훅이 막는다. 단, 이 파일이 mono에 있는지, 시안 브랜치에서 갱신해야 하는지는 구현 세션이 훅을 돌려 확인한다.
- `data.test.js`를 만들면 `web/package.json`의 `test` 사슬에 넣는다. `web/package.json`은 이슈가 말한 "새 파일/수정 가능" 범위에 없지만 AGENTS.md가 요구하므로 이 한 줄은 예외로 고친다(§9 질문 2).
- 새 확장자(`.css`, `.jsx`, `.js`)만 쓰고 `/ops/`와 beggars-ops는 건드리지 않는다.

## 8. 시험

- **어댑터 시험(`data.test.js`):** 합성 브랜드 몇 개를 `categoryTiles`, `brandsOf`에 넣어 본다. 확인할 것:
  - 특정메뉴 쿠폰뿐인 브랜드는 `amount`가 4,999원이 아니라 액면(또는 칸 비움)이다.
  - 5,000원 미만만 가진 카테고리는 금액 없이 건수만 나온다.
  - 정렬이 `applyFilters` 결과와 같다(어댑터가 따로 정렬하지 않음).
  - 입력이 빈 배열이어도 칸은 `visibleCategories` 규칙대로 나온다.
- **기존 시험:** `npm test`, `npm run build`가 통과해야 한다.
- **구조 점검:** `git diff --stat main -- web/src/*.js`에 shells 밖 변경이 없어야 한다(`main.jsx`는 `.jsx`라 이 명령에 안 잡히므로 `git diff --stat main -- web/src`로도 한 번 본다).
- **양성 신호:** 프리뷰가 "운영 API 데이터"로 그려졌다는 증거를 남긴다. 합성 데이터나 오류 화면도 그리드처럼 보일 수 있으므로, 스크린샷에는 실제 브랜드 이름과 금액이 둘 이상 보여야 하고, 같은 시각에 `curl`로 받은 `/api/brands`의 1위 값과 대조한다. 대조 결과를 결과 댓글에 적는다.
- **스크린샷:** 360px 폭으로 (a) 그리드 첫 화면, (b) 카테고리 목록 하나. 절차는 `docs/WORKFLOW.md` §5의 `banner-shot.mjs`를 참고하되, 이 스크립트가 배너용이므로 홈 전체가 안 찍히면 구현 세션이 다른 방법을 쓰고 쓴 방법을 댓글에 적는다.

## 9. 사람에게 묻는 것

1. `main.jsx` 변경이 "한 줄"을 넘는다(§6). 분기 상수 방식으로 가도 되는가. 대안은 SSR 하이드레이션 오류를 감수하고 한 줄만 바꾸는 것이다.
2. `web/package.json`의 `test` 사슬에 `data.test.js` 한 줄을 넣어도 되는가. 대안은 어댑터 시험을 만들지 않는 것이다.
3. 시각 앞 단어와 "쿠폰 받으러 가기" 문구(§5 새 문구)를 프리뷰에서 확정해도 되는가.
4. 카테고리 칸의 아이콘으로 1위 브랜드 로고를 써도 되는가. 대안은 이모지다(문구 규칙과 별개로 시안에서만).

## 10. 프리뷰와 되돌림

- 구현이 끝나면 `preview/shell-category-grid`로 올린다(사람 또는 sub 세션이 push, `docs/WORKFLOW.md` §3-3). Vercel 주소는 `beggars-git-preview-shell-category-grid-nn98s-projects.vercel.app`이다.
- 병합하지 않는다. 시안을 버리면 브랜치만 지운다. 되돌릴 운영 변경이 없다.
- 좋은 부분을 모을 때는 #230에서 정한다. 그때 정식 이슈로 옮기며 §2의 6번 묶음(문구), 7번 묶음(이벤트)을 다시 점검한다.
