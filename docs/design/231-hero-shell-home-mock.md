# 231: 홈 리뉴얼 시안 "오늘의 한 장"(hero 껍데기)

- 이슈: [#231](https://github.com/woowacourse-teams/2026-to-discount/issues/231) (묶음 이슈 #230)
- 상태: 설계 초안(승인 대기)
- 범위: `web/src/shells/hero/`(새 폴더), `web/src/main.jsx` 이 브랜치 한정 변경
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 `preview/shell-hero` 프리뷰만 본다.

## 1. 목표와 개념

리뉴얼 목표(우선순위 순): 화면의 신뢰성, 핵심(얼마, 어느 앱, 조건)을 빠르게 강조, 누를 곳을 빨리 보여 클릭률과 재방문율 상승.

이 시안의 개념은 토스식 "한 화면 한 판단"이다.

- 맨 위: 오늘 가장 큰 할인 하나를 큰 숫자 카드로 둔다. 브랜드, 금액, 앱, 조건 칩, "받으러 가기" 버튼.
- 그 아래: 짧은 목록(브랜드, 금액, 앱, 누르면 앱 링크).
- 기준: 360px 첫 화면에서 3초 안에 "오늘 뭐가 제일 큰가"가 읽힌다.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 데이터를 받는 함수 | `fetchBrands()`, `fetchBanners()`가 있다. 배너는 `window.__bannersEarly`를 먼저 쓴다 | `web/src/api.js` |
| 홈이 데이터를 받는 방식 | `window.__SSR__`(`{brands, banners}`)가 있으면 그것으로 시작하고, 없으면 마운트 뒤에 받는다. 받은 배너로 `setHubLinks`를 부른다 | `App.jsx:105,263-282`, `main.jsx:95-96` |
| **SSR 하이드레이션 충돌** | 서버(`entry-server.jsx`)와 prerender는 `<App>`을 그려 HTML에 박는다. `main.jsx`는 `window.__SSR__`가 있으면 `hydrateRoot`를 쓴다. 그 자리에 `<HeroShell />`을 꽂으면 HTML과 트리가 달라 하이드레이션 오류가 난다 | `main.jsx:111-112`, `entry-server.jsx:40` |
| 최고 할인 금액을 구하는 함수 | `displayBestAmount(offers, include)`가 화면에 찍을 액면을 낸다. 특정메뉴의 4,999원 천장은 안 낀다 | `filters.js:441` |
| 브랜드 정렬과 필터 | `applyFilters(brands, defaultFilters())`가 기본 필터(5천원 이상, 확정만 최고, 신규 앞)로 줄 세운다. `sortBrands`는 금액 내림차순이 기본 | `filters.js:350`, `filters.js:110` |
| 대표 오퍼를 고르는 함수 | `splitOffers(all, include)`의 `best[0]`이 카드 대표다. 동점이면 신규, 그다음 최소주문이 낮은 쪽 | `couponModel.js:18` |
| 앱 링크 | `offerLink(offer, brand.links, brand.name)`. 쿠팡이츠는 `openWithNotice`로 열어야 안내가 뜬다 | `CouponCard.jsx:56`, `offerLink.js:106` |
| 가장 최근 확인 시각 | `latestCaptured(offers)`가 오퍼들의 `capturedAt` 중 최신을 낸다 | `filters.js:289` |
| 문구 검사 범위 | `check-copy.mjs`는 `src/*.jsx`만 본다(하위 폴더 안 봄). `shells/hero/`의 문구는 이 검사가 못 잡는다 | `web/scripts/check-copy.mjs:9` |
| 테스트 실행기 | `run-node-tests.mjs`가 `src/` 아래를 재귀로 돌며 `*.test.js`를 전부 돈다. `package.json`을 안 고쳐도 된다 | `web/scripts/run-node-tests.mjs:12-19` |
| 로고와 앱 배지 | `logos.jsx`의 `BrandLogo`, `PlatformBadge`를 그대로 쓸 수 있다 | `web/src/logos.jsx` |

## 3. 결정

### 3-1. 파일

새 파일은 `web/src/shells/hero/` 아래에만 둔다.

- `data.js`: 얇은 어댑터. 기존 모듈을 불러 껍데기용 모양으로 바꾼다. 계산 로직 금지(§3-2).
- `HeroShell.jsx`: 홈 한 장. 데이터를 받고(§3-3), 히어로 카드와 목록을 그린다.
- `hero.css`: 이 폴더의 CSS 하나. 클래스는 전부 `hero-` 접두사로 `App.css`와 안 겹치게 한다.
- `data.test.js`: 어댑터 시험(§5). 새 폴더지만 `src/` 아래라 실행기가 자동으로 돈다.

고치지 않는 파일: `api.js`, `filters.js`, `couponModel.js`, `offerLink.js`, `popularStrip.js`와 `App.jsx` 등 shells 밖 전부. 예외는 `main.jsx` 한 군데(§3-4).

### 3-2. `data.js`: 입력과 출력

입력은 `brands`(API 응답 배열). 출력은 화면이 바로 읽는 값이다. 어댑터는 기존 함수를 부르고 이름을 바꿔 담을 뿐이다. 새 판정, 새 정렬, 새 금액 계산을 쓰지 않는다.

```
toHeroModel(brands) → {
  hero: Card | null,
  list: Card[],            // hero 다음부터 최대 7장
  checkedAt: string | null // latestCaptured(전체 오퍼)
}
Card = {
  brandName, brand,        // brand는 BrandLogo, offerLink에 넘기는 원본
  offer,                   // splitOffers(...).best[0] 원본 오퍼
  amountLabel,             // amountText(offer)
  platform,                // offer.platform
  chips: string[],         // headOrder(chipsOf(offer).filter(onCard)).map(text) — 최소주문 제외
  minLabel,                // minLabel(offer.minOrderAmount)
  href,                    // offerLink(offer, brand.links, brand.name)
}
```

- 줄 세우기: `applyFilters(brands, defaultFilters())`의 결과를 그대로 쓴다. 맨 앞 브랜드가 히어로다.
- 브랜드마다 대표 오퍼: `splitOffers(brand.offers, includesFrom(defaultFilters())).best[0]`.
- 대표가 `hasBest: false`(확정 최고가 없음)인 브랜드는 히어로 후보에서 뺀다. 목록에는 둔다. 이 판정은 `splitOffers`가 낸 `hasBest`를 읽을 뿐 새로 계산하지 않는다.
- 금액, 칩, 최소주문은 `amountText`, `chipsOf`, `qualifiersOf`, `minLabel`, `channelOf`가 낸 값을 그대로 담는다. 문구를 새로 만들지 않는다(`docs/COPY-STYLE.md`).
- `popularToday`는 쓰지 않는다. 이 시안은 금액이 기준이고 인기 띠는 개념에 안 맞는다. 필요하면 다른 시안에서 쓴다.
- `brands`가 비었거나 후보가 없으면 `hero: null`, `list: []`. 화면은 빈 상태 문구를 그린다(§3-5).

### 3-3. 데이터 받기

`HeroShell.jsx`가 `window.__SSR__`를 먼저 읽고, 없으면 `fetchBrands()`와 `fetchBanners()`를 부른다. `App.jsx`의 받는 방식(§2)과 같은 순서다.

- 배너는 카드에 그리지 않는다. `setHubLinks(banners)`를 부르기 위해서만 받는다. 이를 빠뜨리면 쿠팡이츠 외 앱에서 `offerLink`의 허브 단계가 비어 링크가 앱 열기까지 내려간다.
- 브랜드 실패는 오류 문구와 다시 불러오기 버튼. 배너 실패는 조용히 넘어간다(배너는 부가 정보, `App.jsx`와 같은 규칙).
- 받는 동안 보이는 골격(skeleton)은 히어로 카드 모양 하나와 줄 세 개. 새 로직 없이 CSS 블록만 둔다.

### 3-4. `main.jsx` 변경과 SSR 충돌

이슈는 홈을 `<HeroShell />`로 바꾸라고 했다. 그대로 하면 §2의 하이드레이션 충돌이 난다. 해결은 둘 중 하나다.

| 방법 | 내용 | 비용 |
| --- | --- | --- |
| **A. 이 브랜치에서 하이드레이션을 끈다(채택)** | `ssr`가 있어도 `hydrateRoot`를 안 쓰고 `createRoot(rootEl).render(tree)`로 그린다. SSR이 넣은 HTML은 새로 그릴 때 지워진다 | `main.jsx` 변경이 두 군데(`<App>` → `<HeroShell>`, 마지막 분기). iOS용 `relayout` 블록은 `if (ssr)` 안에 있어 같이 안 돈다. 이 시안엔 `cqw` 쿠폰 컨테이너가 없어 필요 없다 |
| B. `entry-server.jsx`, prerender도 `HeroShell`로 | 서버 HTML까지 맞춘다 | shells 밖 파일 둘을 더 고친다. 완료 조건 위반 |

- A에서 첫 화면은 서버 HTML이 아니라 자바스크립트 실행 뒤에 그려진다. 프리뷰 비교용으로 충분하고, 첫 그림이 늦는 점은 비교 때 감안한다.
- `window.__SSR__` 데이터는 A에서도 `HeroShell`이 읽어 쓴다. 그래서 데이터 요청이 한 번 줄고 첫 그림이 빨라진다.
- 이슈의 "main.jsx 한 줄 제외"는 한 줄을 넘는다. 완료 조건의 검사(`git diff --stat main -- web/src/*.js`)는 `*.js`만 보므로 `main.jsx`는 걸리지 않지만, 승인 때 "두 군데"임을 알린다. 이슈 문구를 지키려면 마지막 분기를 `const hydrate = false && ssr`처럼 한 줄로 줄이는 길도 있으나 읽기 나빠 권하지 않는다.
- `App`, `ErrorBoundary` import는 지우지 않는다. `ErrorBoundary`는 `HeroShell`도 감싼다.
- `App.css`는 `main.jsx`가 이미 불러온다. `hero.css`는 `HeroShell.jsx`가 불러온다.

### 3-5. 화면 구성(360px)

위에서 아래로.

1. **머리줄:** 서비스 이름 글자 하나와 "N월 N일 HH:MM 확인" 한 줄. 값은 `checkedAt`(`latestCaptured`)을 한국 시각으로 바꿔 쓴다. 신뢰성(목표 1)을 첫 화면에 둔다.
   - 시각 형식 만들기는 표시용 포맷뿐이다. 판단 로직이 아니다. 시각이 없으면(`null`) 줄 자체를 그리지 않는다.
2. **히어로 카드:** 첫 화면의 중심. 카드 전체가 링크이고 버튼도 같은 링크다.
   - 브랜드 로고와 이름, 큰 금액(`amountLabel`, 화면 폭의 약 1/5 글자 크기, 굵게), 앱 배지(`PlatformBadge`).
   - 조건 한 줄: 칩(`chips`)과 최소주문(`minLabel`). 줄이되 숨기지 않는다. 폭이 모자라면 칩을 줄바꿈하지 최소주문을 자르지 않는다.
   - 버튼 "쿠폰 받으러 가기": 카드 안 아래쪽, 첫 화면 안에 들어오는 높이. 접근성을 위해 높이 48px 이상.
3. **목록:** 히어로 다음 브랜드 최대 7장. 한 줄에 로고, 이름, 금액, 앱, 최소주문. 줄 전체가 링크.
4. **바닥:** "더 많은 할인은 전체 보기" 같은 새 문구를 넣지 않는다(문구는 세션이 정하지 않는다, `docs/CHANGE-PROPAGATION.md` 6번). 목록 끝에서 끝낸다. 전체 목록은 기존 홈이 `?` 없는 주소에서 다시 보이게 하는 길이 없으므로 이 시안은 다루지 않는다(§7).

새 사용자 문구는 최소로 한다: "쿠폰 받으러 가기"(이슈 본문이 정한 말), 빈 상태와 오류 문구. 이 셋은 **구현자가 정하지 않고 §8에서 승인받는다.** 승인 전에는 기존 화면에서 이미 쓰는 문구(`App.jsx`의 오류, 빈 목록 문구)를 그대로 가져다 쓴다.

### 3-6. 링크

- 히어로 버튼과 목록 줄은 `<a href={card.href}>`다. `href`는 `offerLink()`가 낸 값이다.
- `openWithNotice(e, href)`를 `onClick`에 건다. 쿠팡이츠 안내(§2)를 우회하면 안내 없이 허브로 가서 쿠폰 받기를 놓친다. `CouponCard.jsx`가 쓰는 방식과 같다.
- `href`가 `undefined`(앱이 알려지지 않음)이면 링크를 렌더하지 않고 줄만 그린다.
- 분석 이벤트(`track`)는 보내지 않는다. 이슈가 생략을 허용했다. **`track`을 부르지 않으므로 `ALLOWED_EVENTS` 대조(7번 묶음)는 건드릴 일이 없다.**

### 3-7. 스타일

- 글꼴, 색은 `App.css`가 정한 CSS 변수가 있으면 읽고, 없으면 `hero.css` 안에 값을 둔다. `App.css`는 고치지 않는다.
- 360px 기준. 가로 스크롤이 생기면 안 된다. 금액이 가장 큰 글자다.
- 새 npm 의존성 없음. 이미지 새로 없음(로고는 기존 `BrandLogo`).

## 4. 동반 변경 묶음(`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 해당 | 이번 작업에서 |
| --- | --- | --- |
| 1번 확실성 | 읽기만 | `filters.js`의 `applyFilters`, `splitOffers`, `displayBestAmount`를 그대로 부른다. 판정을 따로 만들지 않으므로 판정표(`certainty-cases.json`) 쪽이 안 어긋난다. 히어로를 내가 고르는 식(`offers[0]` 등)으로 바꾸면 이 묶음이 깨진다 |
| 4번 최소주문 | 읽기만 | `minLabel`이 낸 값만 표시한다. 모르는 값(`null`)은 비운다. 지어내지 않는다. 비우면 "최소주문 미확인"을 쓸지는 §8 |
| 6번 문구 | 해당 | 새 문구를 최소로 하고 §8에서 승인. `check-copy.mjs`가 하위 폴더를 안 보므로 문구 위반이 자동으로 안 잡힌다. 구현자가 `COPY-STYLE.md`를 눈으로 대조한다 |
| 7번 행동 이벤트 | 해당 없음 | `track`을 부르지 않는다 |
| 8번 배포 순서 | 해당 없음 | 병합하지 않고 API를 안 바꾼다. 프리뷰만 쓴다 |
| 9번 새 파일 | 해당 | `data.test.js`는 실행기가 자동으로 돈다(`package.json` 불변). `docs/PROJECT-STRUCTURE.md`는 병합하지 않으므로 다시 만들지 않는다. 푸시 훅(구조 문서 검사)이 막으면 `python scripts/generate_project_structure.py`로 다시 만들어 같이 커밋한다 |
| 2, 3, 5번 | 해당 없음 | 배너 모양과 알림을 안 만진다. 배너는 `setHubLinks` 입력으로만 읽는다 |

## 5. 시험

### 5-1. `web/src/shells/hero/data.test.js`(새 파일, `node:test`)

`web/scripts/dev/fixtures/brands.json`이 있으면 그것을 읽어 쓴다. 없는 모양은 손으로 만든 작은 픽스처를 쓴다. 단언이 구조에 걸리게 쓴다(문구가 아니라).

- 히어로의 `brandName`이 `applyFilters(brands, defaultFilters())[0].name`과 같다. 어댑터가 순서를 바꾸지 않는다는 근거.
- 히어로의 `offer.amount`가 `displayBestAmount(그 브랜드 offers)`와 같다.
- 특정메뉴 쿠폰뿐인 브랜드(4,999원 천장)가 맨 위에 있어도 히어로 금액이 4,999로 찍히지 않는다.
- `hasBest: false`인 브랜드는 `hero`가 되지 않고 `list`에는 있다.
- 최소주문을 모르는 오퍼(`minOrderAmount: null`)는 `minLabel`이 `null`이고 문구를 지어내지 않는다.
- `brands`가 `[]`이거나 `null`이면 `{hero: null, list: [], checkedAt: null}`이다. 던지지 않는다.
- `list.length`는 7을 넘지 않고 `hero`와 같은 브랜드를 담지 않는다.
- `checkedAt`이 `latestCaptured`와 같다. 오퍼에 `capturedAt`이 없으면 `null`.
- 쿠팡이츠 오퍼의 `href`가 `offerLink`의 반환과 같다(어댑터가 링크를 만들지 않는다는 근거).

### 5-2. 기존 시험과 빌드

- `cd web && npm test`와 `npm run build`가 통과한다.
- `git diff --stat main -- web/src/*.js`에 변경이 없다(`web/src/shells/` 밖 `.js` diff 0줄). `main.jsx`는 `*.js` 패턴에 안 걸리므로 별도로 `git diff main -- web/src/main.jsx`가 §3-4의 두 군데뿐인지 본다.
- `git diff --stat main`의 파일 목록이 `docs/design/`, `web/src/shells/hero/*`, `web/src/main.jsx` 밖을 안 가리킨다.

### 5-3. 눈으로 보는 확인

`web/scripts/dev/banner-shot.mjs` 방식으로 360px 스크린샷을 찍는다. 운영 API 데이터가 실제로 들어온 화면이어야 한다(고정 픽스처 화면은 완료 조건이 아니다).

- **양성 신호:** 히어로 금액이 `https://…/api/brands` 응답의 맨 앞 `hasBest` 브랜드 금액과 같은지 응답 값 한 줄을 PR에 같이 적는다. "금액이 보인다"만으로는 목록이 비어 시험 값이 들어간 화면인지 못 가른다.
- 쿠팡이츠 오퍼 카드를 눌러 안내 화면이 뜨는지, 다른 앱 카드가 `href`를 여는지 프리뷰에서 한 번씩 누른다.
- 첫 화면(스크롤 없이)에 히어로 카드 전체와 "쿠폰 받으러 가기" 버튼이 들어오는지.
- 가로 스크롤이 없는지.

## 6. 끊기면 무엇이 보이나

- `main.jsx`에서 하이드레이션을 안 끄면: 화면은 대체로 그려지지만 콘솔에 하이드레이션 오류가 나고 `onRecoverableError`가 텔레메트리로 오류를 보낸다. 프리뷰의 `dev` 이벤트로 가지만 비교 때 노이즈가 된다. 눈으로는 안 보일 수 있다.
- `setHubLinks`를 빠뜨리면: 쿠팡이츠 외 허브 링크 앱의 카드가 `PLATFORM_APP_LINKS`의 앱 홈으로만 간다. 화면은 멀쩡하고 링크 도착점만 얕아진다.
- 대표 오퍼를 `splitOffers` 없이 고르면: 불확정(`최대`), 랜덤, 특정메뉴 쿠폰이 히어로 금액으로 찍힌다. 값이 틀린 채 화면은 멀쩡하다. §5-1의 단언이 이 경우를 잡는다.
- `openWithNotice`를 빼면: 쿠팡이츠 허브가 "브랜드를 눌러 쿠폰 받기" 안내 없이 열린다. 클릭은 가지만 쿠폰이 적용되지 않은 채 이탈한다.
- 병합해 버리면: 운영 홈이 SSR 없는 클라이언트 렌더로 바뀌고 분석 이벤트가 사라진다. PR을 초안으로 두는 이유다. `main` 대상 PR이라는 이유는 §7.

## 7. 지금 안 하는 것

- 필터, 검색, 정렬 바, 배너, 푸시 설정, 이력 차트, 인기 띠, 숨기기. 모두 이 시안의 개념 밖이다.
- 분석 이벤트. 이슈가 생략을 허용했다. 시안 비교는 시각 확인과 사람의 판단으로 한다.
- 전체 목록으로 가는 길. 시안 사이 비교는 프리뷰 주소를 오가며 한다.
- SSR 서버 HTML(§3-4의 B).
- 이 브랜치의 PR 대상 브랜치는 `main`이다. `beggars-ops`는 개발 배포 경로가 없어 `작업 브랜치 → main`으로 반영하는 저장소 예외다(`AGENTS.md`). 다만 이 PR은 병합하지 않는다.

## 8. 결정이 필요한 것

- **새 문구 승인.** "쿠폰 받으러 가기"(이슈가 정한 말)와 빈 상태, 오류 문구를 그대로 써도 되는가. 모자라면 기존 `App.jsx`의 문구를 가져다 쓴다.
- **최소주문을 모를 때.** `minLabel`이 `null`이면 줄을 비우는 것이 기본이다. 카드의 정식 라벨 "최소주문 미확인"을 같이 쓸지 알려 달라. 신뢰성(목표 1)은 후자 쪽이다.
- **`main.jsx` 두 군데 변경.** 이슈의 "한 줄 제외"를 넘는다(§3-4). 승인하는가.
- **확인 시각의 뜻.** `latestCaptured`는 오퍼들 중 가장 최근 수집 시각이다. "이 시각 기준"이라고 읽히는가, 오래된 값이 섞이면 오해를 부르는가. 이 시안은 최신 값 하나만 보인다.
- 확인하지 않은 것: 운영 API 응답에서 첫 `hasBest` 브랜드가 무엇인지, `capturedAt`이 응답에 실제로 오는지는 이 세션에서 호출해 보지 않았다. 구현자가 §5-3에서 처음 본다.

## 9. 구현 순서

1. `data.js`와 `data.test.js`(§5-1). 시험이 초록이 되기 전에는 화면을 만들지 않는다.
2. `HeroShell.jsx`와 `hero.css`. 데이터 받기, 히어로 카드, 목록, 골격, 오류.
3. `main.jsx` 두 군데 변경(§3-4).
4. `cd web && npm test`, `npm run build`, §5-2 diff 검사.
5. 360px 스크린샷(§5-3)을 찍어 이슈 결과 댓글에 단다.
6. `preview/shell-hero`로 올리는 일은 사람 또는 sub 세션이 한다(`docs/WORKFLOW.md` §3-3). 구현자는 하지 않는다.

## 변경 이력

- 2026-11-02 (구현): 이슈 본문 "결정 (2026-11-03, 설계 점검 뒤)"가 §8을 답했다.
  - 최소주문을 모르면(`minLabel`이 `null`) 칸을 비우지 않고 기존 정식 라벨 "최소주문 미확인"을 그린다(§4 4번 행의 "비운다"를 대신함).
  - 시안용 임시 문구는 세션이 정해도 된다(수집기 말을 새로 만들지 않는 규칙은 그대로). 머리줄은 "확인" 대신 "N월 N일 HH:MM 기준", 서비스 이름은 `index.html` 제목의 "배달앱 할인모음"을 썼다.
  - `main.jsx`는 홈 교체, `ssr` 하이드레이션 끄기(`if (false && ssr)`), 두 가지에 더해 두 줄이 늘었다: `HeroShell` import와 `window.__legacyApp = App`. `App`을 안 쓰면 번들에서 빠져 쿠폰 카드 CSS 조각이 사라지고 `ssr-template.mjs`가 빌드를 깨뜨려 참조만 남겼다.
