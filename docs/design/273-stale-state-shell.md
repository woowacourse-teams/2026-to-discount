# 273: 홈 리뉴얼 시안 - 믿을 수 있는 빈 화면과 늦은 화면 (stale-state)

- 이슈: [#273](https://github.com/woowacourse-teams/2026-to-discount/issues/273) (묶음 이슈 #230)
- 상태: 설계 초안(승인 대기). **버리는 시안이다. 병합하지 않는다.** PR은 초안으로 두고 프리뷰만 본다.
- 범위: `web/src/shells/stale-state/` 새 파일, `web/src/main.jsx` 한 줄(과 필요하면 한 줄 더). 기존 로직 파일과 컴포넌트는 고치지 않는다.

## 1. 문제

- 홈은 값이 언제 읽힌 것인지 보여주지 않는다. 값이 오래돼도, 비어도, API가 실패해도 사용자는 "지금 맞는 값"으로 읽는다.
- 리뉴얼 목표(우선순위 순): 1) 값이 언제 어디서 확인됐는지 믿을 수 있게, 2) 금액, 앱, 조건을 빠르게 전달, 3) 누를 곳을 빨리 보여 클릭률과 재방문율을 올림.
- 이 시안의 개념: 정상 화면 맨 위에 "마지막 갱신 n분 전" 띠를 두고, 늦은 화면(stale), 빈 화면(empty), 오류 화면(error)을 정상 화면과 같은 틀로 함께 설계한다.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 갱신 시각을 읽을 값이 있는가 | 있다. 오퍼마다 `capturedAt`(문자열 시각). 브랜드 응답에 전체 갱신 시각 칸은 코드에서 안 보인다 | `filters.js` `latestCaptured`, `web/src` 전체에서 `capturedAt`은 이 함수 한 곳만 읽음 |
| 전체 마지막 갱신 시각을 얻는 길 | 브랜드마다 `latestCaptured(brand.offers)`를 구하고 그 최댓값. 새 계산이 아니라 기존 함수의 반복 호출 | `filters.js:289` |
| `capturedAt` 시각 형식과 시간대 | **미확인.** 문자열 비교로 최댓값을 구하므로 ISO 형식으로 보이나 시간대 표기는 코드로 알 수 없다. 구현 첫 단계에서 운영 응답으로 본다 | `filters.js:291` |
| 홈이 오류를 어떻게 다루는가 | `fetchBrands`가 던진 오류를 `error` 상태에 담고 다시 시도 버튼으로 `reloadKey`를 올린다 | `App.jsx:262-271` |
| 배너 실패 | 삼킨다. 빈 목록과 같게 다룬다 | `App.jsx:273-283` |
| 오퍼 링크 | `offerLink(offer, brand.links, brand.name)`가 사다리로 앱 링크를 낸다. 허브 링크는 `setHubLinks(배너)`가 채운다 | `offerLink.js:164-193`, `CouponCard.jsx:56` |
| 최소주문을 모를 때 | `minLabel(null)`은 null. 정식 라벨 "최소주문 미확인"은 `conditionTable`의 행(`min`)에만 있다 | `couponModel.js:37`, `couponModel.js:176` |
| SSR | 서버가 `window.__SSR__`를 실으면 `main.jsx`가 `hydrateRoot`로 `<App>`을 하이드레이션한다. 껍데기 트리와 서버 HTML이 다르면 불일치가 난다 | `main.jsx:93-131` |
| 문구 검사 | `check-copy.mjs`는 `src/*.jsx` 바로 아래 파일만 읽는다. `shells/` 아래는 안 읽히므로 문구 규칙은 사람이 지킨다 | `web/scripts/check-copy.mjs:9` |

## 3. 결정

### 3-1. 파일 (전부 `web/src/shells/stale-state/` 아래)

| 파일 | 일 |
| --- | --- |
| `StaleStateShell.jsx` | 상태 머신과 화면 조립. 상태는 `loading`, `ok`, `stale`, `empty`, `error` |
| `data.js` | 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 옮긴다. **계산 로직 금지** |
| `stale-state.css` | CSS 한 파일. 클래스 이름은 `ss-` 접두사로 `App.css`와 겹치지 않게 한다 |

