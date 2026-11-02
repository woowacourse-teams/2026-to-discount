# 241: 홈 리뉴얼 시안 - 초압축 목록 (compact)

- 이슈: [#241](https://github.com/woowacourse-teams/2026-to-discount/issues/241) (묶음 이슈 #230)
- 상태: 설계 초안(승인 대기)
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 프리뷰만 본다.
- 범위: `web/src/shells/compact/`(새 폴더), `web/src/main.jsx` 두 줄. 그 밖은 0줄.

## 1. 문제

리뉴얼 목표 세 가지(사용자 2026-11-03, 우선순위 순)를 이 시안의 개념으로 시험한다.

1. 화면의 신뢰성: 값이 언제 확인됐는지.
2. 핵심(얼마, 어느 앱, 조건)을 빨리 전하고 강조.
3. 누를 곳(쿠폰 받으러 가기)을 빨리 보여 클릭률과 재방문율을 올림.

이 시안의 개념은 **이미지 없는 한 줄 목록**이다. 브랜드 · 큰 금액 · 앱 아이콘 · 조건 한 단어. 한 화면에 20줄 이상.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 홈이 서버 렌더 HTML을 하이드레이션하는가 | 한다. `window.__SSR__`가 있으면 `hydrateRoot`, 없으면 `createRoot` | `web/src/main.jsx:95,111-131` |
| 홈 트리를 바꾸면 하이드레이션이 어긋나는가 | 어긋난다. 서버 HTML은 `App`으로 그려져 있고 클라이언트 트리는 `CompactShell`이다. React가 서버 HTML을 버리고 클라이언트에서 다시 그리며 `onRecoverableError`가 불린다 | `main.jsx:112`, `entry-server.jsx`는 `App`을 그림 |
| 데이터를 부르는 함수 | `fetchBrands()`, `fetchBanners()`. 배너는 `window.__bannersEarly`가 있으면 그 응답을 한 번 쓴다 | `web/src/api.js` |
| 링크 사다리 | `offerLink(offer, brand.links, brand.name)`. 쿠팡이츠 허브 링크는 `setHubLinks(banners)`가 먼저 불려야 선다 | `offerLink.js:164,184`, `App.jsx:279-281` |
| 클릭 때 쿠팡이츠 안내 | `openWithNotice(e, href)`가 쿠팡이츠 링크에서 기본 이동을 막고 안내를 띄운 뒤 연다. 이슈가 부르라고 한 모듈에는 없지만 같은 파일(`offerLink.js`)에 있다 | `offerLink.js:106`, `CouponCard.jsx:63` |
| 브랜드별 최고 오퍼를 가르는 규칙 | `splitOffers(offers, include)`가 `best`(동점이면 전부)와 `rest`를 낸다. 운영 카드와 같은 규칙이다 | `couponModel.js:18` |
| 값이 확인된 시각 | `offer.capturedAt`. `latestCaptured(offers)`가 가장 최근 값을 낸다. 지금 어떤 `.jsx`도 이 시각을 화면에 그리지 않는다 | `filters.js:289`, `web/src/*.jsx` 검색 |
| 문구 검사가 새 폴더를 보는가 | **안 본다.** `check-copy.mjs`는 `src/*.jsx`만 읽고 하위 폴더로 내려가지 않는다 | `web/scripts/check-copy.mjs:9` |
| 새 테스트 파일이 돌아가는가 | 돈다. `run-node-tests.mjs`가 `src/` 아래 `*.test.js`를 재귀로 전부 돈다 | `web/scripts/run-node-tests.mjs:12-19` |
| 분류 탭 | `CATEGORIES`(7개)와 `visibleCategories`. 전체는 "분류를 아무것도 안 고른 상태" | `filters.js:15,32` |

## 3. 결정

### 3-1. 파일

모두 `web/src/shells/compact/` 아래.

| 파일 | 역할 |
| --- | --- |
| `CompactShell.jsx` | 홈 한 화면. 데이터를 받고 줄을 그린다 |
| `data.js` | 기존 모듈을 불러 화면용 모양으로 바꾸는 얇은 어댑터. 계산 로직 금지 |
| `compact.css` | 이 시안의 CSS 하나. 클래스는 모두 `cp-` 접두사 |
| `data.test.js` | 어댑터 시험(§6) |

`main.jsx`는 §3-6의 두 줄만 바꾼다.

### 3-2. 한 줄의 모양(360px)

브랜드마다 줄 하나. 줄 높이 약 30px, 글자 이미지 없음(브랜드 로고 안 씀).

```
[브랜드 이름 …(말줄임)] [조건] [최소주문↑]  [10,000원] [앱]
```

| 칸 | 값 | 출처 |
| --- | --- | --- |
| 브랜드 | `brand.name`. 길면 말줄임 | `api.js` 응답 |
| 조건 | 칩 한 개의 글자. 둘 이상이면 뒤에 `+n` | `chipsOf` (§3-4) |
| 최소주문 | `minLabel(offer.minOrderAmount)`에 `↑`. `null`이면 칸을 그리지 않는다 | `couponModel.minLabel` |
| 금액 | `amountText(offer)`. 크고 굵게. 품절이면 취소선과 기존 라벨 "품절" | `couponModel.amountText` |
| 앱 아이콘 | 최고 오퍼마다 `PlatformBadge` 하나(동점이면 앱 수만큼) | `logos.jsx`의 `PlatformBadge` |

- 최소주문은 줄이되 숨기지 않는다. 이슈 지침("금액, 조건은 줄이되 숨기지 않는다")을 따른다.
- 모르는 최소주문(`null`)에 "미확인"을 새로 쓰지 않는다. `minLabel`이 `null`을 주는 것은 "모르면 비운다"(`docs/COPY-STYLE.md`)이고, 줄에서는 칸을 비운다. 비어 있다는 사실이 화면에 안 보이는 한계는 §8에 적는다.
- 줄 안 모든 칸은 한 줄에서 넘치면 이름 칸이 먼저 줄어든다. 금액, 조건, 아이콘은 안 자른다.

### 3-3. 어느 브랜드를 어떤 순서로

- 필터와 정렬은 기본값을 쓴다: `defaultFilters()` → `applyFilters(brands, filters)`. 5,000원 미만 거르기, 신규 앞세우기가 운영 홈과 같이 적용된다.
- 분류 한 줄 스크롤 띠: `CATEGORIES` 7개와 "전체". 하나만 고르고 다시 누르면 전체. 검색, 시트, 정렬 바꾸기는 이 시안에서 뺀다(스캔 속도 시안이라 목록 외 조작을 줄임).
- 줄을 만들 때 오퍼 고르기: `splitOffers(brand.offers, includesFrom(filters))`의 `best`.
  - `best`는 운영 카드와 같은 규칙이므로 **최고 판정(묶음 1번 확실성)을 이 시안이 새로 짜지 않는다.** `splitOffers`는 이슈가 열거한 함수 목록에 없지만 같은 폴더가 아닌 기존 모듈의 기존 내보내기이고, 쓰지 않으면 `data.js`에 최고 오퍼 고르기를 새로 짜야 한다. 이쪽이 이슈의 "로직을 새로 짜지 않는다"에 더 가깝다고 본다. 승인 필요(§9).
  - 동점 최고가 여럿이면 줄은 하나, 아이콘이 여럿이다.

### 3-4. 조건 한 단어

`chipsOf(offer)`에서 카드에 뜨는 오퍼 칩(`onCard`)을 `headOrder`로 세운다. 단 `kind === 'condition'`(예: "첫 주문")은 맨 앞으로 올린다.

- 이유: `headOrder`는 채널(배달, 포장), 멤버십을 앞에 둔다. "첫 주문 + 포장" 쿠폰이 "포장"만 보이면 첫 주문이 아닌 사람이 눌러 쓰지 못한다. 자격을 가르는 조건이 채널보다 먼저여야 한다.
- 첫 칩의 `text`를 칸에 쓰고, 칩이 둘 이상이면 `+n`을 붙인다. `+n`은 숫자뿐이라 새 문구가 아니다.
- 줄 전체의 `aria-label`에는 칩 글자를 모두 담는다. 화면에서 줄인 조건이 스크린 리더에는 남는다.
- 칩이 없으면 칸을 그리지 않는다. 칩이 없다는 뜻은 "조건 없음"이 아니라 "칩으로 올릴 조건이 없음"이다. 오퍼의 `conditions` 문장은 줄에 안 나온다. §8.

### 3-5. 눌렀을 때

- 줄의 금액과 이름 영역은 `<a href={offerLink(best[0], brand.links, brand.name)}>`. 앱 아이콘은 오퍼마다 자기 `offerLink`로 가는 별도 `<a>`(동점 오퍼가 다른 앱이라 링크가 다르다).
- 클릭 처리는 `CouponCard.jsx`의 `OfferLinkA`와 같다: 웹 주소면 `target="_blank" rel="noreferrer"`, 커스텀 스킴이면 같은 탭. `onClick`에서 `openWithNotice(e, href)`를 부른다. 이것을 빼면 쿠팡이츠가 안내 없이 열리고 `link_fallback`도 안 남는다(`offerLink.js:106-145`).
- `offerPrompt` 옵션은 켜지 않는다. 푸시 권장 창 같은 부수 효과를 시안에 들이지 않는다.
- 분석 이벤트(`track`)는 생략한다(이슈가 허용). 이 시안의 클릭률은 프리뷰라 `dev`로 찍히고 운영 집계에 안 섞이므로, 지금은 눈으로 보는 시안이다.
- 줄 높이 30px는 손가락 목표 크기 권장(44px)보다 작다. 줄 전체 너비가 눌리는 영역이어도 세로가 작다. §8, §9.

### 3-6. 신뢰성 표시: 확인 시각

목표 1(신뢰성)을 시안 안에서 시험하려면 목록 위에 시각이 하나 있어야 한다.

- 위치: 분류 띠 위 한 줄.
- 값: `latestCaptured`로 구한 `capturedAt` 중 가장 최근 값(브랜드 전체의 모든 오퍼). 월.일 시:분(한국 시각)으로 그린다. 상대 시간("N분 전")은 쓰지 않는다. 계산이 필요하고, 새벽에 낡은 값이 "방금"으로 읽히는 오해는 절대 시각이 막는다.
- `data.js`는 `Date`를 문자열로 바꾸는 것까지만 한다. 한국 시각 변환은 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ... })` 한 번.
- `capturedAt`이 없으면(모든 오퍼에서 `null`) 줄을 그리지 않는다. 없는데 비슷한 시각이나 지금 시각을 대신 쓰지 않는다. 지금 시각을 쓰면 값이 언제 확인됐는지 거짓이 된다.
- **문구는 정해지지 않았다.** 시각 뒤에 붙일 말(예: "기준")은 새 문구라 세션이 정하지 않는다(`CHANGE-PROPAGATION.md` 6번). §9에서 묻는다. 승인 전 구현은 시각 숫자만 그린다.

### 3-7. `main.jsx` 변경은 두 줄

이슈는 "main.jsx 한 줄 제외"라 했지만 import와 사용 두 줄이 필요하다. 이 차이는 이슈 쪽 기준에서 같은 한 가지 변경이므로 두 줄까지 허용으로 읽는다. 승인 필요(§9).

```diff
-import App from './App.jsx'
+import CompactShell from './shells/compact/CompactShell.jsx'
 ...
