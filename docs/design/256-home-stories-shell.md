# 256 홈 리뉴얼 시안: 가로 넘기는 오늘의 할인 (stories)

이슈: [#256](https://github.com/woowacourse-teams/2026-to-discount/issues/256). 묶음 이슈 [#230](https://github.com/woowacourse-teams/2026-to-discount/issues/230)의 시안 하나. 웹만 바꾼다. API 변경 없음.

**버리는 시안이다. 병합하지 않는다.** PR은 초안으로 두고 프리뷰만 본다. 그래서 이 문서는 "어떻게 만들면 시안 목적(개념 비교)을 이루면서 운영 로직을 안 건드리나"만 정한다.

## 결론

홈을 `<StoriesShell />` 하나로 바꾼다. 위에 원형 브랜드 줄(오늘 큰 할인 10곳), 원을 누르면 전체 화면 카드 덱이 열려 가로로 넘어가고, 카드마다 아래에 큰 '받으러 가기'가 선다. 덱 아래 본 화면에는 일반 목록이 선다.

- 새 파일은 `web/src/shells/stories/` 아래에만 둔다: `StoriesShell.jsx`, `data.js`, `stories.css`(CSS 하나).
- 로직은 새로 짜지 않는다. 고르기, 정렬, 금액 문구, 칩, 링크는 전부 기존 모듈 함수를 부른다. `data.js`는 그 결과를 껍데기용 모양으로 옮겨 담는 얇은 어댑터다.
- 기존 `web/src/*.js`는 diff 0줄. `main.jsx`만 홈 마운트 자리를 바꾼다.

## 배경

리뉴얼 목표(사용자 2026-11-03, 우선순위 순): 1 신뢰성, 2 핵심(얼마, 어느 앱, 조건)을 빠르게 강조, 3 누를 곳을 빨리 보여 클릭률과 재방문율 상승. 이 시안은 3번을 가장 세게, 1번을 "기준 시각 + 모름의 구분"으로 받는다.

## 변경

### 1. `data.js`: 기존 모듈을 읽어 껍데기용 모양으로

화면이 쓰는 값은 아래 함수 둘이 낸다. 정렬, 판정, 문구 계산은 전부 부르는 쪽(기존 모듈)이 한다.

```js
// web/src/shells/stories/data.js (스케치)
export async function loadStories(initial) {
  // brands: initial?.brands ?? await fetchBrands()
  // banners: initial?.banners ?? await fetchBanners()  → setHubLinks(banners)
  // return { brands, banners }
}

export function toStories(brands) {
  // 1. list = applyFilters(brands, defaultFilters())          // 운영 목록과 같은 순서(정렬, 신규 앞)
  // 2. 앞에서부터 훑어 대표 오퍼가 있는 브랜드 10곳 = deck
  // 3. 브랜드마다 → 카드 모양 { name, category, hero, rows, capturedAt, ... }
}
```

**오늘 큰 할인 10곳 고르기**: `applyFilters(brands, defaultFilters())`가 낸 순서의 앞에서부터 `displayBestAmount(b.offers)`가 null이 아닌 브랜드 10곳. 새 정렬을 만들지 않는다. 운영 홈의 맨 위 10곳과 같다(`sortBrands`는 확정 없는 브랜드를 뒤로 보내므로 앞에서 훑으면 충분하다).

**카드의 대표 오퍼(hero)**: `splitOffers(b.offers, include)`의 `best[0]`. `include`는 `includesFrom(defaultFilters())`. `couponModel.js`의 함수이고 "최고(동점은 신규 먼저, 최소주문 낮은 순)" 규칙이 이미 들어 있어 어댑터가 다시 고르지 않는다. 묶음 행사뿐인 브랜드는 `splitOffers`가 묶음을 대표로 준다. 이 경우 `amountText`가 원문(`rawText`)을 낸다.

**카드가 그리는 값과 나오는 곳**

| 화면 값 | 어디서 | 비고 |
|---|---|---|
| 큰 금액 | `amountText(hero)` | 묶음이면 원문 |
| 앱 | `hero.platform` + `PLATFORM_BY_KEY`(`platforms.js`) + `PlatformBadge` 또는 `platformIconSrc` | 앱 이름은 `platforms.js` 값 |
| 조건 칩 | `chipsOf(hero).filter(onCard)` 를 `headOrder`로 | 채널, 멤버십, 첫 주문 등. 줄여도 숨기지 않는다 |
| 최소주문 | `minLabel(hero.minOrderAmount)` (아래 "모름과 없음") | |
| 링크 | `offerLink(hero, brand.links, brand.name)` | 쿠팡이츠 안내는 `openWithNotice` |
| 기준 시각 | `latestCaptured(b.offers)` | 아래 "신뢰성" |
| 앱별 줄 | `b.offers`를 앱 기준으로 묶은 것 | 카드 아래쪽, 일반 목록 |
| 로고 | `BrandLogo`(`logos.jsx`) | |

앱별 줄(`rows`)은 `PLATFORMS`(`platforms.js`) 순서로 돌며 그 앱의 대표 오퍼를 `amountText`로 적는다. 오퍼가 없는 앱은 `-`. `splitOffers(앱별 오퍼).best[0]`을 쓰면 앱 안 고르기도 기존 규칙을 따른다.

### 2. 모름과 없음 (이슈 결정)

- 그 앱에 오퍼 자체가 없다: `-`.
- 오퍼는 있는데 최소주문을 모른다(`minLabel`이 null): 칸을 비우지 않고 기존 라벨 **"최소주문 미확인"** 을 그린다. 새 문구가 아니다. `couponModel.js`의 `conditionTable`이 `min`에 이미 쓰는 문자열이다.
  - 그 문자열은 `couponModel.js`에서 내보내지 않는다(내부 `rowOf`). 어댑터에 같은 문자열을 한 번 적는다. 정본은 `conditionTable`이고 시안이라 중복을 감수한다. PR 본문에 적는다. 대안: `conditionTable(hero).rows[0]?.min`을 읽으면 문자열을 안 적어도 되지만 구간이 없는 단순 오퍼는 `rows`가 비어 쓸 수 없다. 그래서 어댑터에 적는 쪽으로 간다.
- 최소주문을 안다: `minLabel` 결과가 `최소주문 없음`이면 그대로, 숫자 문자열이면 `${값}원↑`(`conditionTable`의 `won(min)↑` 꼴과 같다).
- 금액을 모른다(`amount == null`이고 `rawText`도 없음): `conditionTable`의 `금액 ?`와 같은 표기.

### 3. 신뢰성 (목표 1)

- 카드와 목록 머리에 `latestCaptured(b.offers)`를 `MM.DD HH:mm 기준`으로 적는다(KST). **상대 시간("3분 전")은 쓰지 않는다**: 서버 HTML과 클라이언트가 어긋나(하이드레이션 불일치) 깜박이고, 시안 스크린샷마다 값이 달라진다.
- 시각 포맷은 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ... })` 한 함수. 날짜 계산이 아니라 문자열 표시라 어댑터 안에 둔다. `capturedAt`이 없으면 시각 줄을 그리지 않는다(지어내지 않는다).
- "확인", "미확인", "판독", "관측" 같은 수집기 말은 새로 만들지 않는다. "기준", "받으러 가기" 같은 임시 문구는 세션이 정한다(이슈 결정). 단 기존 라벨("최소주문 미확인")은 그대로 쓴다.
- 신규 표식(`isUpdated`)은 `Date.now()` 의존이라 서버와 클라이언트가 어긋날 수 있다. 껍데기에서는 쓰지 않는다. `isNew` 값이 있는 응답에서만 `isUpdated`가 상수라 안전하지만, 확인 전에는 넣지 않는다.

### 4. 화면 (360px)

첫 화면에 개념이 보여야 한다(완료 조건).

- 맨 위 한 줄 머리말 + 원형 브랜드 줄. 원 안은 `BrandLogo`, 아래에 이름 한 줄. 가로 스크롤(`overflow-x: auto`, `scroll-snap-type: x proximity`). 10곳이 다 안 보이므로 오른쪽 끝에 다음 원이 잘려 보이게 해 가로로 넘긴다는 단서를 준다.
- 원 아래에 오늘 큰 할인 1번 카드의 축소판을 첫 화면에 한 장 얹어도 된다(구현자 재량). 요점은 첫 화면에 원 줄과 "받으러 가기" 단추 하나가 같이 보이는 것.
- 원을 누르면 전체 화면 덱(`position: fixed; inset: 0; height: 100dvh`)이 열리고 누른 원의 카드로 스크롤한다.
  - 덱은 `display: flex; overflow-x: auto; scroll-snap-type: x mandatory`, 카드는 `flex: 0 0 100%; scroll-snap-align: center`. JS 캐러셀 라이브러리는 쓰지 않는다(새 의존성 금지).
  - 위에 진행 막대(몇 번째 / 10)와 닫기 버튼. 닫기는 버튼과 `Esc`. 덱이 열린 동안 바깥 스크롤은 막는다(`body`에 클래스 하나).
  - 카드: 로고, 브랜드명, 큰 금액, 칩, 최소주문, 앱별 줄, 기준 시각, 아래 고정 큰 '받으러 가기'.
  - 안드로이드 뒤로가기는 시안에서 처리하지 않는다(`backClose.js`를 안 쓴다). 뒤로가기를 누르면 홈을 떠난다. 시안 한계로 PR 본문에 적는다.
- 아래 일반 목록: `applyFilters` 결과 전체를 단순 행으로 그린다(로고, 이름, 최고 금액, 최소주문, 앱 `rows`). 행 전체가 링크, 행에는 '받으러 가기' 대신 같은 링크의 작은 단추. 목록이 길어 느리면 처음 30곳만(더 보기 단추 하나). 필터 UI, 검색, 정렬 변경은 시안에서 뺀다.

### 5. 링크 (목표 3)

- 모든 '받으러 가기'와 목록 행은 `<a href={offerLink(...)}>`. `OfferChip.jsx:96~105`와 같은 모양으로 `target`, `rel`, `onClick={(e) => openWithNotice(e, href)}`을 단다. 쿠팡이츠는 `openWithNotice`가 안내 화면을 거쳐 같은 탭으로 보내므로 **그냥 `<a>`로 두면 안 된다**(안내가 빠진다, #141).
- 분석 이벤트(`track`, `offerClickProps`)는 생략한다(이슈 허용). 시안 클릭이 `offer_link_click` 수치에 섞이지 않는 장점이 있다. 다만 `?dev=1`이 아닌 프리뷰 트래픽이 `page_view` 등 기존 이벤트는 쏜다(`main.jsx`의 시작 코드는 그대로). 프리뷰 수치는 비교에 쓰지 않는다.
- 허브 링크: 쿠팡이츠 외 앱은 `setHubLinks(banners)`가 먼저 불려야 허브 링크가 선다. `main.jsx`는 `ssr`가 있을 때만 부르므로, `StoriesShell`이 `fetchBanners()` 결과로 직접 `setHubLinks`를 부른다(`App.jsx:280`과 같은 순서).

### 6. `main.jsx`

```diff
-import App from './App.jsx'
+import StoriesShell from './shells/stories/StoriesShell.jsx'
 ...
