# 237: 홈 리뉴얼 시안 - 아래 시트 필터 (bottom-sheet)

- 이슈: [#237](https://github.com/woowacourse-teams/2026-to-discount/issues/237) (묶음 이슈 #230의 시안 하나)
- 상태: 설계 초안(승인 대기)
- 범위: `web/src/shells/bottom-sheet/`(새 폴더)와 `web/src/main.jsx` 한 자리. 그 밖은 만지지 않는다.
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 프리뷰(`preview/shell-bottom-sheet`)만 본다.

## 1. 문제와 목표

리뉴얼 목표는 우선순위 순으로 셋이다.

1. 화면의 신뢰성: 값이 언제 확인됐는지 믿을 수 있게.
2. 핵심(얼마, 어느 앱, 조건)을 빠르게 전하고 강조.
3. 누를 곳(쿠폰 받으러 가기)을 빨리 보여 클릭률과 재방문율을 올림.

이 시안의 개념은 "지도 앱의 아래 시트"다. 위쪽에는 오늘 요약 숫자, 그 아래에서 목록 시트가 올라오고, 정렬과 필터 칩이 시트 머리에 붙어 엄지로 바꾼다.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 홈이 어디서 그려지나 | `main.jsx`가 `<App initial={ssr} />`를 그린다 | `web/src/main.jsx:97-99` |
| 서버 렌더(SSR) HTML이 있으면 | `hydrateRoot`로 붙인다. 서버는 `App`을 그린 HTML을 보낸다 | `main.jsx:111-112`, `entry-server.jsx:40` |
| 허브 링크는 누가 세팅하나 | `main.jsx:96`의 `setHubLinks(ssr.banners)`와 `App`의 배너 로딩. `offerLink`의 마지막 대체 경로(`hubLinks`)가 이 값을 읽는다 | `offerLink.js:164`, `offerLink.js:184-193` |
| 카드 링크 호출 모양 | `offerLink(offer, brand.links, brand.name)` | `CouponCard.jsx:56` |
| 정렬·필터 상태의 기본값 | `defaultFilters()`가 `sorts`, `platforms`, `categories`, `minAmount5k` 등을 가진 객체를 돌려준다. 정렬은 `SORT_KEYS` 넷(인기순, 할인금액, 최소주문금액, 최신순) | `filters.js:74-78`, `filters.js:110` |
| 카드에 큰 글씨로 찍을 최고 할인액 | `displayBestAmount(offers, includesFrom(filters))`. 정렬용 `bestConfirmedAmount`는 특정메뉴 쿠폰에 4,999원을 끼워 넣으므로 화면에 쓰면 안 된다 | `filters.js:441`, 같은 파일 주석 |
| 값이 확인된 시각 | `latestCaptured(offers)`가 가장 최근 `capturedAt`을 돌려준다. 없으면 `null` | `filters.js:289` |
| 문구 검사가 새 폴더를 보나 | **안 본다.** `check-copy.mjs`는 `src/` 바로 아래 `.jsx`만 읽고 하위 폴더는 안 읽는다 | `web/scripts/check-copy.mjs:9` |
| 테스트 사슬이 새 폴더를 도나 | 단위 테스트는 `run-node-tests.mjs`가 `src/**/*.test.js`를 돈다. 이 시안은 테스트 파일을 새로 만들지 않는다 | `web/package.json:9`, [설계 221](https://github.com/woowacourse-teams/2026-to-discount/blob/main/docs/design/221-from-param-analytics.md) §4 |

## 3. 결정

### 3-1. 파일 구성

`web/src/shells/bottom-sheet/` 아래에만 새 파일을 만든다.

| 파일 | 역할 |
| --- | --- |
| `BottomSheetShell.jsx` | 최상위 화면. 데이터 로딩, 필터 상태, 요약 영역과 시트를 조립 |
| `data.js` | 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 바꿈. 계산 로직 금지 |
| `Sheet.jsx` | 아래 시트(머리, 칩 줄, 목록, 끌기 동작) |
| `bottom-sheet.css` | 이 시안의 CSS 하나. 클래스 이름은 전부 `bs-` 접두사 |

`web/src/main.jsx`는 홈을 `<BottomSheetShell />`로 바꾸는 변경만 한다(§3-5). 새 npm 의존성은 없다.

### 3-2. `data.js`: 어댑터가 하는 일

어댑터는 모양을 바꿀 뿐, 판정과 계산을 새로 짜지 않는다. 모든 값은 아래 기존 함수가 낸다.

| 화면 값 | 읽는 곳 |
| --- | --- |
| 브랜드 목록 원본 | `fetchBrands()` |
| 허브 링크용 배너 | `fetchBanners()` → `setHubLinks(banners)` |
| 목록(필터 적용·정렬) | `applyFilters(brands, filters)` (정렬은 안에서 `sortBrands`가 한다) |
| 필터 기본값 | `defaultFilters()` |
| 분류 칩 | `CATEGORIES`, `visibleCategories(brands, selected)` |
| 정렬 칩 | `SORT_KEYS` |
| 카드의 큰 금액 | `displayBestAmount(offers, includesFrom(filters))` |
| 카드의 오퍼 한 줄 | `amountText(offer)`, `minLabel(offer.minOrderAmount)`, `channelOf(offer)`, `chipsOf(offer)` 중 `onCard`가 참인 것 |
| 첫 주문 같은 조건 | `qualifiersOf(offer)` |
| 확인 시각 | `latestCaptured(offers)` |
| 오늘 요약 | `popularToday(brands)`, 보이는 브랜드 수는 `applyFilters` 결과의 길이 |
| 앱 링크 | `offerLink(offer, brand.links, brand.name)` |

`includesFrom`, `onCard`, `headOrder`는 `filters.js`와 `couponModel.js`가 이미 내보내는 함수라 이 시안이 불러 쓴다. 이슈 본문의 목록에 이름이 없을 뿐 새 로직이 아니다.

어댑터에 `if`로 금액이나 확실성을 가르는 코드가 생기면 그 판정은 기존 모듈에 이미 있는 것이다. 찾아서 부르고, 없으면 시안에서 그 항목을 뺀다(§7 결정 3).

### 3-3. 화면 구성 (360px 기준)

위에서 아래로:

1. **오늘 요약(위쪽, 접히지 않음).** 숫자 둘을 크게. 보이는 브랜드 수, 그리고 오늘 인기 1위 브랜드와 그 금액. 같은 줄에 마지막 확인 시각(`latestCaptured` 전체 브랜드 합산 최댓값)을 "n분 전" 꼴로. 목표 1(신뢰성)을 첫 화면에 둔다.
2. **아래 시트.** 화면 높이의 약 65%에서 시작한다. 머리를 위로 끌거나 누르면 거의 전체 높이로 펼쳐지고, 아래로 끌면 내려간다.
   - 시트 머리(고정): 끌기 손잡이, 정렬 칩 줄, 분류 칩 줄. 둘 다 가로 스크롤. 엄지 닿는 아래쪽에 가깝게 둔다.
   - 시트 몸(스크롤): 브랜드 카드 목록.
3. **카드 한 장.** 브랜드 로고와 이름, 가장 큰 금액(`displayBestAmount`), 그 오퍼의 앱 이름과 칩(채널, 첫 주문 등), 최소주문(`minLabel`), 확인 시각, 그리고 누를 곳 "쿠폰 받으러 가기" 단추. 카드를 누르면 `offerLink`의 앱 링크가 열린다. 금액과 조건은 줄이되 숨기지 않는다(§3-4).

끌기 동작은 `pointer` 이벤트와 CSS `transform`만 쓴다. 단계는 둘(낮음, 높음)이고 중간 값은 손을 떼면 가까운 쪽으로 붙는다. 라이브러리는 쓰지 않는다.

### 3-4. 조건을 숨기지 않는 방법

이슈의 "줄이되 숨기지 않는다"를 카드의 구조로 못박는다.

- 금액은 `amountText`가 내는 문자열 그대로 쓴다. 금액이 없는 묶음 행사(1+1)는 `rawText`가 나오므로 그대로 보인다.
- 최소주문은 `minLabel`이 내는 말 그대로. 모르면 기존 모듈이 내는 "미확인" 계열 문구를 그대로 쓴다. 시안이 지어내지 않는다(묶음 4번의 원칙).
- 칩은 `chipsOf`에서 `onCard`가 참인 것만, `headOrder`로 정렬해 그대로 그린다. 넘치면 가로로 잘리지 않게 줄바꿈한다.
- 한 브랜드의 오퍼가 여럿이면 카드에는 대표 하나만 크게, 나머지는 앱 이름과 금액만 한 줄씩 아래에 둔다. 대표를 고르는 기준은 `displayBestAmount`가 가리키는 금액과 같은 오퍼다.

### 3-5. `main.jsx` 교체: SSR 하이드레이션을 끈다

`main.jsx`에서 `<App initial={ssr} />`를 `<BottomSheetShell />`로 바꾸는 것만으로는 안 된다.

- 서버가 보내는 HTML은 `App`을 그린 것이다. 여기에 `hydrateRoot`로 `BottomSheetShell`을 붙이면 트리가 달라 하이드레이션 오류가 난다(`onRecoverableError`가 오류 이벤트를 쏜다).
- 그래서 이 브랜치에서는 `window.__SSR__`이 있어도 `hydrateRoot`를 부르지 않고 `ReactDOM.createRoot(rootEl).render(tree)`만 부른다. React가 기존 HTML을 비우고 새로 그린다. 첫 화면이 잠깐 비는 깜박임은 시안에서 받아들인다(§7 결정 2).
- `if (ssr) setHubLinks(ssr.banners)`는 그대로 둔다. 허브 링크가 비면 `offerLink`의 마지막 대체 경로가 비어 앱 링크가 `undefined`가 될 수 있다. 시안도 `fetchBanners()`를 받아 `setHubLinks`를 다시 부른다(§3-2).
- 이 변경은 `main.jsx`의 import 한 줄, 트리 한 줄, 하이드레이션 분기 한 줄이다. 완료 조건의 "main.jsx 한 줄 제외"보다 많다. 분기를 안 고치면 화면이 오류를 내므로 **세 줄을 허용해 달라**고 §7에서 묻는다.

`entry-server.jsx`는 고치지 않는다. 서버는 계속 `App`을 그리고, 이 브랜치의 클라이언트가 그것을 버릴 뿐이다.

### 3-6. 분석 이벤트

생략한다(이슈가 허용). `track(...)`을 새로 쏘지 않으므로 `ALLOWED_EVENTS`와 `verify-analytics-event-contract.mjs`는 건드리지 않는다. 대신 프리뷰는 `dev`로 찍혀 운영 집계에 안 섞이므로 클릭 수치로 시안을 비교하지는 못한다. 비교는 눈으로 한다.

## 4. 동반 변경 묶음(`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 해당 | 이번 작업에서 |
| --- | --- | --- |
| 1번 확실성 판정 | 읽기만 | 금액은 `displayBestAmount`, 정렬은 `applyFilters`가 낸다. 어댑터가 판정을 다시 쓰지 않는다. 쓰면 카드 순서와 금액이 어긋나는 묶음이 생긴다 |
| 2~3번 배너 모양·묶음 배너 | 읽기만 | `fetchBanners()`는 허브 링크 용도로만 쓴다. `EventBanner.jsx`는 안 쓰고 안 고친다 |
| 4번 최소주문 출처 | 읽기만 | `minLabel`이 내는 대로 보인다. 지어내지 않는다 |
| 6번 화면에 나가는 글자 | **해당. 위험** | `check-copy.mjs`가 새 폴더를 안 본다(§2). 검사가 못 막으므로 새 문장을 만들지 않는다. 쓰는 문구는 기존 모듈이 내는 값과 기존 화면에 이미 있는 말(예: 필터 라벨)로 한정. "쿠폰 받으러 가기"는 이슈가 정한 말이라 쓰되 §7 결정 1에서 확인을 구한다 |
| 7번 행동 이벤트 | 해당 없음 | 이벤트를 새로 쏘지 않는다 |
| 8번 배포 순서 | 해당 없음 | API를 안 바꾼다. 병합하지 않는다 |
| 9번 새 파일 | 일부 | `docs/PROJECT-STRUCTURE.md`는 푸시 훅이 막으므로 `python scripts/generate_project_structure.py`로 다시 만든다. 새 `*.test.js`는 만들지 않으므로 `package.json`은 안 고친다 |

## 5. 시험과 확인

테스트 파일을 새로 만들지 않는다(버리는 시안이고 로직이 없다). 확인은 아래로 한다.

- `npm test`와 `npm run build`가 통과한다(완료 조건).
- `git diff --stat main -- web/src` 결과가 `web/src/shells/` 아래 파일과 `web/src/main.jsx`뿐이다. 이 줄의 출력을 PR 결과 댓글에 붙인다. 이슈의 명령 `git diff --stat main -- web/src/*.js`는 셸에 따라 `shells/` 안을 못 본다. 경로 전체로 확인한다.
- 360px 스크린샷 둘: 시트가 낮은 상태(요약이 같이 보임), 높은 상태(칩 줄이 머리에 붙음).
- 실제 운영 API로 그려지는지: `VITE_API_BASE_URL`을 운영 값으로 둔 프리뷰에서 카드 수가 0이 아닌지 본다. **카드가 0장이면 "데이터 없음"이 아니라 로딩 실패일 수 있으므로** 브랜드 응답 개수를 개발자 도구 네트워크에서 함께 확인한다.
- 카드 하나를 눌러 앱 링크가 열리는지(쿠팡이츠는 공유 링크, 나머지는 브랜드 링크 또는 앱 검색 링크)를 프리뷰에서 한 번씩 본다.
- 시트 끌기가 실기기(iOS 사파리) 스크롤과 싸우지 않는지. 시트 몸이 맨 위일 때만 아래로 끌어 내려지게 한다. 실기기에서 못 보면 미확인으로 남긴다.

## 6. 구현 순서

1. `data.js`: 기존 모듈 불러서 화면 모양 만들기. 브랜드와 배너 로딩, `setHubLinks` 호출.
2. `BottomSheetShell.jsx`, `Sheet.jsx`, `bottom-sheet.css`: 요약, 시트, 칩 줄, 카드.
3. `main.jsx`: 홈 교체와 하이드레이션 분기(§3-5).
4. `npm test`, `npm run build`, `docs/PROJECT-STRUCTURE.md` 다시 만들기.
5. 브랜치에서 360px 스크린샷, 결과 댓글. `preview/shell-bottom-sheet` push는 사람 또는 sub 세션이 한다(`docs/WORKFLOW.md` §3-3).

## 7. 결정이 필요한 것

1. **"쿠폰 받으러 가기" 문구를 써도 되는가.** 이슈가 정한 말이지만 `docs/COPY-STYLE.md`는 새 문구를 세션이 정하지 않는다고 한다. 승인되지 않으면 기존 카드에 이미 있는 누르는 말로 바꾼다.
2. **첫 화면 깜박임을 받아들이는가.** SSR HTML을 버리고 새로 그리므로 데이터가 올 때까지 잠깐 빈 화면이나 골격이 보인다(`BrandGridSkeleton.jsx`를 재사용할 수는 있으나 시안은 단순 문구 없는 회색 블록으로 한다).
3. **`main.jsx` 세 줄 변경을 허용하는가.** §3-5. 허용하지 않으면 하이드레이션 오류를 안고 가거나(화면은 결국 그려지지만 오류 이벤트가 쏜다) 시안을 SSR이 없는 경로로만 열어야 한다.
4. **확인 시각을 요약에 두는가.** 목표 1을 위해 두는 안이다. `latestCaptured`가 `null`이면(캡처 시각이 없는 응답) 그 자리를 비우고 지어내지 않는다.
- **확인하지 않은 것:** iOS 사파리와 카카오톡 인앱 브라우저에서 시트 끌기와 컨테이너 단위(`cqw`) 글자 배치가 어긋나지 않는지는 보지 않았다. `main.jsx`의 `relayout` 우회는 기존 클래스 이름(`.cc-ticket` 등)만 대상으로 하므로 새 `bs-` 클래스에는 적용되지 않는다. 시안은 `cqw`를 쓰지 않는 쪽으로 만든다.

## 8. 끊기면 무엇이 보이나

- `setHubLinks`를 안 부르면: 화면과 테스트는 멀쩡하다. 오퍼에 자기 링크도 브랜드 링크도 없는 카드만 눌러도 앱이 안 열린다. 카드를 여럿 눌러 봐야 드러난다.
- 하이드레이션 분기를 안 고치면: 화면은 결국 그려지지만 콘솔에 하이드레이션 오류가 나고 오류 이벤트가 쏜다. 프리뷰는 `dev`로 찍혀 운영 오류 수치에는 안 섞인다.
- 어댑터가 금액을 직접 계산하면: 정렬 순서와 카드 금액이 어긋나고 특정메뉴 쿠폰의 4,999원이 진짜 가격처럼 찍힌다(1번 묶음).
- 브랜드 응답이 비어 카드 0장이면: "할인이 없다"로 읽힌다. 로딩 실패와 실제 0건을 같은 화면으로 두면 시안 비교가 틀어진다. 실패 상태와 빈 상태를 따로 그린다.
