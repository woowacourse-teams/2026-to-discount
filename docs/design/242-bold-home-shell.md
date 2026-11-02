# 242: 홈 리뉴얼 시안 "굵은 타이포 브랜딩(bold)"

- 이슈: [#242](https://github.com/woowacourse-teams/2026-to-discount/issues/242) (묶음 이슈 #230)
- 상태: 설계 초안(승인 대기)
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 프리뷰(`preview/shell-bold`)만 본다.
- 범위: `web/src/shells/bold/` 신규 파일, `web/src/main.jsx` 한 줄. 그 밖은 만지지 않는다.

## 1. 목표와 시안의 개념

리뉴얼 목표(우선순위 순): ① 값이 언제, 어디서 확인됐는지 믿을 수 있게 ② 핵심(얼마, 어느 앱, 조건)을 빠르게 ③ 누를 곳을 빨리 보여 클릭률과 재방문율을 올림.

이 시안의 개념: **진한 배경 + 아주 큰 금액 숫자.** 카드 수는 적게, 강조는 세게.

| 목표 | 이 시안의 답 |
| --- | --- |
| ① 신뢰 | 화면 맨 위에 가장 최근 관측 시각 한 줄. 카드마다 앱 이름(어느 앱)을 금액 바로 옆에 둠 |
| ② 핵심 전달 | 금액을 화면 폭에 가깝게 키운다(360px에서 56px 안팎). 앱, 조건은 금액 아래 한 줄 칩 |
| ③ 누를 곳 | 카드 전체가 앱 링크. 카드 안에 따로 색이 다른 큰 버튼 하나(문구는 §6 결정 1) |

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 브랜드 모양 | `brand.name`, `brand.offers[]`, `brand.links`, `brand.popularityToday` 등을 쓴다 | `CouponCard.jsx:56`, `popularStrip.js` |
| 링크 만드는 법 | `offerLink(offer, brand.links, brand.name)`가 사다리로 링크를 낸다. 쿠팡이츠는 허브(공유 링크)로 간다 | `offerLink.js:184` |
| 쿠팡이츠 클릭 처리 | 링크 클릭 시 `openWithNotice(e, href)`가 안내 토스트를 띄우고 이동한다. 이것 없이 `<a href>`만 두면 쿠팡이츠는 안내 없이 바로 이동 | `offerLink.js:106` |
| 표시 금액 | `displayBestAmount(offers, include)`는 4,999원 정렬 천장 같은 가짜 값을 빼고 액면을 낸다 | `filters.js:441` |
| 허브 링크 | `setHubLinks(banners)`를 불러야 배민 등의 허브 폴백이 선다. 지금은 `main.jsx`가 SSR 데이터로 부른다 | `main.jsx:96` |
| 홈 SSR | `window.__SSR__`이 있으면 `hydrateRoot`로 서버 HTML에 붙는다. 껍데기를 `App` 대신 그리면 서버 HTML과 달라 하이드레이션이 어긋난다 | `main.jsx:95` |
| 새 문구 규칙 | 세션이 화면에 새 문구를 정하지 않는다. 개발자에게 묻는다 | `docs/COPY-STYLE.md` 32행, `CHANGE-PROPAGATION.md` 6번 |

## 3. 결정

### 3-1. 파일 (전부 `web/src/shells/bold/` 아래)

| 파일 | 역할 |
| --- | --- |
| `BoldShell.jsx` | 화면. 위에서 아래로 헤더(관측 시각), 카테고리 가로 칩, 카드 목록 |
| `data.js` | 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 바꿀 뿐 계산하지 않는다 |
| `bold.css` | CSS 파일 하나 |

시험 파일 `data.test.js`를 하나 둔다(§5). 새 npm 의존성 없음.

### 3-2. `data.js` 어댑터

`loadBoldHome()`이 `fetchBrands()`와 `fetchBanners()`를 부르고(실패하면 던진다), 다음을 돌려준다.

```
{ capturedAt, categories, cards: [ { key, brandName, amount, amountText, appChip,
                                     chips[], minLabel, href, offer, brand, popularRank } ] }
```

- `capturedAt`: `latestCaptured(모든 브랜드의 offers 합친 목록)`. 없으면 `null`(그리지 않음).
- 목록: `applyFilters(brands, defaultFilters())` → `sortBrands(..., { sorts: defaultFilters().sorts, include })`. 기본 필터를 그대로 쓴다. 홈과 같은 순서다.
- 카드 수가 적어야 하므로 위에서 **상위 6장**만 자른다(상수 `BOLD_CARD_LIMIT = 6`). 순서를 바꾸는 계산이 아니라 `slice`다. 카테고리 칩을 누르면 `applyFilters`의 `categories`에 넣어 다시 뽑는다. 칩 목록은 `CATEGORIES`.
- 카드의 오퍼: `displayBestAmount(b.offers)`와 `amount`가 같고 품절이 아닌 첫 오퍼. 못 찾으면 그 브랜드는 건너뛴다(값을 지어내지 않는다).
- 금액 글자: `amountText(offer)`를 그대로 쓴다. 숫자와 "원 할인"을 나눠 그릴 때만 CSS로 크기를 달리한다.
- 칩: `chipsOf(offer)`에서 `onCard`인 것을 그대로(채널, 멤버십, 한정, 첫 주문 등). 최소주문은 `minLabel(offer.minOrderAmount)`, 모르면(`null`) 칸을 비운다.
- 인기 순위: `popularToday(brands)`에서 이름으로 찾아 순위 숫자만 붙인다. 없으면 표시하지 않는다.
- `href`: `offerLink(offer, brand.links, brand.name)`.
- 허브 링크: `fetchBanners()` 결과로 `setHubLinks(banners)`를 어댑터 안에서 부른다. 이 호출이 없으면 허브 폴백 링크가 서지 않는다(§7).

### 3-3. `BoldShell.jsx` 화면

360px 첫 화면 기준.

- 바탕은 거의 검정(`#0b0b0f`), 글자는 흰색. 앱 색은 칩과 버튼에만 쓴다.
- 맨 위 한 줄: 가장 최근 관측 시각. 숫자와 기호만으로 낸다(예: `10/30 14:20`). 앞뒤 설명 문구는 §6 결정 1.
- 카드는 한 줄에 한 장, 높이를 크게 잡는다. 안에 위에서 아래로 브랜드 이름(작게), 금액(아주 크게, 굵게), 앱 칩 + 조건 칩, 최소주문 줄, 이동 버튼.
- 카드 전체가 `<a>`다. `OfferLinkA`와 같은 속성을 쓴다: 웹 주소면 `target="_blank" rel="noreferrer"`, 커스텀 스킴이면 같은 탭. `onClick`에서 `openWithNotice(e, href)`를 부른다.
- `aria-label`: `${브랜드} ${금액}, 앱으로 이동`(기존 카드와 같은 문구라 새 문구 아님).
- 금액, 조건(최소주문, 첫 주문, 월 1회 등)은 줄이되 숨기지 않는다. 칩이 넘치면 줄바꿈을 허용하고 `overflow: hidden`으로 자르지 않는다.
- 로딩, 실패 문구는 새로 만들지 않고 빈 화면 대신 바탕만 그린다. 실패 문구는 §6 결정 1.
- 분석 이벤트(`track`)는 생략한다. 프리뷰는 `dev`라 운영 집계에 안 섞인다.

### 3-4. `main.jsx` 한 줄

`<App initial={ssr} />`를 `<BoldShell />`로 바꾼다. 이 브랜치 한정이다. 기존 `App.jsx`와 다른 컴포넌트는 지우지 않는다.

- 위험: 홈은 `window.__SSR__`이 있으면 `hydrateRoot`로 서버가 그린 기존 홈 HTML에 붙는다(`main.jsx:111`). `BoldShell`이 그 HTML과 다르면 하이드레이션이 어긋난다.
- 구현자는 먼저 프리뷰 콘솔에서 어긋남 경고가 나는지 본다. 나면 `rootEl.innerHTML = ''`를 `hydrateRoot` 앞에 한 줄 더하는 것까지만 허용한다(`main.jsx` 예외 한 줄을 PR에 적는다). 그래도 안 되면 `ssr` 분기를 `createRoot`로 바꾸는 대신 멈추고 보고한다.
- `BoldShell`은 `window.__SSR__`을 읽지 않고 스스로 가져온다.

## 4. 동반 변경 묶음 (`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 해당 | 이번 작업에서 |
| --- | --- | --- |
| 1 확실성 | 읽기만 | 판정을 새로 짜지 않고 `displayBestAmount`, `sortBrands`를 그대로 부른다. 웹판 판정을 복제하지 않는다 |
| 2~3 배너 모양, 묶음 | 해당 없음 | `fetchBanners()`는 허브 링크용으로만 읽는다. 배너를 그리지 않는다 |
| 4 최소주문 | 읽기만 | `minLabel`이 `null`이면 칸을 비운다 |
| 5 알림 | 해당 없음 | |
| 6 화면 글자 | **해당** | 새 문구를 정하지 않는다. 어쩔 수 없이 필요한 자리는 §6 결정 1로 묻는다 |
| 7 행동 이벤트 | 해당 없음 | `track` 호출 없음. 새 이벤트 이름 없음 |
| 8 배포 순서 | 해당 없음 | API 변경 없음. 병합하지 않음 |
| 9 새 파일 | **해당** | `data.test.js`를 `web/package.json`의 `test`에 넣어야 도는지 확인(`run-node-tests.mjs`가 `src/**/*.test.js`를 모두 돌면 필요 없음, 구현자가 확인). `generate_project_structure.py`로 구조 문서를 다시 만드는 일은 **버리는 시안이라 하지 않는다**(푸시 훅이 막으면 구현자가 보고) |

## 5. 시험

`web/src/shells/bold/data.test.js`. `fetch`를 가짜로 꽂아 어댑터 순수 부분만 시험한다(`loadBoldHome`에 `fetchers` 인자로 주입).

- 기본 필터·정렬 결과의 상위 6장이 `sortBrands(applyFilters(...))` 앞 6개와 같은 이름 순서(홈과 순서가 같다는 근거).
- 카드 금액이 `displayBestAmount`와 같다. 특정메뉴 쿠폰뿐인 브랜드에 4,999원이 찍히지 않는다.
- 카드 `href`가 `offerLink` 결과와 같다. 쿠팡이츠 오퍼는 허브 링크.
- 최소주문을 모르는(`null`) 오퍼는 `minLabel`이 `null`로 간다. 0원은 `최소주문 없음`.
- 오퍼가 하나도 없는 입력이면 `cards`가 빈 목록이고 던지지 않는다. `capturedAt`이 `null`.
- 품절 오퍼만 가진 브랜드는 카드에서 빠진다(값을 지어내지 않는다).

빈 목록 시험은 "없다"를 보이는 시험이라 양성 신호도 함께 둔다: 같은 시험 파일에서 오퍼가 있는 입력으로 `cards.length > 0`을 먼저 확인한다(AGENTS.md "먼저 알 것" 1).

화면은 `npm run build`와 기존 `npm test` 통과, 360px 스크린샷으로 본다.

## 6. 결정이 필요한 것

1. **새 문구를 넣어도 되는가.** 설계 단계에서 세션이 정하지 않는다. 필요한 자리는 셋이다. 답이 없으면 아래 기본값으로 구현한다.
   - 관측 시각 줄의 앞뒤 말(예: "n분 전 갱신"). 기본값: 말 없이 `10/30 14:20` 숫자만. (`COPY-STYLE` 4번이 "확인, 관측" 같은 말을 막는다.)
   - 이동 버튼 문구. 기본값: 글자 없이 기존 `LinkIcon` 모양의 화살표 아이콘만.
   - 불러오기 실패 안내. 기본값: 없음(빈 바탕).
2. **카드 수 6장이 맞는가.** "카드 수는 적게"의 숫자를 내가 정했다. 프리뷰를 보고 바꿀 수 있다(상수 하나).
3. **금액 순 정렬만 쓰는가.** 인기순이나 최신순을 칩으로 고르게 하지 않는다. 이 시안은 한 가지 인상을 보이는 용도다.

## 7. 끊기면 무엇이 보이나

- `setHubLinks`를 안 부르면 배민 등 링크가 없는 오퍼가 허브 폴백 없이 `undefined`로 나가고 `href.startsWith`가 던진다. 카드 하나가 아니라 화면이 죽을 수 있다. 어댑터에서 부르고, 시험에서 `href`가 문자열인지 본다.
- `openWithNotice`를 안 부르면 쿠팡이츠 카드가 안내 없이 허브 링크로 바로 간다(화면은 멀쩡하고 사람만 헤맨다).
- `displayBestAmount` 대신 `bestConfirmedAmount`를 쓰면 특정메뉴 쿠폰뿐인 브랜드에 4,999원이 큰 글씨로 찍힌다(`filters.js:432` 주석의 사고).
- 하이드레이션 어긋남은 프리뷰 콘솔 경고로 드러난다. 화면 자체는 그려질 수도 있어 눈으로만 보면 놓친다. 콘솔을 본다.
- 이 시안을 병합하면 SSR 홈, 공유 링크 복원, 분석 이벤트가 모두 빠진다. 병합하지 않는 이유다. 좋은 부분만 가져갈 때는 이 중 무엇이 빠졌는지 다시 본다.

## 8. 구현 순서

1. `data.js`, `data.test.js`. `npm test` 초록.
2. `BoldShell.jsx`, `bold.css`, `main.jsx` 한 줄. `npm run build` 통과.
3. 완료 조건 점검: `git diff --stat main -- web/src` 에서 `shells/` 밖 변경이 `main.jsx` 하나뿐.
4. `preview/shell-bold` push(사람 또는 sub 세션), 실제 운영 API 데이터로 360px 스크린샷을 이슈 결과 댓글에 단다. 카드를 눌러 앱 링크가 열리는지, 콘솔에 하이드레이션 경고가 없는지 함께 본다.
