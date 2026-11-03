# 293 홈 리뉴얼 시안: 포트폴리오 톤 심플 모던 (portfolio-modern)

이슈: [#293](https://github.com/woowacourse-teams/2026-to-discount/issues/293). 묶음 이슈 #230. 웹만 바꾼다. API 변경 없음.

## 결론

**버리는 시안이다. 병합하지 않는다.** PR은 초안으로 두고 프리뷰(`preview/shell-portfolio-modern`)만 본다. 기존 로직 파일은 한 줄도 고치지 않고, 새 화면 `PortfolioModernShell`을 `web/src/shells/portfolio-modern/` 아래에만 만든다. 홈 진입만 `main.jsx`에서 이 브랜치 한정으로 바꾼다.

- 데이터는 기존 모듈이 계산한 값을 어댑터(`data.js`) 한 곳에서 화면용 모양으로 옮기기만 한다. 계산 로직은 어댑터에 두지 않는다.
- 화면은 위에서 아래로 세 덩어리: 맨 위 요약(overline + 큰 숫자 3칸), 신뢰 줄(갱신 시각), 흰 카드 목록.
- 누를 곳(받으러 가기)은 카드 오른쪽 아래에 늘 보이게 둔다. 기존 `offerLink`로 실제 앱 링크를 연다.

## 배경

리뉴얼 목표(사용자 2026-11-03, 우선순위 순): ① 값이 언제 어디서 나왔는지 믿을 수 있는 화면, ② 얼마, 어느 앱, 조건을 빠르게 전하고 강조, ③ 누를 곳을 빨리 보여 클릭률과 재방문율 향상. 시안 여러 개를 프리뷰로 비교해 좋은 부분만 모은다.

코드 읽기로 확인한 사실:

- `web/src/shells/`는 이 브랜치의 기준(main)에 아직 없다. 앞선 시안(#282, #284)은 다른 브랜치에 있다. 이 시안은 그 파일에 기대지 않는다.
- 홈은 서버가 그린 HTML을 하이드레이션한다(`main.jsx:95`, `entry-server.jsx:40`). 서버는 `App`을 그린다. 껍데기로 바꾸면 서버 HTML과 첫 클라이언트 트리가 어긋난다.
- 화면에 갱신 시각을 그리는 곳이 지금 없다. `capturedAt`은 정렬(`latestCaptured`)에만 쓰인다.
- `npm test`는 `src/` 아래 `*.test.js`를 재귀로 전부 돈다(`web/scripts/run-node-tests.mjs`). `shells/` 아래 테스트는 `package.json`에 따로 적지 않아도 돈다.

## 변경

모두 새 파일이다. 기존 파일은 `main.jsx`만 바꾼다.

### 새 파일

- `web/src/shells/portfolio-modern/PortfolioModernShell.jsx`: 화면. 불러오기, 요약, 신뢰 줄, 카드 목록.
- `web/src/shells/portfolio-modern/data.js`: 얇은 어댑터. 기존 모듈 호출과 필드 이름 바꾸기만 한다.
- `web/src/shells/portfolio-modern/portfolio-modern.css`: 스타일 한 파일. 새 의존성 없음.
- `web/src/shells/portfolio-modern/data.test.js`: 어댑터 시험(아래 "테스트").

### `data.js`: 어댑터가 하는 일

입력은 `fetchBrands()`와 `fetchBanners()`가 준 값 그대로다. 아래 표의 왼쪽을 오른쪽 모듈이 이미 계산한다. 어댑터는 부르고 담기만 한다.

| 화면 값 | 읽는 모듈 | 비고 |
| --- | --- | --- |
| 카드 순서 | `sortBrands(applyFilters(brands, defaultFilters()), { sorts: defaultFilters().sorts, include })` | `include`는 `includesFrom(defaultFilters())`. 카테고리 칩을 쓰면 `CATEGORIES`의 키를 `categories`에 넣는다. |
| 대표 금액 | `displayBestAmount(offers, include)` | 4,999원 정렬 천장을 쓰지 않는 쪽이다. 없으면 `null`. |
| 대표 오퍼 | `splitOffers(offers, include).best[0]` (`couponModel.js`) | 금액, 앱, 링크, 조건이 한 오퍼에서 나와야 어긋나지 않는다. |
| 금액 글자 | `amountText(offer)` | 어댑터가 뒤에 " 할인"을 붙인다(사용자 2026-11-03: "n원 할인"). 묶음 행사는 원문 그대로. |
| 조건 배지 | `chipsOf(offer).filter(onCard)` 후 `headOrder` | 채널, 멤버십, 한정, 첫 주문 순서는 기존 규칙. |
| 최소주문 | `minLabel(offer.minOrderAmount)` | `null`이면 어댑터가 "최소주문 미확인"을 담는다(아래 "모름과 없음"). |
| 앱 링크 | `offerLink(offer, brand.links, brand.name)` | 쿠팡이츠 허브 링크는 `setHubLinks(banners)`를 먼저 불러야 쓴다. |
| 갱신 시각 | `latestCaptured(offers)` | 화면 시각은 어댑터가 만들지 않고 값 그대로 넘긴다. 글자 변환은 컴포넌트 한 함수. |
| 오늘 인기 | `popularToday(brands)` | 3곳 미만이면 `popularToday` 쪽 규칙(`STRIP_MIN`)대로 그리지 않는다. |

`splitOffers`가 `couponModel.js`에서 나오지만 이슈의 읽기 목록에 이름이 없다. 금액과 링크가 한 오퍼에서 나오게 하려는 선택이고, 읽기만 하므로 규칙 위반이 아니다(**열린 질문 1**).

### 화면 (360px 기준)

위에서 아래 순서다. 첫 화면에 ①②③ 목표와 시안 개념이 모두 보여야 한다.

1. **overline + 큰 제목:** 작은 대문자 라벨 "오늘의 할인"(overline) 아래 큰 제목. 제목 문구는 세션이 정한다(임시).
2. **숫자 요약 3칸:** 옅은 주색(7%) 상자 안에 굵은 주색 숫자 셋. 칸은 `전체 오퍼 수`, `최고 할인액`, `앱 수` 등 이미 있는 값에서 센다(아래 "요약 3칸 값").
3. **신뢰 줄:** 요약 바로 아래 한 줄. 마지막 갱신 시각(`latestCaptured`)을 "n분 전 갱신" 꼴로 보인다. 시각이 없으면(`null`) 줄을 그리지 않고 칸을 비우지도 않는다. 모르는 값을 시각처럼 보이게 하지 않는다.
4. **카테고리 칩(선택):** `CATEGORIES`를 가로 스크롤 칩으로. 넘치면 칩 줄만 스크롤하고 문서는 스크롤하지 않는다.
5. **흰 카드 목록:** 한 브랜드가 카드 한 장.
   - 윗줄: 로고(`logoSrc`/`logos.jsx`가 쓰던 경로 그대로), 브랜드 이름, 앱 이름.
   - 금액 줄: "n원 할인" 주색 굵게. 가장 크게.
   - 배지 줄(금액 아래, 사용자 2026-11-03): 쿠팡와우, n시 오픈, 포장 등 `chipsOf` 결과. 넘치면 줄바꿈하고 자르지 않는다.
   - 조건 줄: 최소주문. 모르면 "최소주문 미확인".
   - 오른쪽 아래: "받으러 가기" 텍스트 버튼. 카드 전체도 같은 링크를 연다.
6. **다크 모드:** `prefers-color-scheme: dark`. 주색 #5CB8FF, 배경과 카드는 어두운 값으로 바꾼다. 대비는 스크린샷으로 본다.

디자인 값(이슈 개념): 글꼴 Pretendard(이미 쓰는 글꼴 경로가 있으면 그대로, 없으면 시스템 글꼴로 떨어짐), 주색 #0B5CAD, 배경 #F4F6F9, 반경 14~16px.

### 모름과 없음 (사용자 결정 2026-11-03)

| 상태 | 그리는 것 |
| --- | --- |
| 그 앱에 오퍼가 없음 | `-` |
| 오퍼는 있는데 값을 모름 | 기존 정식 라벨. 최소주문이면 "최소주문 미확인" |
| 금액이 `null` | 어댑터가 `amountText`의 `rawText` 대체를 그대로 쓴다. 0원으로 만들지 않는다. |

"최소주문 미확인"은 `couponModel.js`가 이미 내는 라벨이라 새 문구가 아니다(`conditionTable`의 `min`). 단 `docs/COPY-STYLE.md` 5번(모르면 비운다)과 "미확인"이 수집기 말이라는 4번이 겉으로 부딪히는데, 이슈 결정이 이 라벨을 명시했고 운영 화면에도 이미 있는 문구다.

### 요약 3칸 값

새 계산을 만들지 않는 선에서, 목록 변수에서 바로 세거나 읽는 값만 쓴다.

- 칸 1: 지금 목록의 브랜드 수 (`list.length`).
- 칸 2: 가장 큰 `displayBestAmount` ("n원 할인", 어느 브랜드인지는 칸 아래 작은 글자).
- 칸 3: 오늘 인기 1위 브랜드 이름(`popularToday(brands)[0]`). 3곳 미만이면 이 칸 대신 앱 수.

각 칸의 `null`은 `-`가 아니라 칸을 통째로 다른 값으로 대체한다. 모르는 값에 숫자를 지어내지 않는다. 칸 구성은 시안용 임시이고 **열린 질문 2**다.

### `main.jsx`: 한 곳만, 이 브랜치 한정

```diff
-import App from './App.jsx'
+import App from './App.jsx'
+import PortfolioModernShell from './shells/portfolio-modern/PortfolioModernShell.jsx'
...
-    <ErrorBoundary><App initial={ssr} /></ErrorBoundary>
+    <ErrorBoundary><PortfolioModernShell /></ErrorBoundary>
```

- `import App`과 `window.__legacyApp = App` 한 줄은 **반드시 남긴다**. 빼면 빌드가 쿠폰 카드 CSS 조각을 안 만들어 `ssr-template.mjs`가 실패하고 프리뷰 배포가 깨진다(#254, #280, #289 결정).
- `setHubLinks(ssr.banners)`는 껍데기가 `fetchBanners()` 뒤 직접 부르므로 `ssr`이 없는 경우에도 문제없다. 이 줄은 건드리지 않는다.
- 하이드레이션: 서버는 `App`을 그린다. 껍데기를 하이드레이션하면 불일치가 난다. 프리뷰에서 불일치가 보이면 `main.jsx`에서 `const ssr = window.__SSR__`를 `null`로 두는 한 줄을 더 바꿔도 된다(이슈 결정). 그 경우 PR 본문에 적는다. 이때 `createRoot`로 새로 그리므로 서버 HTML 위에 덮어 쓴다. 처음부터 이 한 줄을 넣을지는 구현자가 프리뷰에서 불일치가 나는지 보고 정한다.
- `entry-server.jsx`는 고치지 않는다. 서버는 계속 `App`을 그린다. 시안은 병합하지 않으므로 서버 쪽 맞춤은 이 이슈의 범위 밖이다.

## 클릭 동작

- 카드 전체와 "받으러 가기" 버튼이 같은 `offerLink(...)` 결과를 연다. `target="_blank" rel="noopener noreferrer"`.
- 쿠팡이츠 오퍼는 `offerLink`가 `coupangeats://` 또는 공유 링크를 준다. `openWithNotice`(앱이 안 열릴 때 4초 뒤 공유 링크로 넘기는 보조)는 쓰지 않는다. 시안이 단순 `<a>`로 여는 것이 의도다. 쿠팡이츠 앱 딥링크가 막히는 환경은 프리뷰에서 구현자가 한 번 눌러 보고 PR에 적는다(**열린 질문 3**).
- 분석 이벤트(`track`)는 생략한다. 시안 클릭이 운영 집계에 섞이지 않게 하려는 면도 있다. 이벤트를 쏘면 `ALLOWED_EVENTS`와 대조 스크립트(7번 묶음)를 건드리게 된다.

## 변경 전파 확인 (`docs/CHANGE-PROPAGATION.md`)

- **1번 확실성:** 판정을 새로 짜지 않는다. 어댑터가 `sortBrands`, `displayBestAmount`, `splitOffers`를 그대로 부르므로 카드 순서와 대표 금액이 운영과 같은 규칙이다. 배지는 `chipsOf`에서 나와 판정표와 어긋날 일이 없다. 끊기면: 특정메뉴 쿠폰뿐인 브랜드가 맨 위에 서는데, `displayBestAmount`가 `comparable`로 거르고 정렬은 `sortBrands`가 하므로 해당 없음. 어댑터 시험으로 한 번 박는다.
- **2번 배너 모양, 3번 묶음 배너:** 배너는 허브 링크(`setHubLinks`)에만 쓴다. 배너 카드는 그리지 않는다.
- **4번 최소주문 출처:** 값은 만들지 않고 모르면 "최소주문 미확인". 지어내지 않는 원칙과 같다.
- **6번 화면에 나가는 글자:** 해당. 새 문구가 생긴다. 이슈 결정으로 시안용 임시 문구는 세션이 정해도 되고, 대신 수집기 말("확인", "미확인", "판독", "관측" 등)을 **새로** 만들지 않는다. 쓸 임시 문구: "오늘의 할인"(이슈가 정한 overline), "n분 전 갱신", "받으러 가기"(이슈가 정함). "갱신"은 `COPY-STYLE` 금지 목록에 없다. 기존 라벨 "최소주문 미확인"은 새로 만든 것이 아니다. `check-copy.mjs`(`npm run test:copy`)가 JSX 글자에서 시각 뒤 `오픈` 누락을 잡으므로 JSX에 시각 글자를 직접 쓰지 않는다.
- **7번 행동 이벤트:** 새 이벤트도 속성도 없다. `track(...)`을 부르지 않는다.
- **8번 배포 순서:** 웹만이라 순서 제약 없음. 프리뷰 먼저(`docs/WORKFLOW.md` §3-3). 병합하지 않으므로 운영에 가지 않는다.
- **9번 새 파일:** 구조 문서를 다시 만든다(`python scripts/generate_project_structure.py`, 커밋 전, 이슈 결정). 테스트는 `src/` 재귀로 돌아 `package.json` 수정이 필요 없다.
- **암묵 묶음:** 어댑터 필드 이름과 컴포넌트가 읽는 이름이 같아야 한다(이름의 커네선스). `data.test.js`가 어댑터 출력 모양을 박아 한쪽만 고치면 깨지게 한다.

## 하지 않는 것

- 기존 로직 파일 수정: `api.js`, `filters.js`, `couponModel.js`, `offerLink.js`, `popularStrip.js` 등 `web/src/*.js`는 diff 0줄.
- `App.jsx`와 다른 컴포넌트 삭제나 수정.
- 새 npm 의존성, 둘 이상의 CSS 파일, `styles/`나 `App.css` 수정.
- 필터 시트, 숨김, 검색, 푸시 알림, 설문 같은 기존 기능 이식. 시안은 홈의 첫 화면만 다룬다.
- 분석 이벤트.
- 서버 렌더(`entry-server.jsx`) 맞춤.

## 테스트

`web/src/shells/portfolio-modern/data.test.js`(node:test). 화면 없이 어댑터만 시험한다.

- 양성 신호: 운영 API 모양을 흉내 낸 고정 입력으로 먼저 어댑터가 브랜드를 한 장 이상 내는지 본다. 비어 있어서 아래 시험이 비어 통과하는 일을 막는다.
- 대표 금액이 `displayBestAmount`와 같다. 특정메뉴 한정 쿠폰뿐인 브랜드는 4,999원이 아니라 `null`이다.
- 금액 글자가 "n원 할인"이다. 묶음 행사는 원문을 쓰고 " 할인"을 붙이지 않는다(**열린 질문 4**).
- `minOrderAmount`가 `null`이면 "최소주문 미확인", 0이면 기존 라벨 "최소주문 없음", 숫자면 숫자 라벨이다.
- 그 앱에 오퍼가 없는 칸은 `-`이고, 오퍼는 있는데 최소주문을 모르는 칸은 "최소주문 미확인"이다. 둘이 같지 않다.
- 링크가 `offerLink`와 같다. 쿠팡이츠 오퍼는 `setHubLinks` 뒤에도 사람이 넣은 공유 링크 규칙을 따른다.
- `capturedAt`이 전부 없으면 갱신 시각이 `null`이고 컴포넌트가 줄을 그리지 않는다.
- `git diff --stat main -- web/src/*.js`가 비어 있다(셸 명령으로 확인, 시험 파일이 아님).

실행: `cd web && npm test`와 `npm run build`. 새 시험 이름이 출력에 나오는지 본다.

## 확인 (구현자)

- 360px 스크린샷(필수, 결과 댓글에 남김): 첫 화면에 overline, 큰 숫자 3칸, 첫 카드가 보인다. 라이트와 다크 둘 다.
- `document.documentElement.scrollWidth <= 360`을 브라우저에서 읽어 출력으로 남긴다. 버튼과 금액 칸이 잘린 시안이 있었다(#282, #284).
- 실제 운영 API 데이터로 그려진다. 카드와 "받으러 가기"를 눌러 앱 링크가 열린다. 배민 한 건과 쿠팡이츠 한 건을 누른다.
- 최소주문을 모르는 오퍼가 있으면 "최소주문 미확인"이 뜨고, 오퍼가 없는 칸은 `-`다. 운영 데이터에 해당 경우가 없으면 `미확인`으로 PR에 적는다.
- 하이드레이션 불일치 경고가 콘솔에 있는지 본다. 있으면 `main.jsx`의 `ssr` 무시 한 줄을 넣고 PR 본문에 적는다.
- PR 본문 맨 위에 프리뷰 주소 `https://beggars-git-preview-shell-portfolio-modern-nn98s-projects.vercel.app`를 적고, 초안으로 둔다. `preview/shell-portfolio-modern` push는 sub 세션이나 사람이 한다.

## 열린 질문

1. `splitOffers`(`couponModel.js`)를 읽어도 되는가? 이슈 목록에 이름이 없지만 같은 파일이고 읽기만 한다. 안 되면 대표 오퍼는 `sortingAmount` 기준으로 오퍼를 직접 고르는 코드가 어댑터에 생기는데, 그건 계산 로직이다.
2. 요약 3칸 구성(브랜드 수, 최고 할인액, 인기 1위)이 맞는가? 시안용 임시이고 바꿔도 구조는 같다.
3. 쿠팡이츠를 `openWithNotice` 없이 단순 `<a>`로 열어도 되는가? 앱이 안 열릴 때 보조가 없다.
4. 묶음 행사("징거버거 1+1")에는 " 할인"을 붙이지 않는 것이 맞는가? 붙이면 "1+1 할인"이 되어 뜻이 어색하다.
5. 갱신 시각 줄 "n분 전 갱신"을 새 문구로 둬도 되는가? `COPY-STYLE` 3번은 새 문구를 개발자에게 묻게 하고, 이슈 결정은 시안용 임시 문구를 세션에 맡겼다. 이 문구가 시안 비교 뒤 살아남을 때 다시 묻는다.
