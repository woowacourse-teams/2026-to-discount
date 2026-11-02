# 239: 홈 리뉴얼 시안 - 할인 순위판(ranking 껍데기)

- 이슈: [#239](https://github.com/woowacourse-teams/2026-to-discount/issues/239) (묶음 이슈 #230)
- 상태: 설계 초안(승인 대기)
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 프리뷰(`preview/shell-ranking`)만 본다.
- 범위: `web/src/shells/ranking/` 새 파일, `web/src/main.jsx` 한 줄. 그 밖은 0줄.

## 1. 목표와 시안의 개념

리뉴얼 목표(사용자 2026-11-03, 우선순위 순): ① 값이 언제, 어디서 확인됐는지 믿을 수 있게 ② 핵심(얼마, 어느 앱, 조건)을 빠르게 전하고 강조 ③ 누를 곳을 빨리 보여 클릭률과 재방문율을 올림.

이 시안의 개념은 **순위판**이다. 할인액 순위 1~10을 막대 길이로 보여 준다. 숫자와 막대로 한눈에 비교하고, 막대가 곧 누르는 자리다.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 순위 계산이 이미 있는가 | `popularToday(brands)`가 `[{brand, rank, change}]`를 낸다. **다섯 개까지만** 낸다(`STRIP_SIZE = 5`) | `web/src/popularStrip.js:6,30` |
| 인기 탭에서 10위를 어떻게 얻나 | `ranks(brands, 'popularityToday')`가 export돼 있다. 이름 → 순위(동점은 같은 순위) 맵이다. 앞 10개를 자르면 `popularToday`와 같은 순위 규칙이다. `popularToday`는 `change`(등락)까지 필요할 때만 쓴다 | `popularStrip.js:15` |
| 할인액 순위의 값 | `displayBestAmount(offers, include)`가 화면에 찍을 최고 할인액이다. 특정메뉴 쿠폰뿐인 브랜드에 정렬용 4,999원을 끼우지 않는다. 막대 길이에 `bestConfirmedAmount`를 쓰면 4,999가 진짜 값처럼 그려지므로 쓰지 않는다 | `filters.js:441`, 같은 파일 432~440행 주석 |
| 할인액 순서 | `sortBrands(brands, { sorts, include })`가 확정 없는 브랜드를 뒤로 보내고 금액순으로 세운다. 순위 번호는 이 순서를 따른다 | `filters.js:311` |
| 오퍼 링크 | `offerLink(offer, brand.links, brand.name)`. 쿠팡이츠는 안내 오버레이가 필요해 클릭 처리는 `openWithNotice(e, href)`(같은 파일 export)를 쓴다. 기존 카드가 같은 짝으로 쓴다 | `offerLink.js:184`, `CouponCard.jsx:56,63` |
| 관측 시각 | 오퍼의 `capturedAt`을 `latestCaptured(offers)`가 모은다. **지금 어떤 `.jsx`도 이 값을 그리지 않는다**(검색 결과 없음). 신뢰성 표시는 이 시안이 처음 그린다 | `filters.js:289`, `web/src/*.jsx` 검색 |
| 허브 링크 | 쿠팡이츠 허브 링크는 `setHubLinks(banners)`가 먼저 불려야 들어간다. 지금은 `main.jsx`가 SSR 데이터로만 부른다. 이 시안이 배너를 받아 불러야 같은 링크가 나온다 | `offerLink.js:164`, `main.jsx:96` |
| 홈이 어떻게 뜨는가 | `window.__SSR__`가 있으면 `hydrateRoot(<App initial=…>)`, 없으면 `createRoot`. 서버 HTML은 `App` 모양이다 | `main.jsx:95~131`, `App.jsx:99` |

## 3. 결정

### 3-1. 파일(전부 `web/src/shells/ranking/` 아래)

| 파일 | 역할 | 로직 |
| --- | --- | --- |
| `data.js` | 기존 모듈을 불러 껍데기용 모양으로 바꾸는 어댑터 | 위임만. 합계, 비율 말고는 계산 없음(3-3) |
| `RankingShell.jsx` | 화면 | 상태는 탭, 불러오기 상태 둘뿐 |
| `ranking.css` | 스타일 한 파일 | 클래스는 모두 `rk-` 접두사 |

`web/src/main.jsx`는 `import App` 한 줄과 `<App initial={ssr} />` 한 줄만 바꿔 `<RankingShell initial={ssr} />`로 한다. 나머지 줄은 안 건드린다. CSS는 `RankingShell.jsx`가 `./ranking.css`를 불러온다. 새 npm 의존성은 없다.

### 3-2. 데이터 흐름

- `RankingShell`이 마운트하면 `fetchBrands()`와 `fetchBanners()`를 부른다. `initial?.brands`가 있으면 그 값으로 첫 상태를 채우고 다시 부르지 않는다(`App.jsx:105,263`과 같은 규칙).
- 배너가 오면 `setHubLinks(banners)`를 부른다(쿠팡이츠 링크가 기존 카드와 같게 나오게).
- 필터는 `defaultFilters()`를 쓴다. 필터 UI는 만들지 않는다. 기본값은 5,000원 미만 오퍼를 거르고 `applyFilters(brands, defaultFilters())`가 숨김, 분류 없이 전체를 낸다.
- 어댑터 `data.js`가 내보내는 것:
  - `rankingRows(brands, tab)` → `[{ rank, brand, offer, amount, label, min, chips, capturedAt, href }]` 최대 10개.
  - `tab`은 `'amount'`(할인액) 또는 `'popular'`(인기).
  - `amount` 탭: `applyFilters` → `sortBrands`(금액순)로 세운 앞 10개. 값은 `displayBestAmount`, 순위는 같은 값이면 같은 순위.
  - `popular` 탭: `ranks(brands, 'popularityToday')`의 앞 10개. 값은 같은 `displayBestAmount`, 막대는 인기가 아니라 **할인액**으로 그린다(두 탭이 같은 막대 눈금을 쓰도록).
  - `offer`: 그 브랜드에서 `displayBestAmount`와 같은 금액인 오퍼(`comparable`과 `!soldOut`을 통과한 것). 문구는 `amountText`, 칩은 `chipsOf`에서 `onCard`로 거른 것을 `headOrder`로 세움, 최소주문은 `minLabel(offer.minOrderAmount)`.
  - `capturedAt`: `latestCaptured(brand.offers)`.
  - `href`: `offerLink(offer, brand.links, brand.name)`.
- `popularityToday`가 없거나 클릭이 적어 `ranks`가 3곳 미만이면(`STRIP_MIN`) 인기 탭은 그리지 않고 탭 자체를 숨긴다. 새벽에는 순위가 의미가 없다는 기존 규칙(`popularStrip.js:4`)을 따른다.

### 3-3. 막대

- 막대 길이 = `amount / 1위 amount` × 100%. 이 나눗셈이 어댑터의 유일한 계산이다. 로직이 아니라 그림 눈금이다.
- 1위가 0이거나 금액이 없으면(묶음 행사 등) 막대 없이 문구만 그린다.
- 막대 바탕에 금액 숫자를 겹친다. 막대가 짧아도 숫자는 읽혀야 하므로 숫자는 막대 밖 오른쪽에 둔다(막대 폭에 안 얽힘).
- 1+1 묶음 행사(`isBundle`)는 금액이 정렬값이라 순위에서 뺀다. 금액으로 줄 세울 수 없고, `amountText`가 원문을 쓰는 이유가 그것이다. 빼는 것은 `displayBestAmount`가 `null`을 주는 브랜드를 거르는 것과 같은 길이라 새 규칙이 아니다.

### 3-4. 화면(360px 첫 화면)

위에서 아래로:

1. **머리줄:** 제목, 그 아래 "n개 앱 · m개 브랜드 기준 · 가장 최근 확인 HH:mm". 값은 목록 전체 `capturedAt`의 최댓값이다. 목표 ①.
2. **탭 둘:** 할인액 / 인기. 기본은 할인액.
3. **순위 행 1~10:** 한 행 = 한 번의 누름 영역(행 전체가 링크).
   - 왼쪽 순위 숫자(1~3위는 강조색).
   - 가운데 브랜드 로고와 이름, 그 아래 막대.
   - 막대 오른쪽 끝에 큰 금액(`12,000원`).
   - 금액 아래 작은 줄: 앱 이름, 칩(첫 주문, 배달·포장, 멤버십), `최소주문 N원↑`.
   - 행 맨 아래 작은 글씨: 그 브랜드의 `capturedAt`(`11-02 09:10 확인`).
   - 오른쪽 끝 `받으러 가기` 글자. 목표 ③.
4. 1위 행은 약간 크게 그려 첫 화면에 3~4행이 보이게 한다.

**줄이되 숨기지 않는 조건:** 최소주문이 `null`이면 "최소주문 미확인"(`conditionTable`과 같은 문구, `couponModel.js:176`)을 그린다. 지어내지 않는다. 첫 주문, 월 1회, 선착순 같은 조건은 `chipsOf`가 주는 칩을 그대로 그린다. 칩이 넘치면 줄바꿈으로 둘째 줄까지 쓰고 말줄임으로 숨기지 않는다.

### 3-5. 클릭

- 행은 `<a href={href} target="_blank" rel="noopener noreferrer">`. 클릭 처리는 `openWithNotice(e, href)`를 부른다. 쿠팡이츠 안내 오버레이와 앱 링크의 같은 탭 열기를 기존 그대로 받으려는 것이다.
- `href`가 `undefined`면(`offerLink`가 못 풀 때) 행은 링크 없이 그려지고 `받으러 가기`를 숨긴다. 죽은 링크를 만들지 않는다.
- `track(...)` 분석 이벤트는 넣지 않는다(이슈가 생략을 허용). 7번 묶음(analytics)에 새 이벤트가 생기지 않으므로 `ALLOWED_EVENTS` 대조를 건드릴 일이 없다.

### 3-6. 하이드레이션

`main.jsx`가 `window.__SSR__`가 있을 때 `hydrateRoot`를 쓰는데, 서버 HTML은 `App` 모양이라 `RankingShell`과 어긋난다. React는 어긋나면 클라이언트 렌더로 되돌려 그린다(`onRecoverableError`가 오류 보고를 하나 남긴다). 그리지 못하는 것은 아니다. 껍데기 시안이라 `main.jsx`는 한 줄만 바꾸고 이 어긋남은 받아들인다. 프리뷰가 SSR 없이 뜨면 이 문제 자체가 없다. **프리뷰에서 실제로 어긋나는지는 아직 못 봤다**(구현 때 확인할 항목).

## 4. 어디까지 번지나(`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 닿는가 | 이유 |
| --- | --- | --- |
| 1 확실성 판정 | 읽기만 | `displayBestAmount`, `sortBrands`를 그대로 불러 쓴다. 판정을 다시 짜지 않아 웹판과 `certainty-cases.json` 대조는 깨지지 않는다. 막대에 `bestConfirmedAmount`를 쓰면 4,999원이 진짜 값처럼 그려지므로 쓰지 않는다(2절) |
| 2, 3 배너 모양, 묶음 배너 | 읽기만 | `setHubLinks(banners)`로 허브 링크만 받는다. `EventBanner`는 안 그린다 |
| 4 최소주문 출처 | 읽기만 | 모르면 "최소주문 미확인". 지어내지 않는다 |
| 6 화면에 나가는 글자 | **닿는다** | 새 문구가 생긴다(제목, "받으러 가기", "n개 앱 기준", "확인"). `docs/COPY-STYLE.md`는 새 문구를 세션이 정하지 않는다고 한다. 시안이라 임시 문구로 두고 **병합 전에 개발자가 정한다**(5절 리뷰 질문). "확인", "미확인"이 수집기 말로 샌 사고가 있었으므로 `capturedAt` 줄의 문구 선택은 특히 개발자 확인이 필요하다 |
| 7 행동 이벤트 | 안 닿는다 | 이벤트를 쏘지 않는다 |
| 8 배포 순서 | 안 닿는다 | 병합하지 않고 프리뷰만 쓴다. API 변경 없음 |
| 9 새 파일 | **닿는다** | 아래 3줄 참고 |

9번 새 파일 처리:

- `web/src/shells/ranking/`에 `*.test.js`를 새로 만들지 않는다. 그래서 `web/package.json`의 `test` 명령은 건드리지 않는다. 대신 어댑터가 기존 모듈 위임뿐이라 새로 박을 결론이 없다는 판단이다. 테스트가 필요해지면 `test` 사슬에 같이 넣는다.
- `docs/PROJECT-STRUCTURE.md`는 푸시 훅이 새 파일 때문에 막으면 `python scripts/generate_project_structure.py`로 다시 만든다. 이 PR은 병합하지 않으므로 훅이 막을 때만 한다.
- 이 브랜치는 `preview/shell-ranking`으로 올린다. `main` 직접 커밋이 아니므로 AGENTS.md의 프리뷰 규칙과 같은 길이다.

## 5. 구현자에게

1. 3-1의 파일만 만든다. `web/src/*.js`는 고치지 않는다. 확인: `git diff --stat main -- web/src/*.js`에 변경 없음, `web/src/main.jsx`는 두 줄(import와 렌더)만.
2. 어댑터에서 오퍼를 고를 때 `displayBestAmount`와 같은 조건(`comparable`, `o.amount != null`, `!o.soldOut`)을 쓰되, 새로 쓰지 말고 `comparable`을 불러 쓴다(`filters.js:227` export).
3. 순위 문구와 모든 새 글자는 `ranking/data.js` 상단 상수 한 곳에 모은다. 문구 확정 때 한 자리만 바꾸게.
4. `npm test`, `npm run build`가 통과해야 한다.
5. 360px 스크린샷을 찍어 결과 댓글에 단다. 첫 화면에서 순위 숫자, 막대, 금액, `받으러 가기`가 보여야 한다.
6. 실제 운영 API 데이터로 그려 보고 카드를 눌러 앱 링크가 열리는지 본다. 쿠팡이츠 행에서 안내 오버레이가 뜨는지도 본다.

## 6. 하지 않는 것

- 필터, 검색, 분류, 정렬 UI, 배너 영역, 푸시 설정, 푸터. 이 시안의 개념과 무관하다.
- 분석 이벤트.
- 기존 `App.jsx`와 컴포넌트 삭제.
- 새 규칙, 새 계산. 순위 같은 값 처리와 막대 비율은 위 3-3 한 곳이 전부다.

## 7. 리뷰 질문

1. 인기 탭의 막대를 인기가 아니라 **할인액**으로 그리는 것이 맞는가(두 탭의 눈금을 같게 하려는 선택)? 아니면 인기 탭은 막대 없이 숫자만 둘까?
2. 1+1 묶음 행사를 순위에서 빼는 것이 맞는가?
3. 신뢰성 줄("가장 최근 확인 HH:mm")의 문구는 개발자가 정할 것인가?
4. **프리뷰에서 하이드레이션 어긋남이 실제로 나는가: 미확인.** 나면 `main.jsx`에서 `ssr`일 때도 `createRoot`를 쓰게 한 줄 더 바꿔도 되는가?