새 npm 의존성은 없다. 기존 파일은 지우지 않는다.

### 3-2. `data.js`가 하는 일 (모양 바꾸기만)

- `loadHome()`: `fetchBrands()`와 `fetchBanners()`를 부르고, 배너로 `setHubLinks`를 불러 허브 링크를 채운다. 배너 실패는 빈 배열로 삼킨다(`App.jsx`와 같은 규칙).
- `cardsOf(brands)`: `applyFilters(brands, defaultFilters())`로 기본 목록을 세운다. 정렬과 거르기는 홈과 같은 결과여야 하므로 `defaultFilters()`를 그대로 쓴다.
- 카드 하나의 값은 전부 기존 함수의 결과를 옮겨 담는다.
  - 금액: `displayBestAmount(offers)`와 `amountText(offer)`
  - 칩: `chipsOf(offer)`에서 카드에 오르는 것만(`onCard`). 앱 이름은 `platforms.js`의 라벨
  - 최소주문: `minLabel(offer.minOrderAmount)`. null이면 "최소주문 미확인"을 그린다(이슈 결정)
  - 링크: `offerLink(offer, brand.links, brand.name)`
- `updatedAtOf(brands)`: 브랜드마다 `latestCaptured(brand.offers)`를 모아 가장 큰 값. 비교는 `latestCaptured`와 같은 문자열 비교.
- `popularOf(brands)`: `popularToday(brands)` 그대로.

"몇 분 전" 글자 만들기와 상태 가르기(경계 시각 비교)는 로직이 아니라 표시 규칙이므로 `StaleStateShell.jsx` 안 작은 함수로 둔다. 결과를 바꾸는 판정은 하지 않는다.

### 3-3. 상태와 `?state=` (시안 전용)

| 쿼리 | 만드는 법 | 화면 |
| --- | --- | --- |
| 없음 | 실제 응답 | 갱신이 최근이면 `ok`, 오래됐으면 `stale` |
| `stale` | 실제 응답은 그대로 쓰고 "지금"만 갱신 시각 + 아래 3-4의 시험 간격으로 둔다 | 늦은 화면 |
| `empty` | 응답 대신 빈 배열을 쓴다 | 빈 화면 |
| `error` | 네트워크를 부르지 않고 오류를 던진다 | 오류 화면 |

- 데이터를 지어내지 않는다. `stale`은 값을 바꾸지 않고 시계만 옮긴다. 그래서 늦은 화면도 실제 운영 값으로 그려진다.
- 쿼리는 `new URLSearchParams(location.search).get('state')`로 읽고, 허용 목록 밖의 값은 없는 것으로 친다.
- `?state=`는 시안 전용이다. 분석 이벤트와 공유 링크 코드는 건드리지 않는다.

### 3-4. 늦음의 경계

- 신선도 단계는 둘로 한다: 최근(`ok`), 늦음(`stale`). 경계 시간은 `StaleStateShell.jsx` 맨 위 상수 하나(`STALE_AFTER_MIN`)다.
- **경계 값은 아직 정하지 못했다.** 수집 주기를 이 저장소에서 알 길이 없다(수집기는 이 저장소에 없다). 구현 첫 단계에서 운영 응답의 `capturedAt` 분포를 보고 정하고, PR 본문 리뷰 포인트에 적는다.
- `?state=stale`의 시험 간격은 경계의 두 배 정도로 둔다.

### 3-5. 화면 (360px 기준, 위에서 아래로)

