# 270 홈 리뉴얼 시안: 초압축 + 신뢰 표시 (trust-compact)

이슈: [#270](https://github.com/woowacourse-teams/2026-to-discount/issues/270). 묶음 이슈 #230. 웹만 바꾼다. API 변경 없음. **병합하지 않는 시안**이다. PR은 초안으로 두고 프리뷰만 본다.

## 결론

compact 시안(#241)의 한 줄 목록에 trust 시안(#235)의 신뢰 표시를 작은 글자로 붙인다. 한 줄에 `브랜드 · 금액 · 앱 · 조건`을 두고, 줄 끝에 "얼마나 최근 값인지"와 "확정이 아닌 값인지"를 작게 단다. 스캔 속도는 compact에서, 믿을 근거는 trust에서 가져온다.

- 새 파일은 `web/src/shells/trust-compact/` 아래에만 둔다. 파일은 셋이다: `data.js`(어댑터), `TrustCompactShell.jsx`(화면), `trust-compact.css`(스타일).
- 기존 로직 파일(`api.js`, `filters.js`, `couponModel.js`, `offerLink.js`, `popularStrip.js`)은 고치지 않는다.
- `web/src/main.jsx`의 홈 렌더 한 줄만 `<TrustCompactShell />`로 바꾼다(이 브랜치 한정).

## 배경

시안 비교용 껍데기다. 같은 데이터를 다른 모양으로 그려 프리뷰로 비교하고, 좋은 부분만 모은다.

리뉴얼 목표(사용자 2026-11-03, 우선순위 순):

1. 화면의 신뢰성: 값이 언제, 어디서 확인됐는지 믿을 수 있게.
2. 핵심(얼마, 어느 앱, 조건)을 빠르게 전하고 강조.
3. 누를 곳(쿠폰 받으러 가기)을 빨리 보여 클릭률과 재방문율을 올린다.

이 시안의 가설: 한 줄 목록은 3번(빠른 클릭)에 강하고 1번(신뢰)에 약하다. 줄마다 작은 신뢰 표시를 달면 스캔 속도를 지키면서 1번을 채울 수 있다.

## 화면

360px 기준. 위에서 아래로:

1. **머리 한 줄**: 서비스 이름 자리와 "마지막 갱신 N분 전"(전체 오퍼의 `latestCaptured`). 목표 1을 첫 화면에서 드러내는 자리다.
2. **카테고리 칩 한 줄**: `전체` + `CATEGORIES`. 가로 스크롤. 하나만 고른다.
3. **브랜드 줄 목록**: 인기순이 아니라 기본 정렬(할인금액 높은 순, `sortBrands`/`applyFilters` 기본값).
4. 아래 "더 보기" 없이 전부 이어 그린다(시안이므로 가상화 안 함, 줄이 낮아 충분).

### 브랜드 줄 (높이 약 52px)

```
[로고] 교촌치킨        12,000원  ›     ← 줄 1: 이름, 대표 금액(굵게, 크게)
       배민 · 최소 20,000원 · 첫 주문    ← 줄 2: 앱, 최소주문, 조건 칩
       ● 3시간 전                       ← 줄 3: 신뢰 표시(작게)
```

실제 구현은 줄 2와 줄 3을 한 줄에 이어도 된다(폭이 모자랄 때 줄 3을 줄 2 오른쪽으로). 구현자가 360px 스크린샷으로 정한다.

- 줄 전체가 링크다. 누르면 대표 오퍼의 `offerLink(offer, brand.links, brand.name)`로 연다. 목표 3.
- 줄 오른쪽 끝에 앱 이름이 아니라 `›` 한 글자만 둔다. 앱 이름은 줄 2에 있다.
- 쿠팡이츠 링크는 기존 `openWithNotice(e, href)`를 `onClick`에 걸지 않는다(분석과 안내는 생략 가능, 이슈). 단 쿠팡이츠는 안내 없이 링크가 열리면 쿠폰 받기 단계를 놓친다. **리뷰 포인트 1** 참고.

### 신뢰 표시 (이 시안의 핵심)

점 하나와 글자 하나로 쓴다. 새 모델을 만들지 않고 오퍼에 이미 있는 칸을 읽는다.

| 보이는 것 | 읽는 칸 | 규칙 |
|---|---|---|
| 점 + "N분/N시간/N일 전" | `offer.capturedAt` (대표 오퍼) | 1시간 안 초록, 24시간 안 노랑, 그 뒤 회색. 점 색은 보조일 뿐 글자가 정본이다 |
| "불확정" · "랜덤" · "특정메뉴" 칩 | `chipsOf(offer)`의 `qualifier-*` 칩 | 기존 칩을 그대로 쓴다. 확정(`certainty === 'exact'`)이면 칩 없음 |
| `최소주문 미확인` | `minLabel(offer.minOrderAmount)`가 null | 칸을 비우지 않는다(결정). 기존 정식 라벨 |

- 확정 여부는 "불확정이면 표시, 확정이면 무표시"다. 확정에 "확정" 글자를 새로 달지 않는다. 수집기 말을 새로 만들지 않기 위함이다(`docs/COPY-STYLE.md` 1-4).
- `capturedAt`이 없으면 시각 글자를 그리지 않고 점도 회색으로 둔다. "방금"으로 채우지 않는다. 모르는 값을 틀린 값으로 바꾸지 않는다.

### 없음과 모름

한 줄에 앱 네 곳(배민, 쿠팡이츠, 땡겨요, 요기요)의 금액을 모두 보이지는 않는다. 대표 오퍼 하나와, 다른 앱이 있으면 `+2`처럼 개수만 단다. 비교가 필요한 사람은 줄을 눌러 앱으로 간다.

앱별 칸을 그려야 하는 자리(펼침, 줄 안 작은 칸)가 생기면:

- 그 앱에 오퍼가 없다: `-`
- 오퍼는 있는데 값을 모른다: 기존 라벨. 최소주문은 `minLabel`이 null일 때 "최소주문 미확인"(`couponModel.conditionTable`이 쓰는 라벨과 같다)을 그린다. 금액은 `amountText`가 원문(`rawText`)을 돌려주므로 그 글자를 그대로 쓰고, 새 라벨을 만들지 않는다

이 시안의 기본 줄은 앱별 칸이 없으므로 대표 줄에서는 이 규칙이 `+N` 개수와 최소주문 라벨에만 닿는다.

## 데이터: `web/src/shells/trust-compact/data.js`

얇은 어댑터 한 파일이다. 계산 로직을 새로 만들지 않고 기존 함수를 불러 화면용 모양으로 바꾼다.

```js
import { fetchBrands } from '../../api.js'
import { applyFilters, defaultFilters, displayBestAmount, includesFrom, latestCaptured, CATEGORIES } from '../../filters.js'
import { amountText, chipsOf, onCard, qualifiersOf, minLabel, channelOf } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
```

노출하는 것(이름은 구현자가 정해도 된다):

- `loadRows()`: `fetchBrands()`를 부르고 `applyFilters(brands, defaultFilters())`로 거른 뒤 줄 모양 배열을 돌려준다.
- 줄 모양: `{ key, name, category, amount(문자열), platformLabel, min(문자열), chips[], extraApps(숫자), capturedAt, href, brand }`
- `latestUpdate(brands)`: 머리 한 줄용. `latestCaptured`를 그대로 부른다.
- `categoriesOf()`: `CATEGORIES`를 그대로 돌려준다(`visibleCategories`를 쓸지는 구현자 선택. 쓰면 기존 홈과 같은 탭이 서고 안 쓰면 일곱 개가 다 선다).

### 대표 오퍼 고르기

기존 규칙을 다시 짜지 않는다.

- 대표 금액은 `displayBestAmount(offers, includesFrom(filters))`가 준다. 그 금액을 내는 오퍼가 대표다(동점이면 `couponModel.splitOffers(offers, include).best[0]`).
- `splitOffers`가 `best`를 비우는 경우(확정이 없는 브랜드)는 그 함수가 이미 `sorted[0]`을 대표로 돌려준다. 그대로 쓴다.
- `splitOffers`는 `couponModel.js`가 내보내는 함수다. 어댑터는 이 함수 하나로 대표를 정하고 직접 비교하지 않는다.

### 상대 시각 글자

`capturedAt`을 "3시간 전"으로 바꾸는 한 함수(`ago(iso, now)`)를 `data.js`에 둔다. 이것이 이 어댑터의 유일한 새 계산이다.

- 입력 하나(ISO 문자열), 출력 하나(문자열 또는 null). 분기는 분/시간/일 세 개다.
- `now`를 인자로 받아 테스트할 수 있게 한다.
- 이 계산은 "계산 로직 금지"와 부딪힐 수 있다. **리뷰 포인트 2** 참고.

## 화면 연결: `main.jsx`

```diff
-import App from './App.jsx'
+import TrustCompactShell from './shells/trust-compact/TrustCompactShell.jsx'
 ...
-<ErrorBoundary><App initial={ssr} /></ErrorBoundary>
+<ErrorBoundary><TrustCompactShell /></ErrorBoundary>
```

- `import App`를 지우지 않아도 된다(안 쓰는 import는 린트 경고뿐이면 남긴다). 이슈가 "한 줄 제외"라고 했으니 import 한 줄과 렌더 한 줄까지가 이 변경의 상한이다.
- `setHubLinks(ssr.banners)`는 그대로 둔다. 배너를 안 그려도 쿠팡이츠 허브 링크 폴백이 이 호출에 기대므로, 껍데기가 `fetchBanners()`를 불러 `setHubLinks`를 걸지는 **구현자가 정한다**(아래 위험).
- 프리뷰에서 하이드레이션 불일치가 보이면(서버가 App을 그려 보낸 HTML 위에 껍데기를 얹는 경우) `const ssr = window.__SSR__`를 `const ssr = null`로 바꾸는 한 줄을 더 바꿔도 된다. PR 본문에 적는다(이슈 결정).

## 변경 전파 점검

`docs/CHANGE-PROPAGATION.md`에서 이 작업이 닿는 묶음을 찾았다.

| 묶음 | 닿는가 | 판단 |
|---|---|---|
| 1 확실성 판정 | 읽기만 | 확정 여부를 `chipsOf`의 칩으로 읽는다. 판정을 새로 만들지 않아 판정표와 어긋날 일이 없다 |
| 4 최소주문 출처 | 읽기만 | `minLabel`이 null이면 "최소주문 미확인"을 그린다. 문턱을 짓지 않는다 |
| 6 화면에 나가는 글자 | **닿는다** | 시안용 임시 문구를 세션이 정해도 된다(이슈 결정). 수집기 말("확인", "미확인", "판독", "관측")을 새로 만들지 않는다. "최소주문 미확인"은 기존 라벨이라 예외다. `check-copy.mjs`는 `web/src/*.jsx`만 읽어(`readdirSync('src')`) `shells/` 아래는 검사하지 않는다. 그래서 자동 검사가 못 잡는다 |
| 7 행동 이벤트 | 닿지 않음 | `track(...)`을 새로 쏘지 않는다. `ALLOWED_EVENTS` 대조 스크립트와 어긋날 일이 없다. 클릭 분석은 생략(이슈) |
| 8 배포 순서 | 닿지 않음 | 병합하지 않는 시안이고 API 변경이 없다 |
| 9 새 파일 | **닿는다** | 아래 "새 파일" 참고 |
| 2·3·5 배너 | 닿지 않음 | 배너를 그리지 않는다 |

### 새 파일

- `python scripts/generate_project_structure.py`로 `docs/PROJECT-STRUCTURE.md`를 다시 만든다. 설계 커밋 전에 한 번, 구현 커밋 전에 또 한 번 돌린다(구조 검사가 push 훅에서 막는다).
- 새 테스트 파일은 만들지 않는다. 만들면 `web/package.json`의 `test` 사슬에 넣어야 하고 그 파일도 diff에 든다. 병합하지 않는 껍데기여서 기존 테스트와 `npm run build` 통과, 360px 스크린샷으로 갈음한다. `ago`처럼 규칙이 있는 함수가 틀렸을 때는 화면 글자로 바로 드러난다.
- `offerContract.test.js`는 `web/src` 바로 아래 파일만 스캔(`readdirSync(SRC)`, 비재귀)한다. `shells/` 아래에서 `offer.xxx`로 읽는 칸이 API 계약(`offerKeys`) 안에 있는지는 자동으로 못 본다. 구현자는 읽는 칸을 `amount, capturedAt, certainty, conditions, link, linkSource, membership, minOrderAmount, platform, qualifier, qualifiers, tiers, badge, soldOut`로 한정하고 `offerKeys` 밖은 읽지 않는다.

## 만지는 파일

| 파일 | 변경 |
|---|---|
| `web/src/shells/trust-compact/data.js` | 새 파일 |
| `web/src/shells/trust-compact/TrustCompactShell.jsx` | 새 파일 |
| `web/src/shells/trust-compact/trust-compact.css` | 새 파일 (CSS는 이 파일 하나) |
| `web/src/main.jsx` | 홈 렌더 한 줄(과 import 한 줄), 필요 시 `ssr` 무시 한 줄 |
| `docs/PROJECT-STRUCTURE.md` | 스크립트로 재생성 |

만지지 않는 파일: `api.js`, `filters.js`, `couponModel.js`, `offerLink.js`, `popularStrip.js`, `App.jsx`, 다른 컴포넌트, `package.json`.

## 완료 확인

- 360px 첫 화면에 점과 "N시간 전", 불확정 칩이 줄마다 보인다.
- 운영 API 데이터로 그려지고, 줄을 누르면 대표 오퍼의 앱 링크가 열린다.
- `git diff --stat main -- web/src/*.js`에 `shells/` 밖 변경이 없다(`main.jsx`는 `.jsx`라 이 명령에 안 잡힌다. `git diff --stat main -- web/src`로 한 번 더 본다).
- `npm test`, `npm run build` 통과.
- 360px 스크린샷을 결과 댓글에 단다.
- 프리뷰는 `preview/shell-trust-compact`로 sub 세션이나 사람이 push한다(`docs/WORKFLOW.md` §3-3). PR 본문 맨 위에 `https://beggars-git-preview-shell-trust-compact-nn98s-projects.vercel.app`를 적는다. PR은 초안 유지, 병합하지 않는다.

## 위험

- **쿠팡이츠 안내 생략**: `openWithNotice`를 안 걸면 쿠팡이츠 줄은 안내 없이 링크가 열린다. 시안 비교용이어도 쿠팡이츠 줄을 눌러 본 사람이 "쿠폰 받기" 단계를 놓칠 수 있다.
- **허브 링크 폴백**: `main.jsx`의 `setHubLinks(ssr.banners)`는 SSR 데이터가 있을 때만 돈다. 껍데기가 배너를 안 읽으면 브랜드 링크 없는 앱의 오퍼가 앱 홈(`coupangeats://` 등)으로 떨어진다. 사라지는 것이 아니라 도착점이 덜 좋아진다.
- **SSR 하이드레이션**: 서버가 `App`을 그려 보낸 HTML 위에 껍데기를 하이드레이션하면 불일치가 난다. 위 `main.jsx` 절의 한 줄로 푼다.
- **`capturedAt` 신선도의 뜻**: 이 칸은 "수집기가 그 값을 본 시각"이다. 사용자 화면에서 "3시간 전"은 "3시간 전에 확인된 값"으로 읽힌다. 수집기가 오래 멈춰 있으면 값이 낡았다는 사실이 드러나는 것이 이 시안의 목적이므로 의도한 효과다.

## 리뷰 포인트

1. 쿠팡이츠 줄에 `openWithNotice`를 걸까, 시안이니 생략할까? **기본 제안: 줄 `onClick`에 `openWithNotice(e, href)`만 건다(분석 없음, 한 줄).**
2. `ago()`는 새 계산 한 함수다. 어댑터에 두는 것이 "계산 로직 금지"에 걸리는가? **기본 제안: 표시 글자 변환은 계산이 아니라 형식 변환으로 보고 둔다.**
3. 머리 한 줄의 "마지막 갱신 N분 전" 문구는 임시다. 이슈 결정상 세션이 정해도 되는가? **수집기 말(확인, 관측)은 쓰지 않는다.**
4. 카테고리 칩을 `visibleCategories`로 줄일까, 일곱 개 전부 둘까? **기본 제안: `visibleCategories`로 기존 홈과 같게.**