-    <ErrorBoundary><App initial={ssr} /></ErrorBoundary>
+    <ErrorBoundary><CompactShell initial={ssr} /></ErrorBoundary>
```

- `App` import를 지우지 않고 한 줄을 더하는 방법도 있지만 이슈의 "App.jsx는 지우지 않는다"는 파일에 대한 말이다. 안 쓰는 import는 린트에 걸릴 수 있어 바꾸는 쪽을 택한다.
- `initial={ssr}`을 그대로 넘기면 `CompactShell`이 `initial.brands`, `initial.banners`로 첫 화면을 그릴 수 있다. 서버 HTML과 클라이언트 트리가 다르므로 React가 서버 HTML을 버린다(§2). 화면은 맞게 그려지지만 첫 그림이 서버 HTML(운영 카드)이었다가 바뀌는 깜박임이 있다. 시안 비교용이라 허용한다. 모양을 고치려면 `hydrateRoot`를 `createRoot`로 바꾸는 줄이 더 필요해 이슈의 diff 한도를 넘는다.
- `setHubLinks`는 `main.jsx`가 `ssr.banners`로 이미 한 번 부른다(`main.jsx:96`). `CompactShell`은 `fetchBanners()`를 받은 뒤 한 번 더 부른다(`App.jsx:279-281`과 같은 순서). 이것을 빠뜨리면 쿠팡이츠 허브 링크가 안 서고 링크가 `COUPANGEATS_LINK` 기본값으로 떨어진다.

## 4. 동반 변경 묶음(`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 해당 | 이번 작업에서 |
| --- | --- | --- |
| 1번 확실성 판정 | 해당(읽기만) | `splitOffers`와 `displayBestAmount`를 불러 쓰고 새 판정을 안 짠다. 웹판 판정 자리를 건드리지 않으므로 `filters.test.js`와 판정표는 그대로 초록이어야 한다 |
| 2번 배너 모양, 3번 묶음 배너 | 해당 없음 | 배너 카드를 그리지 않는다. 배너는 쿠팡이츠 허브 링크용으로만 받는다 |
| 4번 최소주문 | 해당(읽기만) | 모르는 값은 칸을 비운다. 지어내지 않는다 |
| 6번 화면 글자 | **해당** | 새 문구를 세션이 정하지 않는다. 재사용하는 글자(칩, "품절", 분류 이름, "전체")만 쓴다. 신뢰성 줄의 문구는 §9 질문. `check-copy.mjs`가 하위 폴더를 안 보므로 자동 검사가 못 막는다. 구현자는 `shells/compact/*.jsx`의 JSX 텍스트를 손으로 훑어 평서형 "…다."와 금지어 8개가 없는지 확인한다 |
| 7번 행동 이벤트 | 해당 없음 | `track`을 부르지 않는다. 새 이벤트 이름이 없으므로 허용 목록과 대조 스크립트가 그대로 초록이다 |
| 8번 저장소 경계와 배포 순서 | 해당 | API는 안 바뀐다. 웹은 프리뷰만, 병합 안 함. 프리뷰 브랜치 이름은 `preview/shell-compact` |
| 9번 새 파일 | 해당 | `data.test.js`는 `run-node-tests.mjs`가 재귀로 돌려 `package.json`을 안 고친다. 구조 문서 `docs/PROJECT-STRUCTURE.md`를 `python scripts/generate_project_structure.py`로 다시 만든다. 안 하면 푸시 훅이 막는다 |
| 5번 알림 | 해당 없음 | |

