# 274. 홈 리뉴얼 시안 first-3s (버리는 껍데기)

- 이슈: #274 (묶음 #230). 병합하지 않는다. PR은 초안, 프리뷰만 본다.
- 프리뷰: `https://beggars-git-preview-shell-first-3s-nn98s-projects.vercel.app` (브랜치 `preview/shell-first-3s`, sub 세션이 push)
- 개념: 처음 온 사람이 3초 안에 "여기서 뭘 얻나"를 안다. 한 줄 가치 문장 → 오늘 최고 할인 하나 → 바로 누를 큰 버튼 → 그 아래 일반 목록. 두 번째 방문부터 문장을 접는다.
- 목표 순서(사용자 2026-11-03): 1 신뢰성(값이 언제 어디서 나왔나), 2 핵심(얼마, 어느 앱, 조건)을 빠르게, 3 누를 곳을 빨리.

## 1. 범위

| 하는 것 | 하지 않는 것 |
| --- | --- |
| `web/src/shells/first-3s/` 아래 새 파일 | `web/src/*.js` 수정 (diff 0줄) |
| `web/src/main.jsx` 한 줄: `<App>` → `<First3sShell>` | `App.jsx` 등 기존 컴포넌트 삭제 |
| CSS 파일 하나 | 새 npm 의존성 |
| 기존 모듈을 읽는 얇은 어댑터 `data.js` | 계산 로직 새로 작성 |

## 2. 파일

```
web/src/shells/first-3s/
  data.js            어댑터. 기존 모듈 호출과 모양 바꾸기만
  data.test.js       어댑터 시험 (run-node-tests가 src 아래를 훑어 자동으로 돈다)
  First3sShell.jsx   화면 전체 (불러오기, 상태, 조립)
  first3s.css        이 시안 전용 스타일
```

- `data.test.js`는 `scripts/run-node-tests.mjs`가 `src/` 아래 `*.test.js`를 재귀로 찾으므로 `package.json`을 고치지 않는다. 확인: 파일을 만든 뒤 `npm test` 출력에 이 파일이 나오는지 본다(안 도는 줄도 모르는 일을 막기 위함).
- 컴포넌트가 둘 이상 필요하면 `First3sShell.jsx` 안에 함께 둔다. 파일을 늘리지 않는다.

## 3. 데이터 어댑터 (`data.js`)

원칙: 기존 함수를 호출해 값을 모으기만 한다. 비교, 정렬, 금액 계산을 새로 쓰지 않는다.

| 화면 값 | 읽는 곳 |
| --- | --- |
| 브랜드 목록 | `fetchBrands()` (`api.js`). 실패하면 에러 상태 하나, 다시 시도 버튼 |
| 배너, 허브 링크 | `fetchBanners()` 뒤 `setHubLinks(banners)` (`offerLink.js`). `App.jsx`가 하는 것과 같은 호출 |
| 목록 순서 | `applyFilters(brands, defaultFilters())` (`filters.js`). 기본 필터가 운영 기본(5천원 이상, 할인액 높은 순, 신규 앞)이다 |
| 오늘 최고 할인 브랜드 | 위 목록의 첫 카드. 순서를 다시 계산하지 않는다 |
| 최고 오퍼 | `splitOffers(offers, includesFrom(filters)).best[0]` (`couponModel.js`). 최고가 없으면 같은 함수가 정한 대표 |
| 금액 | `amountText(offer)` |
| 조건 칩 | `chipsOf(offer)` 중 `onCard`가 참인 것, `headOrder`로 정렬. 첫 주문은 `qualifiersOf` 경유로 이미 들어 있다 |
| 최소주문 | `minLabel(offer.minOrderAmount)`. 숫자면 `원↑`을 붙여 `조건`으로 그린다 (`conditionTable`의 `min`과 같은 모양). `null`이면 `"최소주문 미확인"` |
| 앱 | `offer.platform` → `PLATFORM_BY_KEY[key].label` (`platforms.js`) |
| 누르면 열리는 링크 | `offerLink(offer, brand.links, brand.name)` |
| 시각 | `latestCaptured(brand.offers)`로 얻은 ISO 문자열을 `Intl`로 "N분 전" 꼴 변환 (표시 변환만) |
| 둘째 줄 이후 목록 | 같은 정렬 결과의 나머지. 카드마다 같은 어댑터를 쓴다 |

### 3-1. 없음과 모름

- 그 앱에 오퍼가 없다: `-` (앱별 금액을 나란히 그릴 때).
- 오퍼는 있는데 값을 모른다: 기존 라벨. 최소주문은 `"최소주문 미확인"`, 금액이 없으면 `amountText`가 주는 원문(`rawText`).
- 칸을 비워 두지 않는다. 비우면 "없음"으로 읽혀 목표 1(신뢰성)을 해친다.
- 어댑터 반환값에서 두 경우를 값으로 가른다(`{ kind: 'none' }` / `{ kind: 'unknown', label }` / `{ kind: 'value', ... }`). 화면은 `kind`만 보고 그린다.