1. **갱신 띠(맨 위, 고정):** "마지막 갱신 n분 전". `ok`는 중립색, `stale`은 경고색과 "오래된 값일 수 있어요" 같은 짧은 문구, 오류는 마지막 성공 시각이 없으면 띠를 그리지 않는다. n이 60분을 넘으면 "n시간 전", 하루를 넘으면 "n일 전".
2. **오늘 인기 띠:** `popularToday` 결과 상위. 세 곳이 안 되면 그리지 않는다(`STRIP_MIN` 규칙을 어댑터가 그대로 따른다).
3. **카드 목록:** 한 카드는 한 줄 정보 순서로 "금액(크게) → 앱 → 조건 칩 → 최소주문". 카드 전체가 `offerLink` 앵커이고 `target`은 새 탭, `rel="noopener noreferrer"`. 금액, 조건은 줄이되 숨기지 않는다.
4. **카드 안 신선도:** 카드 오른쪽 아래에 그 브랜드의 `latestCaptured` 기준 "n분 전"을 작게. 띠의 값과 카드의 값이 다르면 오래된 카드가 어느 것인지 보인다.
5. **없음과 모름의 구분:** 그 앱에 오퍼가 없으면 `-`, 값을 모르면 기존 라벨("최소주문 미확인"). 둘을 같은 빈 칸으로 그리지 않는다.

#### 상태별 화면

| 상태 | 띠 | 본문 | 누를 곳 |
| --- | --- | --- | --- |
| `ok` | 중립 "마지막 갱신 n분 전" | 카드 목록 | 카드 |
| `stale` | 경고색 | 카드 목록 그대로, 카드의 시각 글자도 경고색 | 카드(막지 않는다. 값이 늦을 뿐 링크는 유효) |
| `empty` | "마지막 갱신 n분 전"은 없음 | 빈 상태 한 장: 왜 비었는지(오늘 보일 할인이 없음), 앱을 직접 여는 버튼 | 앱 열기 버튼(`offerLink` 사다리 끝의 앱 링크) |
| `error` | 없음 | 오류 한 장: 불러오지 못함, "다시 시도" | 다시 시도, 앱 열기 |
| `loading` | 없음 | 회색 틀 카드 몇 장 | 없음 |

- 빈 화면과 오류 화면에도 앱을 여는 버튼을 둔다. 값이 없어도 사용자가 갈 곳이 있어야 목표 3(클릭률, 재방문)이 끊기지 않는다. 앱 링크는 `offerLink({ platform }, undefined, undefined)`로 얻는다. **이 호출이 오퍼 없이 앱 링크 끝 단계까지 내려가는지는 구현 때 확인한다.**

### 3-6. `main.jsx`

- 홈 렌더 줄 `<App initial={ssr} />`를 `<StaleStateShell />`로 바꾼다(이슈 완료 조건의 "한 줄").
- SSR 하이드레이션 불일치가 프리뷰에서 보이면 `const ssr = window.__SSR__`를 `null`로 바꾸는 한 줄을 더 바꾼다. 이 경우 PR 본문에 적는다. 껍데기가 서버 HTML과 다른 트리를 그리므로 불일치가 날 가능성이 높다고 본다. **프리뷰에서 확인한다.**
- `setHubLinks(ssr.banners)` 줄은 `ssr`이 null이면 건너뛰므로 안전하다. 허브 링크는 `loadHome()`이 채운다.

### 3-7. 문구

- 수집기 말("확인", "대조", "관측", "판독" 등)을 새로 만들지 않는다. 예외는 기존 정식 라벨 "최소주문 미확인" 하나로, 새 문구가 아니라 기존 라벨이다.
- 시안용 임시 문구(띠, 빈 상태, 오류)는 세션이 정한다(이슈 결정). 명사구나 짧은 문장, 45자 이내. 병합하지 않으므로 `docs/COPY-STYLE.md` §3의 개발자 확인은 생략하되 PR 본문에 "임시 문구"라고 적는다.

## 4. 변경 전파 점검

`docs/CHANGE-PROPAGATION.md`에서 건드릴 자리를 찾았다.