## 5. 하지 않는 것

- `web/src/*.js` 기존 로직 파일과 `App.jsx` 등 기존 컴포넌트를 고치지 않는다.
- 새 npm 의존성, 새 이벤트, 새 API 필드, 서버 변경이 없다.
- 줄 펼치기(상세), 공유 버튼, 숨김, 신고, 푸시 설정, 설문, 바닥글을 이 시안에 안 넣는다.
- 브랜드 로고 이미지를 안 쓴다. 쓰면 시안의 개념("이미지 없이 글자 위주")이 무너진다.

## 6. 시험

### `web/src/shells/compact/data.test.js`(새 파일, `node:test`)

`data.js`는 `.js`라 `node --test`로 돈다(`.jsx`는 못 읽는다, `logos.jsx` 주석). 기존 모듈을 그대로 불러 쓰므로 어댑터만 시험한다.

- 줄 만들기 입력은 `filters.test.js`가 쓰는 브랜드 모양 픽스처를 따른다. 구현자가 그 파일의 픽스처 모양을 보고 같은 형태로 만든다.
- 최고 오퍼: 동점 최고가 둘(앱이 다름)이면 줄은 하나이고 오퍼 목록이 둘이다.
- 최고가 없는 브랜드(특정메뉴뿐): `splitOffers`의 `hasBest: false` 대표가 줄에 서고, 금액에 4,999 정렬값이 안 찍힌다(`amountText`가 액면을 낸다).
- 품절: 줄의 `soldOut`이 참이고 금액 글자는 `amountText` 그대로(취소선은 CSS 몫).
- 묶음 행사(`kind: 'bundle'`): 금액 글자가 `rawText`이고 정렬값(15,000)이 아니다.
- 조건 칸: "첫 주문 + 포장" 오퍼는 첫 글자가 "첫 주문", 둘째가 `+1`. 칩 없는 오퍼는 조건이 `null`.
- 최소주문: `minOrderAmount`가 `0`이면 `minLabel(0)`의 글자, `null`이면 `null`.
- 확인 시각: 여러 오퍼의 `capturedAt` 중 가장 큰 값이 한국 시각 월.일 시:분으로 나온다. 모두 없으면 `null`(현재 시각을 대신 쓰지 않는다). UTC 15시가 한국 시각 다음 날 0시로 넘어가는 경계를 하나 넣는다.
- 링크: 쿠팡이츠 오퍼가 `offerLink`의 사다리를 따르는지는 `offerLink.test.js`가 이미 본다. 어댑터는 `offerLink(offer, brand.links, brand.name)`을 부르는 인자 순서만 시험한다(순서가 바뀌면 브랜드 링크가 이름 자리로 들어간다).