### 3-2. 최고 할인이 없는 경우

`splitOffers`의 `hasBest`가 거짓이면 "오늘 최고 할인" 자리에 올리지 않는다. 제목을 "오늘 최고 할인"으로 달면 불확정 값을 확정처럼 보이게 한다(`displayBestAmount` 주석의 4,999원 사고와 같은 종류). 이 경우 목록 순서에서 `hasBest`가 참인 첫 브랜드를 고른다. 하나도 없으면 히어로 자리를 그리지 않고 목록만 보인다.

### 3-3. 첫 주문, 월 1회 같은 조건

`chipsOf`가 내는 칩만 그린다. 칩이 못 올린 조건 문장(`offer.conditions`)은 `conditionTable(offer).note`를 한 줄로 그대로 아래에 단다. 줄이되 숨기지 않는다.

## 4. 화면 (360px 기준)

위에서 아래로, 첫 화면(스크롤 전)에 1~3이 들어와야 한다.

1. **가치 문장 (첫 방문만)**: 한 줄. 임시 문구 `배달앱 쿠폰, 가장 큰 것만 모았어요`. 시안용이라 세션이 정했고 병합하지 않는다. 수집기 말(확인, 미확인, 판독, 관측 등)을 새로 쓰지 않는다.
2. **오늘 최고 할인 카드 (히어로)**: 브랜드 로고와 이름, 금액(가장 크게), 앱 이름, 조건 칩과 최소주문 라벨, 갱신 시각 작은 글씨(`N분 전 갱신`, 목표 1).
3. **큰 버튼**: 카드 폭 전체. 글자 `쿠폰 받으러 가기`(이슈가 이 말을 직접 썼다). 누르면 `offerLink(...)`로 연다. 쿠팡이츠 링크는 `openWithNotice`를 `onClick`에 걸어 기존 안내를 거친다(`OfferChip.jsx`의 쓰임을 따른다. 분석 `track`은 생략).
4. **일반 목록**: 같은 어댑터로 그린 작은 카드 줄. 카드를 누르면 `offerLink`로 앱을 연다.
5. 하단 푸터는 `SiteFooter`를 재사용해도 된다(수정 없이 import만).

시각 위계: 금액 > 앱 이름 > 조건 칩 > 갱신 시각. 숫자는 토스처럼 크고 굵게, 나머지는 한 단계 작게.

### 4-1. 접기 (두 번째 방문부터)

- 저장소 키 `dk_first3s_seen` (기존 키 `dk_guide_seen`, `dk_ce_notice_seen`과 같은 `dk_` 접두사).
- 읽기와 쓰기는 모두 `try/catch`로 감싼다(`firstVisitGuide.js`의 `markGuideSeen`과 같은 방식). 저장소가 막혀 있으면 매번 첫 방문처럼 문장을 보인다.
- **하이드레이션 순서**: 서버가 그린 HTML에는 localStorage가 없다. 처음 렌더는 항상 "문장 보임"으로 두고, 마운트 뒤 `useEffect`에서 키를 읽어 접는다. 그러면 서버 HTML과 첫 렌더가 일치한다. 문장을 쓰는 순간(첫 렌더 뒤)에 키를 쓴다.
- 접힘은 문장 줄만 사라지고 히어로, 버튼, 목록은 같다.

## 5. `main.jsx` 변경

- `import App from './App.jsx'`를 `import First3sShell from './shells/first-3s/First3sShell.jsx'`로, 트리의 `<App initial={ssr} />`를 `<First3sShell initial={ssr} />`로 바꾼다. 둘을 합쳐 이 시안의 변경은 이 파일에서 한 군데다(이슈의 "한 줄").
- `initial`(서버 렌더 데이터)을 받으면 브랜드와 배너를 그것으로 먼저 채우고 `fetchBrands`를 건너뛴다. `App.jsx`와 같은 규칙.
- **SSR 불일치가 프리뷰에서 보이면** `const ssr = window.__SSR__`를 `const ssr = null`로 바꾸는 한 줄을 더 넣어도 된다(이슈 결정). 그 경우 PR 본문에 적는다. 서버 HTML이 `App`의 모양이라 `First3sShell`과 다르기 때문에 하이드레이션 경고가 날 가능성이 높다. 구현자가 먼저 프리뷰 빌드로 콘솔 경고를 본다.