-    <ErrorBoundary><App initial={ssr} /></ErrorBoundary>
+    <ErrorBoundary><StoriesShell initial={ssr} /></ErrorBoundary>
```

- 이슈의 "한 줄"은 마운트 자리 교체를 말한다. import 줄이 하나 더 바뀌므로 `git diff`에는 두 줄(삭제와 추가 한 쌍씩)이 나온다. 여기까지가 허용 범위다.
- `App.jsx`와 다른 컴포넌트는 지우지 않는다. `StoriesShell`은 `App.css`를 그대로 불러오는 `main.jsx`를 통해 전역 스타일이 함께 들어오므로 **클래스 이름 충돌을 피하려고 모든 클래스에 `stx-` 접두사**를 쓴다.
- **하이드레이션**: 서버(`api/ssr.js`)는 `App`으로 HTML을 그린다. `StoriesShell`을 `hydrateRoot`로 붙이면 구조가 달라 불일치가 날 가능성이 높다. 구현자는 프리뷰 콘솔에서 먼저 본다. 불일치가 보이면 이슈 결정대로 `const ssr = window.__SSR__`를 **`null`로 두는 한 줄**(예: `const ssr = null`)로 바꿔 `createRoot` 경로를 탄다. 이 경우 `StoriesShell`의 `initial`도 null이라 `fetchBrands()`로 받는다. 바꿨다면 PR 본문에 적는다.
- `main.jsx`의 쿠폰 카드용 `relayout` 선택자는 `.cc-ticket` 등 기존 클래스를 보므로 영향 없다(`stx-` 접두사).

## 변경 전파 확인 (`docs/CHANGE-PROPAGATION.md`)

- 1번 확실성 판정: 기존 `filters.js` 함수만 부르고 판정을 복제하지 않는다. 묶음 영향 없음. 어댑터가 금액을 직접 비교하거나 "최고" 배지를 새로 달면 이 묶음이 생기므로 금지다.
- 2, 3번 배너 모양, 묶음 배너: 배너는 `setHubLinks`로만 읽는다(`url`, `platform`). 배너 칸 이름을 새로 읽지 않는다. 영향 없음.
- 4번 최소주문 출처: 모르면 "최소주문 미확인"으로 뜬다는 원칙을 그대로 따른다. 지어내지 않는다. 영향 없음.
- 6번 화면에 나가는 글자: **새 문구가 생긴다**("기준", "받으러 가기" 등). 병합하지 않는 시안이라 이슈가 세션 결정을 허용했다. `docs/COPY-STYLE.md` 점검(`npm run test:copy`)이 시안 파일에도 걸리면 그 규칙을 따르는 문구로 바꾼다. 수집기 말은 쓰지 않는다. **이 문구들은 병합 대상이 아니므로**, 시안이 채택되면 그때 개발자가 문구를 확정한다.
- 7번 행동 이벤트: 새 이벤트 없음. `ALLOWED_EVENTS` 영향 없음.
- 8번 배포: 웹만이라 순서 제약 없음. 프리뷰 먼저 (`docs/WORKFLOW.md` §3-3), 이 시안은 main에 합치지 않는다.
- 9번 새 파일:
  - `docs/PROJECT-STRUCTURE.md`를 `python scripts/generate_project_structure.py`로 다시 만든다. 안 하면 push 훅이 막는다.
  - `web/src/shells/stories/data.test.js`를 만들면 `web/package.json`의 `test` 사슬에 들어가는지 먼저 본다(`scripts/run-node-tests.mjs`가 하위 폴더를 훑는지). 안 훑으면 `test` 명령에 직접 넣는다.
- 같이 움직이는 암묵 묶음: **"최소주문 미확인" 문자열**. 정본은 `couponModel.js` `conditionTable`이고 어댑터가 복사본을 가진다. 정본이 바뀌면 시안만 옛 문구를 낸다. 시안은 병합하지 않으므로 허용하고, 어댑터 테스트가 정본의 출력과 같은지 맞댄다(아래).

## 테스트

기존 `npm test`와 `npm run build`가 통과해야 한다. 기존 로직 파일은 안 건드리므로 기존 테스트는 그대로 초록이어야 한다.

어댑터 테스트 `web/src/shells/stories/data.test.js`(작게, 양성 신호 중심):

- 실제 모양의 브랜드 배열(픽스처)을 `toStories`에 넣어 **10곳이 나오고 순서가 `applyFilters(brands, defaultFilters())`의 앞 10곳과 같다**. 가짜 순서로 초록이 되지 않게 기대값을 같은 함수로 만든다.
- 확정 없는 브랜드(특정메뉴뿐 등)가 앞 10곳에 끼지 않는다.
- 최소주문이 없는(`minOrderAmount: null`) 오퍼의 `min` 표시가 "최소주문 미확인"이고, `conditionTable`이 같은 오퍼에 내는 `rows[0].min`과 같은 문자열이다(복사본이 정본과 어긋나는 것을 막는 맞대기. 구간이 있는 픽스처로).
- 앱에 오퍼가 없으면 `-`, 금액 모름은 `금액 ?`, 둘이 서로 다르다.
- 묶음 행사뿐인 브랜드의 큰 금액이 원문(`rawText`)이다.
- `capturedAt`이 없는 브랜드는 시각 줄이 없다.

화면 조립(`StoriesShell.jsx`, CSS 스크롤)은 단위로 못 잡는다. 아래 스크린샷이 맡는다.

## 확인 (구현자)

- `git diff --stat main -- web/src/*.js`: 변경 없음. `git diff --stat main -- web/src`에서 `shells/` 밖은 `main.jsx`뿐.
- `cd web && npm test`와 `npm run build` 출력(통과 줄 수와 새 테스트 이름).
- 360px 스크린샷(결과 댓글에 첨부), 실제 운영 API 데이터로:
  - 첫 화면: 원형 브랜드 줄과 '받으러 가기'가 같이 보임.
  - 원을 눌러 연 덱: 큰 금액, 칩, 최소주문, 기준 시각, 아래 큰 '받으러 가기'.
  - 덱을 가로로 넘긴 뒤(다음 카드).
  - 최소주문을 모르는 오퍼가 있으면 그 카드("최소주문 미확인"이 비지 않고 보임). 운영 데이터에 없으면 `미확인`이라고 적는다.
  - 앱 줄에 `-`와 값이 같이 있는 카드.
  - 아래 일반 목록.
- 카드의 '받으러 가기' 누름: 배민, 요기요 앱 링크가 열림. 쿠팡이츠는 안내 화면 뒤 열림. **실기 확인이 어려우면 어렵다고 `미확인`으로 적는다**(링크 문자열 확인으로 갈음하지 않는다).
- 프리뷰 콘솔에 하이드레이션 경고가 있는지. 있으면 6절 처리를 하고 PR 본문에 적는다.
- 프리뷰: 구현이 끝나면 `preview/shell-stories`로 올린다(사람 또는 sub 세션이 push). 주소는 PR 본문 맨 위에 적는다(`https://beggars-git-preview-shell-stories-nn98s-projects.vercel.app`).

## 하지 않는 것

- 기존 `web/src/*.js` 수정, `App.jsx` 삭제나 수정.
- 필터, 검색, 정렬 변경, 숨기기, 푸시 설정, 배너(`EventBanner`), 설문, 제보 버튼. 시안 범위 밖.
- 분석 이벤트(`track`)와 `offerClickProps`.
- 새 npm 의존성, 두 번째 CSS 파일, 상대 시간 표시.
- 가격 비교 계산, 새 배지, 새 정렬. 값은 기존 함수가 낸 것을 옮겨 담기만 한다.

## 열린 질문

1. 덱 열기 동작: 원을 누르면 곧바로 전체 화면(위 설계)인지, 첫 화면의 카드 한 장을 먼저 보이고 그 카드를 눌러야 전체 화면인지. 기본은 위 설계.
2. 대표 오퍼를 `splitOffers`로 고르는 것은 이슈가 나열한 모듈(`couponModel.js`) 안의 함수이지만 이름이 이슈 목록에 없다. 이 사용이 "새 로직 금지"에 맞는가. 기본은 맞다고 본다(고르기 규칙을 복제하지 않기 위함).
3. 일반 목록을 처음 30곳으로 자르는 것으로 충분한가. 전체를 그리면 모바일에서 느릴 수 있다.

## 변경 이력

- 2026-11-03 (구현): 설계 문서와 달라진 곳 둘. 권한자 댓글은 없었고, 구현 중 빌드와 하이드레이션 때문에 생겼다.
  - `main.jsx`가 설계의 두 줄보다 더 바뀐다. `ssr`를 `null`로 둔 한 줄(6절 하이드레이션 처리, 서버 HTML이 `App` 모양이라 불일치가 구조상 확실해서 프리뷰 확인 전에 적용)과, `App`을 `?old=1`일 때만 그리는 분기다. 분기를 둔 까닭: `App`이 클라이언트 번들에서 빠지면 쿠폰 카드 CSS 조각(`App`의 동적 import)이 안 생겨 `scripts/ssr-template.mjs`가 `CouponCard CSS를 못 찾았다`로 `npm run build`를 막는다. `?old=1`은 프리뷰에서 운영 홈과 견주는 데도 쓴다.
  - `docs/PROJECT-STRUCTURE.md`는 생성 스크립트를 이 세션에서 못 돌려(실행 승인 필요) 새 파일 네 줄을 정렬 순서에 맞춰 손으로 넣었다. 스크립트로 다시 만들어 차이가 없는지 확인해야 한다.