### 변경이 번지지 않았는지

- 구현이 끝나면 `git diff --stat main -- web/src` 출력에서 `web/src/shells/` 밖은 `main.jsx` 하나뿐이어야 한다. 이슈의 완료 조건이고, 결과 댓글에 출력을 붙인다.
- `cd web && npm test`와 `npm run build`가 통과해야 한다. 빌드는 `App`을 prerender하므로 `main.jsx`를 바꿔도 `entry-server.jsx`는 그대로다.

### 눈으로 보는 확인

테스트는 화면을 안 본다. 아래는 프리뷰에서 사람이나 구현 세션이 직접 본다.

- 360px 스크린샷에서 첫 화면에 줄이 몇 줄 보이는지 센다. 높이는 `360×800`으로 찍고 줄 수와 높이를 결과 댓글에 적는다. 20줄에 모자라면 모자란다고 적는다. 줄 높이를 억지로 줄여 숫자를 맞추지 않는다.
- 실제 운영 API로 그려지는지(`VITE_API_BASE_URL`이 운영을 가리키는 프리뷰인지 먼저 확인한다).
- 쿠팡이츠 줄을 눌러 안내가 뜨는지, 배민 줄이 `baemin://`나 브랜드 링크로 가는지.
- 브라우저 콘솔의 하이드레이션 경고가 시안 때문이라는 것을 결과 댓글에 한 줄로 적는다(§3-7).

