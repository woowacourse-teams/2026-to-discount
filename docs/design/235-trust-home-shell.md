# 235: 홈 리뉴얼 시안 "신뢰 먼저"(trust 껍데기)

- 이슈: [#235](https://github.com/woowacourse-teams/2026-to-discount/issues/235), 묶음 이슈 #230
- 상태: 설계 초안(승인 대기)
- 성격: **버리는 시안. 병합하지 않는다.** PR은 초안으로 두고 프리뷰(`preview/shell-trust`)만 본다.
- 범위: `web/src/shells/trust/`(새 파일), `web/src/main.jsx` 한 줄(이 브랜치 한정)

## 1. 목표와 시안의 개념

리뉴얼 목표(사용자 2026-11-03, 우선순위 순): ① 값이 언제, 어디서 확인됐는지 믿을 수 있게 ② 핵심(얼마, 어느 앱, 조건)을 빠르게 강조 ③ 누를 곳을 빨리 보여 클릭률과 재방문율 상승.

이 시안은 ①을 1순위로 둔다. 360px 첫 화면에 아래가 드러나야 한다.

- 화면 상단: 마지막 확인 시각과 확인 방법 한 줄.
- 카드마다: 몇 분 전 확인, 어느 앱 화면 기준인지, 확정과 불확정 구분.
- 카드 안: 금액을 크게, 앱 이름과 조건은 줄이되 숨기지 않기, 쿠폰 받으러 가기 버튼을 카드 안 눈에 띄는 자리에.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 관측 시각이 오퍼마다 오는가 | 온다. `capturedAt` 문자열. 브랜드 안 최신은 `latestCaptured(offers)`가 준다 | `filters.js:289`, `Offer.java:21` |
| 관측 시각을 "몇 분 전"으로 바꾸는 함수가 있는가 | **없다.** 이번에 어댑터에 둬야 한다(§3-3). 아래 §3-3의 한계 참고 | `web/src` 전체 검색 |
| 확정과 불확정 판정 | `certaintyOf(offer)`가 `exact`, `menuOnly`, `capped`, `random`, `percent` 중 하나를 준다. 없으면 `exact` | `filters.js:156` |
| **앱 화면 출처 값이 응답에 있는가** | **없다.** 서버 `Offer`의 `screenshotPath`는 `@JsonIgnore`라 응답에 안 실린다. 웹이 쓸 수 있는 출처는 `platform`(어느 앱)뿐이다 | `Offer.java:21` |
| "확인한 방법" 문장을 줄 칸이 있는가 | 없다. 고정 문구를 화면에 쓸 수밖에 없다 | `fetchBrands` 응답 |
| 그리는 데 필요한 모듈이 다 있는가 | 있다. 금액 `amountText`, 칩 `chipsOf`, 최소주문 `minLabel`, 최고액 `displayBestAmount`, 링크 `offerLink`, 정렬과 거르기 `applyFilters`, `defaultFilters` | `couponModel.js`, `filters.js`, `offerLink.js` |
| 카드를 누르면 링크가 열리는가 | `offerLink(offer, brand.links, brand.name)`이 주소를 준다. 쿠팡이츠는 `openWithNotice` 안내를 거쳐야 한다 | `offerLink.js:106,184` |
| 브랜드 객체에 링크 맵이 있는가 | `offerLink`의 두 번째 인자가 `brandLinks`다. 실제 필드 이름은 구현자가 `App.jsx`의 호출부를 보고 같게 쓴다 | `offerLink.js:184` |

## 3. 설계

### 3-1. 파일

새 파일은 `web/src/shells/trust/` 아래에만 둔다.

| 파일 | 맡는 일 |
| --- | --- |
| `data.js` | 기존 모듈을 불러 껍데기용 모양으로 바꾸는 얇은 어댑터. **계산 로직 금지** |
| `TrustShell.jsx` | 홈 화면. 데이터를 받고 머리와 카드 목록을 그린다 |
| `TrustCard.jsx` | 카드 하나. 크지 않으면 `TrustShell.jsx` 안에 둬도 된다 |
| `trust.css` | 이 시안의 CSS 하나. 클래스는 `trust-` 접두사 |

고치는 기존 파일은 `web/src/main.jsx` 한 줄뿐이다. 기존 `App.jsx`와 다른 컴포넌트는 지우지 않는다. 새 npm 의존성 없음.

### 3-2. `main.jsx` 연결

- 기본안(한 줄): `import App from './App.jsx'`를 `import App from './shells/trust/TrustShell.jsx'`로 바꾼다. 트리의 `<App initial={ssr} />`는 그대로 두고 `TrustShell`이 `initial` prop을 받아 무시한다. 이슈의 "main.jsx 한 줄" 예외에 맞는다. import와 교체 두 줄을 원하면 승인 때 알린다(§7-1).
- 하이드레이션 문제: `window.__SSR__`가 있으면 `hydrateRoot`로 서버가 `App`으로 그린 HTML에 `TrustShell`을 얹는다. 트리가 달라 복구 가능 오류가 나거나 화면이 깨진다. 그래서 이 브랜치에서는 `ssr`을 무시하고 `createRoot(...).render(tree)`만 쓴다. 이것은 `main.jsx`의 `if (ssr)` 분기를 고치는 일이라 "한 줄"을 넘는다. 프리뷰 서버가 SSR HTML을 안 보내면(§8 첫 항목으로 확인) 고치지 않아도 된다. 고쳐야 하면 줄 수 예외를 승인 때 알린다(§7-1). `ssr.banners`로 허브 링크를 채우는 `setHubLinks(ssr.banners)`는 `TrustShell`이 `fetchBanners()` 결과로 직접 부른다(쿠팡이츠 링크 사다리의 허브 단계가 그대로 동작하게 하려는 것).
- `main.jsx`에 이미 있는 `?home=a` 같은 변이 처리, 분석 시작 코드는 건드리지 않는다.

### 3-3. `data.js` 어댑터가 내보내는 것

기존 모듈의 반환을 그대로 모으기만 한다. 아래 외의 계산을 넣지 않는다.

- `loadHome()`: `fetchBrands()`와 `fetchBanners()`를 부르고 `setHubLinks(banners)`를 호출한 뒤 `{ brands }`를 돌려준다. 실패하면 던진다. 화면이 실패 문구를 그린다.
- `visibleBrands(brands)`: `applyFilters(brands, defaultFilters())`. 기본 필터(5천원 이상, 인기가 아니라 할인액 내림차순, 신규 앞)가 운영 화면과 같은 목록을 준다. 카테고리 탭은 이 시안에서 그리지 않는다(§4).
- `lastChecked(brands)`: 모든 브랜드의 `latestCaptured(b.offers)` 중 가장 늦은 값. 비교는 `latestCaptured`가 이미 하는 문자열 비교를 한 번 더 쓴다. 값이 하나도 없으면 `null`.
- `cardOf(brand)`: 카드 한 장이 필요한 값을 모은다.
  - `best`: `splitOffers`가 내는 대표 오퍼(동점이면 맨 앞). 금액 글자 `amountText(best)`, 최소주문 `minLabel(best.minOrderAmount)`, 칩 `chipsOf(best)`에서 카드에 올리는 것(`onCard`).
  - `certainty`: `certaintyOf(best)`.
  - `capturedAt`: `latestCaptured(brand.offers)`.
  - `link`: `offerLink(best, brand.links, brand.name)`.
  - `platform`: `best.platform`.
  - `splitOffers`는 `couponModel.js`에서 이미 내보낸다. 새로 짜지 않는다.
- `agoText(iso, now)`: 시각을 "N분 전", "N시간 전", "어제"로 바꾸는 **표시용 변환 하나**. 이것은 "계산 로직 금지"에 가장 가까운 자리이므로 규칙을 아래로 못박는다.
  - 1분 미만은 "방금". 60분 미만은 분. 24시간 미만은 시간. 그 이상은 날짜(`M월 D일`).
  - 기준은 한국 시각이 아니라 두 시각의 차이라 시간대 계산이 없다.
  - `capturedAt`이 미래이거나 파싱이 안 되면 `null`을 돌려주고 화면은 그 줄을 그리지 않는다(틀린 값을 그리느니 비운다, `AGENTS.md`).
  - 이 함수는 원장이 "수집한 시각"을 그대로 주는 값에만 쓴다. 운영 API가 `capturedAt`을 항상 현재에 가깝게 주는지는 §6에서 실제 응답으로 확인한다.

### 3-4. 화면

위에서 아래로.

1. **머리 띠(상단 고정 아님, 첫 화면 맨 위)**
   - 큰 줄: "마지막 확인 N분 전"(`agoText(lastChecked)`), 옆에 절대 시각(`HH:mm`, 한국 시각).
   - 작은 줄: 확인 방법 한 줄. 문구는 §5-1에 따라 확정 전 자리 표시.
   - `lastChecked`가 `null`이면 큰 줄을 그리지 않는다(없는 시각을 지어내지 않는다).
2. **카드 목록(브랜드 한 장씩)**: 위 §3-3 `cardOf` 값으로 그린다. 360px에서 한 줄에 한 장.
   - 맨 위 한 줄: 브랜드 이름(`shortBrandName` 사용 가능), 오른쪽에 "N분 전"(`agoText(capturedAt)`).
   - 중앙: 최고 금액을 가장 크게. 바로 아래에 앱 이름과 칩(채널, 멤버십, 첫 주문 등)과 최소주문을 작게. 줄여도 지우지 않는다.
   - 확정 표식: `certainty === 'exact'`는 확정 표식, 그 외(`menuOnly`, `capped`, `random`, `percent`)는 불확정 표식과 이유 칩. 두 표식은 색이 달라야 하고 글자 없이도 구분되는 모양(채운 점과 속 빈 점)을 함께 쓴다.
   - 하단: 쿠폰 받으러 가기 버튼. `<a href={link}>`이며 쿠팡이츠 링크는 `onClick`에서 `openWithNotice(e, link)`를 부른다(`offerLink.js:106`). 링크가 `undefined`이면 버튼을 그리지 않는다.
3. **오퍼가 없는 브랜드**: `applyFilters`가 이미 뺀다.

### 3-5. 테스트와 점검

- `data.js`의 `agoText`와 `lastChecked`는 값 변환이라 시험을 둔다: `web/src/shells/trust/data.test.js`. 새 `*.test.js`는 `web/package.json`의 `test` 명령에 넣어야 하나 `run-node-tests.mjs`가 `src/**/*.test.js`를 전부 도는지 구현자가 `package.json`을 열어 **먼저 확인**하고, 안 돌면 명령에 넣는다(`AGENTS.md`의 새 파일 규칙, 이슈 #221 설계 §4와 같은 확인).
- 시험 사례: 경계(59초, 60초, 59분, 60분, 23시간 59분, 24시간), 미래 시각, 파싱 불가 문자열, 빈 목록의 `lastChecked`가 `null`, 같은 시각 동점.
- 기존 `npm test`와 `npm run build`가 통과해야 한다.
- `git diff --stat main -- web/src` 결과에서 `web/src/shells/` 밖의 변경이 `main.jsx` 하나여야 한다. 이슈의 명령 `web/src/*.js`는 `main.jsx`를 안 잡으므로 `web/src` 전체로 본다.

## 4. 하지 않는 것

- 카테고리 탭, 검색, 필터 시트, 정렬 선택, 인기 띠(`popularToday`), 배너 캐러셀, 푸시 알림, 상세 시트, 분석 이벤트(`track`). 이 시안의 개념과 관계없다. 이슈가 분석 이벤트 생략을 허용한다.
- API, 수집기, 기존 로직 파일 수정. 앱 화면 출처 칸이 응답에 없어도 API를 고치지 않는다(§5-2).

## 5. 동반 변경 묶음(`docs/CHANGE-PROPAGATION.md`)과 걸리는 점

| 묶음 | 해당 | 이번 작업에서 |
| --- | --- | --- |
| 1번 확실성 | 읽기만 한다 | `certaintyOf`와 `displayBestAmount`, `splitOffers`를 그대로 부른다. 판정을 웹에서 새로 쓰지 않는다 |
| 2번 배너 모양, 3번 묶음 배너 | 해당 없음 | 배너를 그리지 않는다. `setHubLinks`에 넘기는 것뿐이다 |
| 4번 최소주문 | 읽기만 한다 | `minLabel`이 모르면 `null`을 준다. 화면은 지어내지 않고 "최소주문 미확인" 칸 그대로 비운다 |
| 6번 화면 글자 | **해당. 아래 §5-1** | 새 문구가 필요하다 |
| 7번 행동 이벤트 | 해당 없음 | `track`을 안 쏜다 |
| 8번 배포 순서 | 해당 없음 | 병합하지 않는다. 프리뷰만 |
| 9번 새 파일 | **해당** | `web/src/shells/trust/` 새 파일 때문에 `docs/PROJECT-STRUCTURE.md`가 어긋난다. 푸시 훅이 막으므로 `python scripts/generate_project_structure.py`를 돌려 같은 커밋에 넣는다. 병합하지 않는 브랜치라도 훅은 push 전에 돈다 |

### 5-1. 화면 문구는 세션이 정하지 않는다 (결정 필요)

`docs/COPY-STYLE.md`가 **막은 것과 이 시안이 쓰려는 것이 부딪힌다.**

- COPY-STYLE 4번: "확인, 대조, 표기, 파서, 미확인, 관측, 수집, 판독, 추정, 실측, 정정"은 사용자 화면에 쓰지 않는다. 6번 묶음 설명도 새 문구는 세션이 정하지 않고 개발자에게 묻는다고 한다.
- 그런데 이슈가 요구하는 화면 문구가 "몇 분 전 **확인**", "**확인**한 앱 화면", "마지막 **확인** 시각", "확정/**추정**"이다.

이 시안은 **버리는 껍데기**이고 시안의 목적이 그 문구를 눈으로 보는 것이므로, 설계는 다음으로 간다. 구현자가 문구를 지어내지 않게 자리 표시를 한 곳에 모은다.

- 문구는 `data.js`가 아니라 `TrustShell.jsx` 맨 위의 `COPY` 상수 한 곳에 모은다. 값은 **이슈 본문의 말을 그대로** 쓴다: 머리 큰 줄 "마지막 확인 {n}분 전", 카드 "{n}분 전 확인", 확정 "확정", 불확정 "추정"과 이유 칩의 기존 문구(`badgesOf`의 "랜덤", "특정메뉴", "불확정"). 확인 방법 한 줄은 구현자가 짓지 않고 **자리 표시로 "앱 화면에서 직접 확인한 값"** 으로 둔다(사실과 맞는 문장인지는 §6 질문 2).
- 승인자가 보고 고치는 곳이 `COPY` 한 곳이라 문구 변경이 한 번에 끝난다.
- **이 문구들은 병합 대상이 아니다.** 시안 중 일부를 채택해 본 화면에 옮길 때는 COPY-STYLE을 다시 거쳐 문구를 개발자에게 받아야 한다. PR 본문 리뷰 포인트에 적는다.

### 5-2. 앱 화면 출처는 `platform`뿐이다

이슈는 "확인한 앱 화면 출처"를 카드에 두라고 한다. 응답에 화면 출처(스크린샷 종류나 화면 이름)가 없다(§2). 그래서 이 시안에서는 **`platform`의 이름("배민", "쿠팡이츠" 등)을 출처로 쓴다**: "배민 앱에서 3분 전 확인".

- 그럴듯하게 만든 값("앱 홈 화면" 같은 문구)을 넣지 않는다. 데이터에 없는 사실을 화면이 주장하면 신뢰 시안의 취지에 반한다.
- 진짜 화면 출처가 필요하면 API가 칸을 열어야 하고 수집기 칸(`schema.py`)과 맞춰야 하는 별도 묶음이다. 이 시안에서는 후속 조치 후보로만 남긴다(§7).
- 플랫폼 표시 이름은 기존 `web/src/platforms.js`(`PLATFORMS`)에서 읽는다. 구현자가 그 파일의 이름 칸을 열어 확인하고 새 표를 만들지 않는다.

## 6. 시험(프리뷰 검증)

### 6-1. 운영 데이터로 그려지는가

- 프리뷰에서 실제 운영 API 응답으로 카드가 서는지 본다. API 주소는 기존 `resolveApiBase`가 정한다.
- **양성 신호**(`AGENTS.md` "먼저 알 것"): "마지막 확인" 줄이 비어 있거나 모든 카드가 "방금"이면 아직 본 게 아니다. 운영 `/api/brands` 응답 중 한 오퍼의 `capturedAt` 원문을 구현자가 한 번 찍어 화면의 "N분 전"과 같은 시각인지 대조해 결과 댓글에 적는다.
- `capturedAt`이 `2026-01-01T00:00:00+09:00` 같은 고정 자리 표시(`export.json` 예시 값)로 오면 "10개월 전"으로 보일 수 있다. 그것이 운영 응답에서도 나는지 본다. 난다면 시안이 거짓을 그린 것이 아니라 원장이 그 값을 주는 것이므로 결과 댓글에 사실로 적는다.

### 6-2. 누르면 앱 링크가 열리는가

- 360px 실기기나 에뮬레이터에서 배민, 요기요, 쿠팡이츠 카드를 하나씩 눌러 링크가 열리는지 본다. 쿠팡이츠는 안내 오버레이가 뜬 뒤 이동한다.
- `undefined` 링크는 버튼이 안 그려지는지 확인한다.

### 6-3. 완료 조건 검사

- 360px 스크린샷: 첫 화면에 머리 띠(마지막 확인 시각, 확인 방법)와 카드의 "N분 전", 확정과 불확정 표식, 쿠폰 받으러 가기 버튼이 모두 보인다.
- `git diff --stat main -- web/src`에서 `shells/` 밖은 `main.jsx` 하나.
- `npm test`, `npm run build` 통과.

### 6-4. 프리뷰 올리기

구현이 끝나면 `preview/shell-trust`로 push한다(사람 또는 sub 세션, `docs/WORKFLOW.md` §3-3). CI가 미러로 옮겨 Vercel 프리뷰가 뜬다. 360px 스크린샷을 결과 댓글에 단다.

## 7. 결정이 필요한 것

1. **`main.jsx`를 한 줄 넘게 고쳐도 되는가.** 기본안은 import 한 줄 교체다(§3-2). 다만 SSR HTML이 프리뷰에도 내려와 하이드레이션이 깨지면 `if (ssr)` 분기도 고쳐야 한다. 그 경우만 줄 수 예외가 필요하다. 이슈의 `<TrustShell />` 문장과 기본안은 같은 화면을 낸다.
2. **"앱 화면에서 직접 확인한 값"이라는 한 줄이 사실인가.** 수집기가 실제로 앱 화면을 캡처해 읽는다는 근거는 설계자가 이 저장소에서 확인하지 못했다(수집기는 이 저장소에 없다). **확인하지 않은 가정이다.** 사실과 다르면 문구를 바꿔야 한다.
3. **화면 출처를 `platform` 이름으로 갈음해도 되는가**(§5-2). 진짜 화면 출처는 API 칸이 필요해 이 시안 범위를 넘는다.
4. **COPY-STYLE이 막은 말("확인", "추정")을 시안에 쓰는 것을 허용하는가**(§5-1). 이슈가 요구한 말이라 쓰되 병합 대상이 아님을 PR에 적는다.

## 8. 끊기면 무엇이 보이나

- `main.jsx`만 바꾸고 `ssr`을 무시하지 않으면 하이드레이션 오류로 서버 HTML(옛 홈)이 깜박이거나 화면이 섞인다. 프리뷰에서 처음 보이는 것이 옛 홈이면 이것이다.
- `setHubLinks`를 안 부르면 쿠팡이츠 허브 단계가 빠져 링크가 조용히 앱 홈이나 고정 공유 링크로 떨어진다. 화면은 멀쩡하고 클릭 도착점만 다르다.
- `agoText`가 시각을 못 읽을 때 빈 문자열이 아니라 "NaN분 전"을 그리면 신뢰 시안이 가장 신뢰를 잃는다. `null`이면 줄을 안 그리는 시험이 이를 막는다.
- 새 `*.test.js`가 안 돌면 초록으로 보이는 채 시험이 없다. `package.json`이 실제로 그 파일을 도는지 먼저 확인한다.
- 구조 문서(`docs/PROJECT-STRUCTURE.md`)를 안 다시 만들면 push 전 훅이 막는다.

## 9. 구현 순서

1. `web/package.json`의 `test` 명령이 `src/**/*.test.js`를 도는지 확인한다.
2. `data.js`와 `data.test.js`. 시험을 먼저 돌려 초록.
3. `trust.css`, `TrustShell.jsx`(`COPY` 상수 포함). 360px로 로컬에서 본다.
4. `main.jsx` 연결, `npm test`와 `npm run build`, `git diff --stat` 확인.
5. `scripts/generate_project_structure.py`로 구조 문서 다시 만들기.
6. 프리뷰 push(`preview/shell-trust`), 360px 스크린샷과 §6-1 대조 결과를 결과 댓글에.