## 6. 변경이 어디까지 번지나 (`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 닿는가 | 이유 |
| --- | --- | --- |
| 1 확실성 판정 | 읽기만 | 최고 오퍼는 `splitOffers`, `displayBestAmount`가 정한다. 새 판정을 쓰지 않으므로 서버 판정표와 어긋날 수 없다 |
| 2, 3 배너 모양, 묶음 | 닿지 않음 | 배너는 `setHubLinks`에만 쓴다. 화면에 배너를 그리지 않는다 |
| 4 최소주문 출처 | 읽기만 | 모르면 기존 라벨 `"최소주문 미확인"`을 그린다. 숫자를 지어내거나 다른 오퍼의 값으로 채우지 않는다 |
| 6 화면 글자 | 닿는다 | 새 문구는 가치 문장, 버튼, 갱신 시각 세 곳. 임시 문구로 이슈가 허용했다. `check-copy.mjs`(npm test)와 부딪히면 문구를 고친다. 병합하지 않으니 `docs/COPY-STYLE.md`는 고치지 않는다 |
| 7 행동 이벤트 | 닿지 않음 | `track(...)`을 새로 쏘지 않는다. `ALLOWED_EVENTS` 대조에 걸리지 않는다 |
| 8 배포 순서 | 닿지 않음 | API 변경 없음. 프리뷰만 |
| 9 새 파일 | 닿는다 | `docs/PROJECT-STRUCTURE.md`를 `python scripts/generate_project_structure.py`로 다시 만들어 커밋한다. 테스트 파일은 자동으로 돈다(2절) |

같은 묶음의 나머지를 이번에 넣지 않는 이유: 위 표에서 "읽기만"인 묶음은 반대편을 고치지 않는다. 반대편이 안 바뀌므로 절반만 고친 상태가 생기지 않는다.

## 7. 시험

기존 규칙(AGENTS.md "결론은 테스트로 박는다")에 따라 어댑터의 잃기 쉬운 값 세 가지를 테스트로 박는다.

`data.test.js`(node:test, `from 'node:test'` 필수):

1. **모름과 없음이 다르게 나온다**: 최소주문이 `null`인 오퍼 → `"최소주문 미확인"`. 앱에 오퍼가 없으면 `none`. 둘이 같은 값이 아니다.
2. **최소주문 0은 "최소주문 없음"**: `null`과 `0`을 가른다(`minLabel`). 0이 `미확인`으로 떨어지면 틀린 값이다.
3. **최고 없음(`hasBest` 거짓)이면 히어로가 비는 것**: 불확정(최대, 랜덤)뿐인 브랜드가 "오늘 최고"로 오르지 않는다.
4. **조건이 숨지 않는다**: `conditions`가 `"첫 주문"`이면 칩으로, `"1일 1회, 배달만"`이면 `note`로 나온다. 어느 쪽이든 결과에 담긴다.
5. **링크는 `offerLink`와 같다**: 어댑터가 낸 `href`가 `offerLink(offer, links, name)`의 반환과 같다. 쿠팡이츠 오퍼는 `coupangeats://` 또는 `https://share.coupangeats.com/` 꼴이다.
6. **빈 목록**: 브랜드가 없거나 필터 뒤 0건이면 히어로 없이 빈 목록 상태를 낸다. 예외를 던지지 않는다.

테스트 픽스처는 `web/src/offerContract.test.js`와 `filters.test.js`가 쓰는 오퍼 모양을 따른다. 실제 API 응답을 한 번 받아 필드 이름을 맞춰 본다(`certainty`, `minOrderAmount`, `tiers`, `capturedAt`).

화면 시험(수동):

- `npm test`, `npm run build` 통과.
- `git diff --stat main -- web/src/*.js`에 `main.jsx` 말고 `shells/` 밖 변경이 없다.
- 360px 스크린샷: 첫 방문(문장 보임), 두 번째 방문(문장 접힘), 최소주문 미확인 카드, 쿠팡이츠 카드. 결과 댓글에 단다.
- 프리뷰에서 실제 운영 API로 그려지고 카드와 버튼이 실제 앱 링크를 연다.

## 8. 위험과 열린 질문

- **서버 HTML과 첫 렌더가 달라 콘솔 경고가 난다.** `main.jsx`에서 `ssr`을 무시하면 해결되지만 첫 그림이 늦다. 시안이므로 감수한다(5절).
- **갱신 시각을 어디까지 믿나.** `latestCaptured`는 오퍼 중 가장 최근 값이다. 히어로 오퍼 하나의 시각이 아니라 브랜드 전체의 최신일 수 있다. 히어로에는 히어로 오퍼의 `capturedAt`을 우선 읽고(`offer.capturedAt` 그대로), 없을 때만 `latestCaptured`로 대체한다. 이 어댑터의 선택이 신뢰성 목표에 맞는지 프리뷰에서 본다.
- **"N분 전" 계산은 로직이 아닌가.** 표시 변환일 뿐 비교, 정렬에 쓰지 않는다. 서버 렌더와 클라이언트 시각이 달라 불일치가 나므로 마운트 뒤에만 계산하고, 첫 렌더에는 날짜(`MM.DD HH:mm`)를 쓴다.
- **쿠팡이츠 링크**: 허브 링크를 바꾸는 주간 작업과 무관하다. 이 시안은 `COUPANGEATS_LINK`를 읽기만 한다.
- **열린 질문(개발자에게)**: 가치 문장과 버튼 글자를 시안 이후 정식 문구로 쓸지. 이번에는 임시다.
