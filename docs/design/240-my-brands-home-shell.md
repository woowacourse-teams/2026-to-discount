# 240: 홈 리뉴얼 시안 "내 브랜드" (my-brands)

- 이슈: [#240](https://github.com/woowacourse-teams/2026-to-discount/issues/240) (묶음 이슈 #230)
- 상태: 설계 초안(승인 대기). **버리는 시안이다. 병합하지 않고 프리뷰만 본다.**
- 범위: `web/src/shells/my-brands/` 새 파일 셋, `web/src/main.jsx` 이 브랜치 한정 수정

## 1. 목적

- 자주 보는 브랜드를 별표로 고르면 맨 위에 모아 보이는 홈의 재방문율 효과를 프리뷰로 본다.
- 리뉴얼 목표 순서(사용자 2026-11-03): 신뢰성(언제 확인됐나), 핵심 전달(얼마, 어느 앱, 조건), 누를 곳을 빨리 보여 줌.
- 로직은 새로 짜지 않는다. 기존 모듈이 주는 값을 그대로 그린다.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 홈이 서버 렌더 HTML을 하이드레이션하는가 | 한다. `window.__SSR__`가 있으면 `hydrateRoot(..., <App initial={ssr}/>)` | `web/src/main.jsx:95,111` |
| 홈 트리를 바꾸면 하이드레이션이 어긋나는가 | 어긋난다. 서버 HTML은 `App` 모양이라 `MyBrandsShell`과 안 맞고, 복구 가능 오류가 보고된 뒤 통째로 다시 그린다 | `main.jsx:112`, `onRecoverableError` |
| 허브 링크를 누가 세우는가 | SSR 데이터가 있을 때만 `main.jsx:96`이 `setHubLinks`를 부른다. 시안은 SSR을 안 쓰므로 어댑터가 직접 부른다 | `offerLink.js:164` |
| 링크를 여는 규칙 | `offerLink(offer, brand.links, brand.name)`로 href를 얻고, 앱 스킴이면 같은 탭, `http`면 새 탭. 쿠팡이츠 안내 토스트는 `openWithNotice`가 띄운다 | `CouponCard.jsx:55-66`, `offerLink.js:106` |
| 브랜드 한 건의 모양 | `name`, `category`, `links`, `offers[]`, `popularityToday`, `popularityPrevious`. 오퍼는 `platform`, `amount`, `minOrderAmount`, `capturedAt`, `soldOut`, `qualifier`, `tiers` | `filters.js`, `couponModel.js` |
| 첫 화면 추천의 근거 | `popularToday(brands)`가 상위 다섯을 준다. 클릭이 적은 새벽에는 세 곳 미만이라 비어 있을 수 있다(`STRIP_MIN`) | `popularStrip.js:30` |
| 옛 응답에서 `popularityToday`가 없으면 | 값이 0으로 읽혀 `popularToday`가 빈 배열이다 | `popularStrip.js:16` |
| 최고 할인액으로 무엇을 찍는가 | `displayBestAmount(offers)`. 정렬용 `bestConfirmedAmount`는 4,999원 천장을 끼워 넣으므로 화면에 쓰지 않는다 | `filters.js:429-444` |

## 3. 변경 전파 점검

`docs/CHANGE-PROPAGATION.md`의 묶음 중 닿는 곳을 짚는다.

| 묶음 | 닿는가 | 이유 |
| --- | --- | --- |
| 1 확실성 판정 | 읽기만 | 정렬과 최고 할인액을 `sortBrands`, `displayBestAmount`가 계산한다. 시안은 판정을 다시 쓰지 않는다. 시안이 `amount`로 직접 비교하면 특정메뉴 쿠폰이 맨 위에 서므로 금지 |
| 2, 3 배너 모양, 묶음 배너 | 안 닿음 | 배너는 `setHubLinks`에만 쓰고 그리지 않는다 |
| 4 최소주문 출처 | 읽기만 | `minLabel`이 주는 "최소주문 미확인"까지 그대로 보인다. 값을 지어내지 않는다 |
| 6 화면에 나가는 글자 | **닿는다** | 시안이 새 문구를 낸다("내 브랜드", "인기 브랜드 추천", "받으러 가기" 등). 새 문구는 세션이 정하지 않는다는 규칙이 있다. 문구는 §5-4에 모아 두고 프리뷰 승인 때 사용자가 확정한다. 수집기 말("확인", "미확인", "판독")은 쓰지 않는다 |
| 7 행동 이벤트 | 안 닿음 | 이슈가 분석 이벤트를 생략해도 된다고 했다. `track`을 호출하지 않으므로 `ALLOWED_EVENTS` 대조는 영향이 없다. 단 시안 클릭은 `offer_link_click`에 안 잡혀 프리뷰에서 클릭률을 못 잰다(§7) |
| 8 배포 순서 | 안 닿음 | API 변경이 없다. 시안은 병합하지 않는다 |
| 9 새 파일 | **닿는다** | `docs/PROJECT-STRUCTURE.md` 재생성 필요(푸시 훅이 막는다). 새 `*.test.js`는 만들지 않으므로 `package.json`의 `test` 명령은 안 건드린다 |

## 4. 결정

### 4-1. 파일은 셋, 전부 `web/src/shells/my-brands/`

| 파일 | 역할 |
| --- | --- |
| `data.js` | 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 바꾼다. 계산 로직 금지 |
| `MyBrandsShell.jsx` | 화면 컴포넌트 전부와 별표 저장 훅 |
| `my-brands.css` | 이 시안의 CSS 하나. 클래스 접두어 `mb-` |

- 새 npm 의존성 없음. 기존 로직 파일(`api.js`, `filters.js`, `couponModel.js`, `offerLink.js`, `popularStrip.js`)은 고치지 않는다.
- `App.jsx`와 다른 컴포넌트는 지우지 않는다.

### 4-2. `data.js`: 읽는 모듈과 내보내는 값

`loadHome()`이 `fetchBrands()`와 `fetchBanners()`를 함께 부른다. 배너가 실패하면 `[]`로 두고 브랜드만으로 그린다(배너는 허브 링크 폴백에만 쓴다). 브랜드가 실패하면 던진다. 컴포넌트가 오류 화면과 다시 시도 버튼을 보인다. 받은 배너로 `setHubLinks`를 부른다.

내보내는 값은 아래뿐이다. 각각 기존 함수 한 번 호출이다.

| 내보내기 | 받는 곳 | 내용 |
| --- | --- | --- |
| `loadHome()` | `fetchBrands`, `fetchBanners`, `setHubLinks` | `{ brands, checkedAt }`. `checkedAt`은 `latestCaptured`를 모든 브랜드의 오퍼를 펼친 목록에 적용한 값 |
| `orderedBrands(brands, category)` | `applyFilters`, `defaultFilters` | 기본 필터(5천원 이상, 할인액 높은 순, 신규 앞)에 분류 한 칸만 얹은 목록. 정렬 규칙은 `applyFilters`가 낸다 |
| `recommendedBrands(brands)` | `popularToday`, `orderedBrands` | `popularToday(...)` 결과가 `STRIP_MIN` 이상이면 그 브랜드들, 아니면 `orderedBrands` 상위 다섯 |
| `cardOf(brand)` | `displayBestAmount`, `amountText`, `chipsOf`, `onCard`, `headOrder`, `minLabel`, `qualifiersOf`, `channelOf`, `offerLink` | 카드 한 장이 그릴 값: 대표 오퍼, 금액 글자, 앱, 칩 글자 목록, 최소주문 글자, 링크, 확인 시각 |
| `CATEGORIES` | `filters.js` | 그대로 다시 내보냄 |

`cardOf`가 대표 오퍼를 고르는 규칙은 새로 짜지 않는다.
- 최고 할인액 `displayBestAmount(brand.offers)`와 같은 `amount`인 오퍼 가운데 첫 번째를 대표로 쓴다.
- 오퍼 목록의 순서는 서버가 정한 그대로다.
- `displayBestAmount`가 `null`이면(확정 오퍼 없음) 카드에 금액 대신 `amountText(brand.offers[0])`를 그린다. 숨기지 않는다.

### 4-3. 별표 저장

- 키 `dk_my_brands_shell`(기존 `dk_*` 키와 겹치지 않는 시안 전용 이름). 값은 브랜드 이름 배열(JSON).
- 읽기와 쓰기는 `hiddenBrands.js`와 같은 방식이다. `try/catch`로 감싸 저장소가 막혀도 그 방문 동안 화면 상태로 산다. 깨진 값은 빈 배열.
- 저장소 접근은 `useEffect`에서만 한다. 첫 렌더는 항상 "별표 없음"으로 그려 서버 렌더와 같은 모양을 지킨다(시안은 SSR을 안 쓰지만 같은 습관을 따른다).
- 저장된 이름이 현재 브랜드 목록에 없으면(브랜드가 내려갔을 때) 조용히 건너뛴다. 저장값은 지우지 않는다.
- 숨긴 브랜드(`hiddenBrands.js`)는 이 시안에서 다루지 않는다. 시안 범위 밖이다.

### 4-4. 화면 구성(360px 기준, 위에서 아래)

1. **머리:** "내 브랜드" 제목과 한 줄 부제 "마지막 확인 오늘 14:20"(`checkedAt`을 시각 글자로만 바꿈. 어제 이전이면 날짜 포함). `checkedAt`이 `null`이면 부제를 그리지 않고 "확인 시각 없음"도 쓰지 않는다. 틀린 시각을 찍는 것보다 비우는 것이 낫다(신뢰성).
2. **내 브랜드 구역:** 별표한 브랜드 카드 목록. 별표가 하나도 없으면 같은 자리에 추천 카드를 띄우고 구역 제목을 "지금 인기 브랜드"로 바꾼다. 안내 한 줄 "별표를 누르면 여기에 모여요"를 단다. 추천은 저장하지 않는다. 별표를 하나라도 누르면 그 순간 추천이 사라지고 내 브랜드만 남는다.
3. **카드 한 장(내 브랜드와 추천 공통):**
   - 왼쪽: 로고(`brandLogoSrc`)와 이름(`shortBrandName`). 오른쪽: 별표 토글(눌림 영역 44px 이상).
   - 가운데 큰 줄: 금액(`amountText` 결과, 예: `7,000원`)과 앱 이름(`platforms.js`의 라벨). 금액이 이 카드에서 가장 크다.
   - 조건 줄: 칩(`chipsOf`에서 `onCard`로 거르고 `headOrder`로 정렬한 글자)과 최소주문(`minLabel`). 줄이되 숨기지 않는다. 360px에서 칩이 넘치면 줄바꿈하고 말줄임으로 자르지 않는다.
   - 확인 시각: 대표 오퍼 `capturedAt`을 "14:20 확인" 꼴로 작게(신뢰성). 값이 없으면 그리지 않는다.
   - 누를 곳: 카드 아래쪽 전체 폭 버튼 "쿠폰 받으러 가기". `<a href={offerLink(...)}>`이고 클릭은 `openWithNotice`에 넘긴다(앱 스킴 동일 탭, `http` 새 탭, 쿠팡이츠 안내 유지).
   - 품절 오퍼는 금액에 취소선과 "품절" 글자(`CouponCard.jsx`의 `Amt`와 같은 표현).
4. **전체 브랜드 구역:** 분류 칩 한 줄(`CATEGORIES`)과 그 아래 간단한 행 목록. 행은 로고, 이름, 금액, 별표 토글. 누르면 별표만 바뀐다. 행 전체가 링크는 아니다(별표 고르기가 목적이라 누름 대상을 나눈다). 별표한 브랜드는 이 목록에서 별표가 채워진 채 남는다.
5. **로딩과 오류:** 로딩은 카드 모양 자리표시 세 장(`BrandGridSkeleton.jsx`는 쓰지 않고 CSS만). 오류는 한 줄 안내와 "다시 시도" 버튼.

### 4-5. 문구 목록(프리뷰 승인 때 사용자가 확정)

"내 브랜드", "지금 인기 브랜드", "별표를 누르면 여기에 모여요", "마지막 확인 {시각}", "{시각} 확인", "쿠폰 받으러 가기", "전체 브랜드", "다시 시도". 문구가 바뀌면 `MyBrandsShell.jsx` 한 파일만 고친다.

### 4-6. `main.jsx` 변경(이 브랜치 한정, 세 줄)

이슈는 "한 줄"이라 했지만 §2의 하이드레이션 어긋남 때문에 세 줄이 든다. **이 부분은 이슈와 다르다.**

1. 위쪽에 `import MyBrandsShell from './shells/my-brands/MyBrandsShell.jsx'` 추가.
2. `<ErrorBoundary><App initial={ssr} /></ErrorBoundary>`를 `<ErrorBoundary><MyBrandsShell /></ErrorBoundary>`로 교체.
3. `const ssr = window.__SSR__`를 `const ssr = null`로 교체(시안은 서버 렌더를 안 쓴다). 그러면 `if (ssr)` 두 곳이 모두 꺼져 `createRoot`가 서버 HTML을 비우고 새로 그린다.

3번을 안 하면 서버 HTML이 `App` 모양이라 복구 가능 오류가 `onRecoverableError`로 올라가 운영 오류 집계에 시안 오류가 섞인다(프리뷰 도메인이라도 같은 PostHog로 간다).

- `App.jsx`의 `import './App.css'`는 `main.jsx`에 그대로 있어 전역 변수와 글꼴을 쓴다. 시안 CSS는 `my-brands.css`에서 가져온다(`MyBrandsShell.jsx` 안에서 import).
- 서버 렌더가 안 되는 시안이라 첫 화면은 JS가 돈 뒤에 뜬다. 이 점이 첫 화면 속도 비교에 불리하다는 것을 프리뷰 판단에 넣는다.

## 5. 구현 순서

1. `data.js`: 위 표의 다섯 내보내기.
2. `MyBrandsShell.jsx`: 별표 훅, 카드, 행, 구역, 로딩과 오류.
3. `my-brands.css`: 360px 기준. 375, 430px에서 깨지지 않는지도 본다.
4. `main.jsx` 세 줄.
5. `python scripts/generate_project_structure.py`로 `docs/PROJECT-STRUCTURE.md` 재생성.

## 6. 확인 계획

- `npm test`와 `npm run build` 통과.
- `git diff --stat main -- web/src` 결과에 `shells/` 밖 변경이 `main.jsx` 하나뿐.
- 360px 스크린샷 셋: 처음 방문(추천 채움), 별표 두 개 고른 뒤, 로딩 또는 오류. 결과 댓글에 단다.
- 운영 API로 그린 카드의 금액이 기존 홈(`App`)의 같은 브랜드 카드와 같은지 두 브랜드 눈으로 대조한다. 특정메뉴 쿠폰만 있는 브랜드 하나, 최소주문 미확인 오퍼가 있는 브랜드 하나를 고른다.
- 카드를 눌러 앱 링크가 열리는지 확인한다(배민, 쿠팡이츠 각 하나).
- 저장소가 막힌 창(사생활 보호)에서 화면이 뜨는지 확인한다.

## 7. 알려진 한계

- 분석 이벤트를 안 쏘므로 프리뷰에서 클릭률과 재방문율을 숫자로 못 잰다. 시안 비교는 눈과 손으로 한다. 숫자가 필요하면 `offer_link_click`을 `offerClickProps`로 붙이는 후속 시안이 필요하다(`ALLOWED_EVENTS`에는 이미 있다).
- 별표는 기기와 브라우저마다 따로 남는다. 서버 저장이 아니다(`hiddenBrands.js`와 같은 이유: 로그인이 없다).
- 추천이 `popularToday`에 기대므로 클릭이 적은 새벽에는 인기 대신 할인액 상위가 뜬다. 구역 제목이 "지금 인기 브랜드"인 채로 인기가 아닌 목록이 보인다. **프리뷰에서 새벽 값을 못 봤으면 제목 문구를 중립으로 바꿀지 사용자에게 묻는다.**
- 숨긴 브랜드, 필터 시트, 검색, 푸시 알림, 배너 띠는 이 시안에 없다.

## 8. 리뷰 포인트

- 이슈의 "main.jsx 한 줄"을 세 줄로 늘리는 것에 동의하는가(§4-6).
- 별표 키 `dk_my_brands_shell`을 시안 전용으로 두고 병합 때 이름을 다시 정해도 되는가.
- "전체 브랜드" 행에서 행 전체를 링크로 하지 않고 별표만 누르게 하는 것이 시안 의도에 맞는가.