## 7. 대안과 버린 이유

| 대안 | 버린 이유 |
| --- | --- |
| 오퍼마다 한 줄(브랜드 반복) | 줄이 브랜드 수의 몇 배가 되어 "한 화면 20줄"의 뜻이 약해진다. 앱별 비교는 아이콘이 맡는다 |
| 최고 오퍼를 `data.js`에서 직접 고름 | 최고 판정(묶음 1번)을 웹에서 또 짜는 일. `splitOffers`가 이미 같은 규칙이다 |
| 조건을 `headOrder` 그대로 첫 칩 | 첫 주문이 채널 뒤로 밀려 안 보인다(§3-4) |
| 상대 시간("N분 전") | 계산이 늘고 `capturedAt`이 없는 오퍼를 걸러야 한다. 절대 시각이 단순하고 틀리기 어렵다 |
| 지금 시각을 확인 시각으로 | 거짓이다. 값이 확인된 때가 아니라 화면을 연 때다 |
| `hydrateRoot`를 `createRoot`로 바꿔 깜박임 제거 | `main.jsx` 변경이 이슈 한도를 넘는다 |

## 8. 끊기면 무엇이 보이나

- **`setHubLinks`를 빠뜨리면** 화면은 멀쩡하고 쿠팡이츠 줄만 허브 대신 기본 링크로 간다. 눌러야 안다. §6의 쿠팡이츠 줄 누르기가 잡는다.
- **`openWithNotice`를 빠뜨리면** 쿠팡이츠 줄이 안내 없이 열려 사람이 "쿠폰 받기" 단계를 놓친다. 화면은 같다.
- **조건 칩이 없는 줄**은 조건이 없는 쿠폰과 구분되지 않는다. 오퍼의 `conditions` 문장("월 1회" 같은 것)이 칩으로 안 올라간 경우가 이 모양이다(`couponModel.js`의 `KNOWN_QUALIFIERS`는 "첫 주문" 하나뿐이다). 이슈는 조건을 숨기지 말라고 했지만, 이 시안은 칩이 된 조건만 보여 주고 나머지는 줄에 안 나온다. 한계로 인정한다. 줄이 아니라 눌러서 앱에서 보게 된다.
- **최소주문이 `null`인 줄**은 최소주문이 없는 줄과 비슷하게 보인다(없음은 `minLabel(0)`의 글자가 뜬다). 모양 차이를 두지 않는다.
- **동점 최고의 앱 아이콘**이 여러 개일 때 각각이 다른 링크로 가는 것을 모르고 줄 전체를 누르면 첫 오퍼의 앱으로만 간다. 아이콘을 눌러야 다른 앱으로 간다.