| 묶음 | 닿는가 | 판단 |
| --- | --- | --- |
| 1 확실성 판정 | 읽기만 | `filters.js`를 고치지 않고 `applyFilters`, `displayBestAmount`를 그대로 호출하므로 서버 순서와 어긋나지 않는다 |
| 2 배너 모양 / 3 묶음 배너 | 읽기만 | 배너는 허브 링크 채우기에만 쓰고 그리지 않는다 |
| 4 최소주문 출처 | 닿는다 | 모르면 "최소주문 미확인"을 그린다. 지어내지 않는다는 원칙을 따른다 |
| 6 화면에 나가는 글자 | 닿는다 | §3-7. `check-copy.mjs`가 `shells/`를 안 읽으므로 사람이 지킨다 |
| 7 행동 이벤트 | 닿지 않는다 | 이슈가 분석 이벤트 생략을 허용했다. `track(...)`을 쓰지 않으므로 허용 목록 대조에 걸리지 않는다. **대신 시안의 클릭률은 PostHog로 볼 수 없다** |
| 8 배포 순서 | 닿지 않는다 | API 변경이 없다. 병합하지 않는다 |
| 9 새 파일 | 닿는다 | `docs/PROJECT-STRUCTURE.md`를 다시 만든다. 새 테스트 파일을 만들면 `web/package.json`의 `test`에 넣는다(§5) |

## 5. 테스트와 검증

기존 로직을 고치지 않으므로 기존 테스트가 그대로 초록이어야 한다.

- 새 테스트는 `data.js`의 어댑터 하나만 둔다. 파일 이름은 `web/src/shells/stale-state/data.test.js`이고 `web/package.json`의 `test` 명령에 넣는다. 안 넣으면 안 돈다.
  - 시험 1: 오퍼가 없는 앱 칸은 `-`, 최소주문을 모르는 오퍼는 "최소주문 미확인"을 낸다. (없음과 모름의 구분을 박는다)
  - 시험 2: `updatedAtOf`는 브랜드 여럿 중 가장 큰 `capturedAt`을 낸다. `capturedAt`이 하나도 없으면 null이다. (null을 "방금"으로 읽지 않는다)
  - 시험 3: `?state=` 허용 목록 밖의 값은 없는 것으로 친다.
- `capturedAt`이 전부 없을 때 띠는 "마지막 갱신 n분 전"을 그리지 않는다. 모르는 시각을 "0분 전"으로 그리면 가장 나쁜 거짓이 된다.
- 명령: `npm test`, `npm run build`(web). 구조 문서는 `python scripts/generate_project_structure.py`.
- 확인: 360px 스크린샷 네 장(`ok`, `?state=stale`, `?state=empty`, `?state=error`)을 결과 댓글에 단다. 카드를 눌러 앱 링크가 열리는지도 본다.
- 완료 조건 검사: `git diff --stat main -- web/src/*.js`에 `shells/` 밖 변경이 없고, `main.jsx`는 한 줄(SSR 무시를 더하면 두 줄)만 바뀐다.

## 6. 고려한 대안

| 대안 | 버린 이유 |
| --- | --- |
| API에 전체 갱신 시각 칸 추가 | 이 시안은 API를 고치지 않는다. 시안이 채택되면 그때 따로 이슈로 연다 |
| `?state=stale`에서 오퍼 `capturedAt`을 과거로 바꿔 넣기 | 값을 바꾸면 실제 운영 값으로 그린다는 완료 조건이 흐려진다. 시계만 옮기는 쪽이 값을 지키는 쪽이다 |
| 기존 `App.jsx`에 상태 띠만 끼우기 | 기존 컴포넌트를 건드리지 않는다는 껍데기 규칙에 어긋난다 |
| 늦음 경계를 지금 숫자로 박기 | 수집 주기를 모른다. 틀린 경계는 멀쩡한 값에 경고를 붙이거나 늦은 값을 숨긴다 |

## 7. 리뷰 포인트

- **`capturedAt`의 형식과 시간대, 오퍼 전체에서 비어 있는 비율은 운영 응답을 보고 정한다. 지금은 가정이다.**
- **늦음 경계(`STALE_AFTER_MIN`)는 운영 갱신 간격을 본 뒤 정한다.**
- **`offerLink`를 오퍼 없이 불러 앱 링크를 얻는 길이 있는지는 구현 때 확인한다. 없으면 빈 화면의 앱 열기 버튼은 플랫폼 앱 링크 상수를 `platforms.js`에서 읽는다.**
- 프리뷰는 `preview/shell-stale-state` 브랜치로 올린다(`docs/WORKFLOW.md` §3-3). PR은 초안으로 두고 병합하지 않는다.
