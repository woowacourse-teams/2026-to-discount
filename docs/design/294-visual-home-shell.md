# 294: 홈 리뉴얼 시안 "이미지로 고르는 홈" (visual)

- 이슈: [#294](https://github.com/woowacourse-teams/2026-to-discount/issues/294) (묶음 #230)
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 프리뷰만 본다.
- 프리뷰 주소: `https://beggars-git-preview-shell-visual-nn98s-projects.vercel.app` (브랜치 `preview/shell-visual`는 sub 세션이 올린다)

## 1. 무엇을 시험하나

리뉴얼 목표 순서는 신뢰성, 핵심 전달(얼마, 어느 앱, 조건), 클릭이다. 이 시안은 그중 둘째와 셋째를 "메뉴 사진으로 고르는 홈"으로 시험한다.

- 실제 메뉴 사진은 출처와 사용 허락이 없어 쓰지 않는다.
- 대신 카테고리마다 그라데이션 배경과 큰 이모지(🍗🍕🍔☕🍱)를 사진 자리로 둔 16:9 이미지 카드를 쓴다.
- 사진 자리는 `imageFor(brand)` 한 함수로 모은다. 나중에 실제 이미지 URL을 돌려주게 바꾸면 카드는 그대로다.
- 첫 화면은 가로로 넘기는 큰 카드 3장과 그 아래 목록이다.

## 2. 하지 않는 것

- 기존 로직 파일을 고치지 않는다: `api.js`, `filters.js`, `couponModel.js`, `offerLink.js`, `popularStrip.js`.
- 계산 로직을 새로 짜지 않는다. 정렬, 필터, 최고 금액, 칩, 링크는 전부 기존 함수가 낸 값이다.
- 새 npm 의존성, 새 분석 이벤트(`track`)를 넣지 않는다.
- 기존 `App.jsx`와 다른 컴포넌트를 지우지 않는다.
- 실제 메뉴 사진을 쓰지 않는다.

## 3. 파일

새 파일은 `web/src/shells/visual/` 아래에만 둔다.

| 파일 | 역할 |
|---|---|
| `VisualShell.jsx` | 홈 전체. 데이터를 불러오고 3절 구조로 그린다 |
| `data.js` | 기존 모듈을 불러 화면용 모양으로 바꾸는 얇은 어댑터(4절) |
| `visual.css` | 이 시안의 CSS 한 파일 |
| `data.test.js` | 어댑터 시험(7절) |

바꾸는 기존 파일은 `web/src/main.jsx`(6절)와 `web/package.json`(시험 사슬), `docs/PROJECT-STRUCTURE.md`(재생성)뿐이다.

## 4. 어댑터 `data.js`

기존 함수가 이미 낸 값을 껍데기용 모양으로 옮기기만 한다. 비교, 합산, 정렬을 새로 하지 않는다.

```
loadHome() -> { brands, banners }          // fetchBrands, fetchBanners를 부른다
homeCards(brands) -> Card[]                 // defaultFilters + applyFilters 결과
topCards(cards) -> Card[3]                  // 위에서 3장
imageFor(brand) -> { gradient, emoji }      // 사진 자리. 나중에 { src }로 바꾼다
```

`Card`는 아래 칸만 가진다. 값은 괄호의 기존 함수에서 받는다.

| 칸 | 값의 출처 |
|---|---|
| `brand` | 원본 브랜드(이름, 로고용) |
| `category` | `brand.category`, 한글 라벨은 `CATEGORIES` |
| `best` | `splitOffers(applyFilters가 거른 offers, include).best[0]`가 대표 오퍼 |
| `amountLabel` | `amountText(best)`. 금액이 있으면 뒤에 " 할인"을 붙인다. 묶음 행사나 금액이 없으면 `rawText` 그대로, 그것도 없으면 `금액 ?`(`conditionTable`이 이미 쓰는 라벨) |
| `minLabel` | `minLabel(best.minOrderAmount)`. null이면 **"최소주문 미확인"**(기존 정식 라벨). 0이면 "최소주문 없음"이 그대로 나온다. 숫자일 때는 `n원↑`로 붙인다 |
| `chips` | `chipsOf(best)`에서 `onCard`로 거르고 `headOrder`로 정렬. 쿠팡와우, n시 오픈, 포장, 첫 주문 같은 조건 배지 |
| `href` | `offerLink(best, brand.links, brand.name)` |
| `apps` | `PLATFORMS` 네 앱을 돌며, 그 앱의 오퍼가 있으면 그 앱 대표 금액, **오퍼가 없으면 `-`**. 오퍼는 있는데 금액을 모르면 `금액 ?` |
| `capturedAt` | `latestCaptured(brand.offers)` |

- `include`는 `includesFrom(defaultFilters())`로 얻는다. 화면에 필터 UI는 없다. 기본 필터(5천원 이상, 할인액 높은 순)가 곧 홈이다.
- 앱 한 줄의 대표 금액은 `splitOffers(그 앱의 오퍼만, include).best[0]`로 얻는다. 직접 `max`를 구하지 않는다.
- `own`(브랜드 자사 앱) 오퍼는 `OWN_LABEL`("자사앱")로 이름을 붙이고 `apps` 줄에는 넣지 않는다(배달앱 네 곳만 견준다).
- `popularToday(brands)`가 세 곳 이상 내면 3장 카드 위에 "오늘 인기" 순서를 쓰는 안은 **하지 않는다**. 첫 3장은 기본 정렬 그대로다. 정렬 효과를 섞으면 시안 비교가 흐려진다.

## 5. 화면 구조 (360px)

위에서 아래로:

1. **머리줄.** 서비스 이름 한 줄. 가로 스크롤 없음.
2. **큰 카드 3장(가로 넘김).** 카드 폭은 화면의 약 85%로 두어 다음 카드가 가장자리에 걸려 보이게 한다. `scroll-snap-type: x mandatory`.
   - 16:9 사진 자리: `imageFor`의 그라데이션 배경 위에 큰 이모지. 왼쪽 위에 브랜드 로고(`BrandLogo`, 기존 컴포넌트를 불러 쓴다).
   - 사진 자리 아래: **"n원 할인"**(가장 크고 굵게) → 그 아래 줄에 **조건 배지 줄**(쿠팡와우, n시 오픈, 포장, 첫 주문 등) → 최소주문 한 줄(`n원↑` 또는 "최소주문 미확인").
   - 카드 전체가 `<a href>`다. 쿠폰 받으러 가는 자리이므로 카드 아래에 앱 이름이 붙은 버튼 모양 한 줄("배달의민족에서 받기" 꼴. 앱 이름은 `PLATFORM_BY_KEY[best.platform].label`, `own`이면 `OWN_LABEL`)을 둔다.
3. **목록.** 3장 아래로 나머지 브랜드를 한 줄 카드로.
   - 왼쪽에 작은 사진 자리(이모지 한 칸)와 로고, 가운데에 브랜드 이름과 "n원 할인", 그 아래 배지 줄.
   - 오른쪽 네 칸: 앱별 금액. 오퍼 없음은 `-`, 모름은 `금액 ?`.
   - 줄 전체가 `<a href>`다.
4. **갱신 시각 줄**(목표 1, 신뢰성). 화면 맨 아래와 큰 카드마다 `latestCaptured` 시각을 `M.D HH:mm 기준`으로 쓴다. 시안용 임시 문구이고 수집기 말("확인", "미확인", "판독", "관측")을 새로 만들지 않는다. 시각이 null이면 줄을 그리지 않는다. 푸터의 기존 문구 "확인일 기준"은 건드리지 않는다.

링크는 `target="_blank" rel="noopener noreferrer"`로 연다. http로 시작하는 링크에만 붙이고 앱 스킴(`coupangeats://`)은 일반 앵커로 둔다. 쿠팡이츠 공유 링크의 앱 열기 실패 안내(`openWithNotice`)는 시안에서 생략한다.

### 360px 넘침 방지

`document.documentElement.scrollWidth <= 360`이 완료 조건이다. 앞선 시안에서 버튼과 금액 칸이 잘렸다(#282, #284).

- 모든 flex 자식에 `min-width: 0`. 이름과 배지 줄은 `overflow: hidden; text-overflow: ellipsis`(배지는 `flex-wrap: wrap`으로 두어 자르기보다 줄바꿈).
- 금액 글자는 `clamp()`로 줄인다. 고정 px 폭을 쓰지 않고 `%`, `fr`, `minmax(0, 1fr)`를 쓴다.
- 가로 넘김 영역은 스크롤 컨테이너 안에서만 넘치게 하고 `body`는 `overflow-x: clip`.
- 앱별 금액 네 칸은 `grid-template-columns: repeat(4, minmax(0, 1fr))`. 칸마다 글자 크기를 낮춘다.
- `.cc-ticket` 같은 쿠폰 카드 CSS의 `containerType`을 건드리지 않는다. 이 시안은 그 클래스를 쓰지 않는다.

## 6. `main.jsx` 변경

이슈가 허용한 범위만 바꾼다.

```jsx
import App from './App.jsx'                  // 남긴다
import VisualShell from './shells/visual/VisualShell.jsx'
...
window.__legacyApp = App                       // 남긴다
...
<ErrorBoundary><VisualShell /></ErrorBoundary>   // App 대신
```

- **`import App`과 `window.__legacyApp = App`은 지우지 않는다.** 빼면 빌드가 쿠폰 카드 CSS 조각을 만들지 않아 `scripts/ssr-template.mjs`가 실패하고 프리뷰 배포가 깨진다(#254, #280, #289).
- 하이드레이션 불일치: 서버가 만든 HTML(`window.__SSR__`)은 기존 App 모양이라 `VisualShell`과 맞지 않는다. 프리뷰에서 불일치 경고나 깜박임이 보이면 `main.jsx`에서 `ssr`을 무시하는 한 줄(`const ssr = null`에 해당하는 변경)을 더 바꾼다. 그 경우 `setHubLinks(ssr.banners)`는 `VisualShell`이 `fetchBanners` 결과로 직접 부른다. **바꾸게 되면 PR 본문에 적는다.**
- `ssr`을 무시하지 않는 경우에도 `VisualShell`은 `fetchBrands`와 `fetchBanners`를 스스로 부르고, 받은 배너로 `setHubLinks(banners)`를 호출한다(허브 링크가 있어야 `offerLink`가 사다리 끝까지 간다). `setHubLinks`는 `offerLink.js`를 고치는 것이 아니라 그 모듈의 공개 함수를 부르는 것이다.
- 로딩 중과 실패 상태는 짧은 한 줄(스켈레톤 카드 또는 "불러오는 중")로 그린다. 값을 못 받았는데 `0`이나 빈 목록을 "없음"처럼 그리지 않는다.

## 7. 시험과 검증

- `data.test.js`(새 파일): 어댑터 시험만 한다. 로직 시험이 아니라 **모양 시험**이다.
  - 앱에 오퍼가 없으면 `-`, 금액을 모르면 `금액 ?`로 갈린다.
  - `minOrderAmount`가 null이면 "최소주문 미확인", 0이면 "최소주문 없음".
  - 금액이 있으면 "원 할인"으로 끝나고, 묶음 행사는 `rawText` 그대로.
  - 3장 카드는 `applyFilters` 결과의 앞 3개와 같다.
  - `imageFor`가 모든 `CATEGORIES` 키와 모르는 키에 대해 그라데이션과 이모지를 돌려준다.
- `web/package.json`의 `test` 사슬에 `src/shells/visual/data.test.js`를 넣는다(안 넣으면 안 돈다).
- `npm test`, `npm run build`가 통과해야 한다.
- 구조 검사: 커밋 전에 `python scripts/generate_project_structure.py`로 `docs/PROJECT-STRUCTURE.md`를 다시 만든다.
- 경계 검사: `git diff --stat main -- web/src/*.js`에 변경이 없고, `web/src/main.jsx`는 위 변경만 있다.
- 360px 스크린샷(큰 카드 3장이 보이는 첫 화면, 목록 부분)과 `scrollWidth <= 360` 값을 결과 댓글에 단다. 실제 운영 API 데이터로 그려졌는지, 카드를 눌러 앱 링크가 열리는지 프리뷰에서 눌러 본다.

## 8. 변경 전파 점검 ([`CHANGE-PROPAGATION.md`](../CHANGE-PROPAGATION.md))

| 묶음 | 이번 변경이 닿나 | 이유 |
|---|---|---|
| 1 확실성 판정 | 안 닿음 | `filters.js`를 고치지 않고 `applyFilters`, `splitOffers`가 낸 순서와 최고를 그대로 쓴다. 웹판 판정을 시안에서 다시 만들지 않는다 |
| 2~3 배너 모양, 묶음 배너 | 안 닿음 | `EventBanner.jsx`는 이 시안이 그리지 않는다. 배너는 허브 링크(`setHubLinks`)에만 쓴다 |
| 4 최소주문 출처 | 닿음, 지켜야 함 | 모르면 비우지 않고 "최소주문 미확인"으로 그린다. 틀린 문턱을 지어내지 않는다 |
| 6 화면에 나가는 글자 | **닿음** | 새 문구는 세션이 정하지 않는 것이 원칙이다. 이 시안은 버리는 시안이라 임시 문구를 이슈가 허용했다(5절의 "n원 할인", "~에서 받기", `M.D HH:mm 기준`). **병합하지 않으므로** 원장 검사, 배너 검사, 라벨(`platforms.js`)은 고치지 않는다. 좋은 문구가 살아남으면 그때 개발자에게 묻는다 |
| 7 행동 이벤트 | 안 닿음 | `track`을 쏘지 않는다(이슈가 생략을 허용). 그래서 이 시안의 클릭률은 PostHog에 안 쌓인다. 프리뷰는 눈으로만 비교한다. `ALLOWED_EVENTS`와 대조 스크립트는 건드리지 않는다 |
| 8 배포 순서 | 닿음 | 병합하지 않는다. 프리뷰 브랜치 `preview/shell-visual` push만 한다. API는 건드리지 않아 API 먼저 규칙에 걸리지 않는다 |
| 9 새 파일 | **닿음** | `PROJECT-STRUCTURE.md` 재생성, `data.test.js`를 `package.json` 시험 사슬에 넣기. beggars-ops `web/`와 nginx `types`는 이 저장소 웹과 무관 |

옛 응답에 새 웹을 물리는 사고(8번)는 이 시안에서도 날 수 있다. 어댑터가 `certainty`나 `popularityPrevious` 같은 칸이 없는 응답에서도 죽지 않아야 한다(칸이 없으면 기존 함수의 기본 동작을 따른다).

## 9. 위험과 열린 문제

- **하이드레이션 불일치**: 6절의 한 줄 변경으로 푼다. 프리뷰에서 보고 결정한다.
- **`own` 오퍼의 링크**: `offerLink`가 `offer.link`를 돌려준다. 링크가 비어 있으면 앵커를 만들지 않고 카드를 클릭 불가로 둔다(빈 `href`로 현재 페이지가 열리는 사고를 막는다).
- **갱신 시각 문구**: `M.D HH:mm 기준`은 임시다. 시각은 브라우저 시간대가 아니라 한국 시간으로 쓴다(`Intl.DateTimeFormat`에 `timeZone: 'Asia/Seoul'`). 시각 포맷은 어댑터 한 곳에서만 만든다.
- **이모지 렌더링**: 기기마다 모양이 다르다. 시안에서는 받아들인다. 카테고리를 모르면 🍽️.
- **클릭률 측정 불가**: 분석 이벤트를 생략하므로 목표 3(클릭률)은 이 시안으로 숫자를 못 얻는다. 화면의 눈에 띄는 정도만 본다.
- **카테고리 이모지 대응**: `chicken` 🍗, `pizza` 🍕, `fastfood` 🍔, `cafe` ☕, `korean` 🍱, `japanese` 🍣, `convenience` 🛒. 일식과 편의점은 이슈 예시에 없어 시안이 정한다.

## 10. 구현 순서

1. `data.js`와 `data.test.js`(시험 먼저).
2. `VisualShell.jsx`, `visual.css`.
3. `main.jsx` 한 곳, `package.json` 시험 사슬.
4. `npm test`, `npm run build`, 360px 스크린샷, `scrollWidth` 확인.
5. `python scripts/generate_project_structure.py`, 커밋.
6. `preview/shell-visual` push는 사람 또는 sub 세션이 한다.

## 변경 이력

- 2026-11-03 구현: 이슈 결정 절("SSR 하이드레이션 불일치가 보이면 `ssr`을 무시해도 된다")에 따라 처음부터 `main.jsx`에서 `const ssr = null`로 둔다. 서버 HTML은 기존 App 모양이라 하이드레이션하지 않고 통째로 그린다. `window.__legacyApp = App`은 현재 `main.jsx`에 없어 새로 넣었다.
- 2026-11-03 구현: `web/package.json`의 `test`는 `scripts/run-node-tests.mjs`가 `src/` 아래 `*.test.js`를 모두 찾아 돈다. 사슬에 따로 적을 필요가 없어 `package.json`은 바꾸지 않았다.