## 9. 결정이 필요한 것

- **신뢰성 줄에 시각 뒤 말을 붙이는가, 붙이면 무엇인가.** 숫자만 두면 무슨 시각인지 모른다. 새 문구는 개발자가 정한다(`CHANGE-PROPAGATION.md` 6번).
- **`splitOffers`를 써도 되는가.** 이슈가 열거한 함수 목록에 없다. 쓰지 않으면 `data.js`에 최고 오퍼 고르기를 새로 짜야 한다(§3-3).
- **`main.jsx`를 두 줄 바꿔도 되는가.** 이슈는 "한 줄 제외"라 했다(§3-7).
- **줄 높이 30px를 받아들이는가.** 손가락 목표 크기 권장보다 작다. 줄이 20개 넘게 보이게 하려는 개념의 값이다. 시안이라 허용하는지, 아니면 줄 수를 줄이고 높이를 키우는지.
- **분류 띠, 줄 수 같은 이 시안의 선택**(검색, 정렬 빼기)이 맞는가.
- 확인하지 않은 것: 실제 운영 API 응답에서 첫 화면 20줄이 360×800에 들어가는지, 모든 브랜드에 `capturedAt`이 오는지는 코드만 보고 쓴 설계라 보지 않았다. 구현 뒤 프리뷰에서 센다.

## 10. 구현 순서

1. `data.js`와 `data.test.js`: 줄 모양과 확인 시각. 시험이 초록이 되게.
2. `CompactShell.jsx`, `compact.css`: 로딩(`fetchBrands`), 실패, 줄, 분류 띠, 확인 시각. 실패와 로딩 문구는 기존 `App.jsx`의 것을 그대로 재사용한다. 새로 만들지 않는다.
3. `main.jsx` 두 줄.
4. `cd web && npm test`, `npm run build`, `git diff --stat main -- web/src`.
5. `docs/PROJECT-STRUCTURE.md` 다시 만들기.
6. 360px 스크린샷, `preview/shell-compact` push는 사람이나 sub 세션(`docs/WORKFLOW.md` §3-3). 결과 댓글에 스크린샷과 줄 수를 단다.
