# 258: 홈 리뉴얼 시안 hero-trust(오늘의 한 장 + 신뢰)

- 이슈: [#258](https://github.com/woowacourse-teams/2026-to-discount/issues/258), 묶음 [#230](https://github.com/woowacourse-teams/2026-to-discount/issues/230)
- 상태: 설계 초안. **버리는 시안이다. 병합하지 않는다.** PR은 초안으로 두고 프리뷰만 본다.
- 범위: `web/src/shells/hero-trust/`(새 파일), `web/src/main.jsx` 한 줄. 그 밖은 0줄.

## 1. 문제

- 홈이 값의 출처를 말하지 않는다. 사용자는 금액이 언제 나온 것인지, 확정인지 알 길이 없다(목표 1).
- 핵심(얼마, 어느 앱, 조건)이 카드 안에 흩어져 있다(목표 2).
- 누를 곳이 첫 화면에서 바로 안 보인다(목표 3).
- 시안 hero(#231)와 trust(#235)를 합쳐 한 화면으로 비교한다. 두 PR은 참고만 하고 새로 짠다.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 시각 칸이 오퍼에 있는가 | 있다. `capturedAt`. 오퍼 목록에서 가장 늦은 값은 `latestCaptured(offers)`가 낸다. 없으면 `null` | `filters.js` `latestCaptured` |
| 확정 여부 칸 | `certainty`. 없으면 `exact`. 배지 글자는 `chipsOf`가 이미 낸다(`불확정`, `랜덤`, `특정메뉴`) | `filters.js` `certaintyOf`, `couponModel.js` `badgesOf` |
| 최소주문 라벨 | `minLabel(m)`: `0`은 `최소주문 없음`, `null`은 `null`(칸을 비움). 정식 문구 `최소주문 미확인`은 `conditionTable`의 `min`에 있다 | `couponModel.js` |
| 대표 오퍼를 고르는 함수 | `splitOffers(offers, include).best[0]`. 운영 카드와 같은 규칙 | `couponModel.js` |
| 기본 목록 | `applyFilters(brands, defaultFilters())`. 기본은 5천원 이상, 할인금액 높은 순, 신규 앞 | `filters.js` |
| 링크 | `offerLink(offer, brand.links, brand.name)`. `CouponCard.jsx:56`과 같은 호출 | `offerLink.js` |
| 허브 링크 | `setHubLinks(banners)`를 불러야 쿠팡이츠 외 앱의 허브 폴백이 선다. 지금은 `main.jsx`가 SSR 데이터로 부른다 | `main.jsx:96` |
| 홈 SSR | `window.__SSR__`가 있으면 `hydrateRoot`로 붙는다. 없으면 `createRoot` | `main.jsx:95~131` |
| 새 시험 파일 | `run-node-tests.mjs`가 `src/**/*.test.js`를 전부 돈다고 이전 설계(221)에 기록돼 있다. 구현자가 한 번 더 확인한다 | `docs/design/221` §4 |

## 3. 결정

### 3-1. 파일은 셋, 전부 `web/src/shells/hero-trust/` 아래

- `HeroTrustShell.jsx`: 화면.
- `data.js`: 어댑터. 기존 모듈을 불러 화면 모양으로 바꾼다.
- `heroTrust.css`: CSS 하나. 클래스 이름은 `ht-` 접두사로 `App.css`와 겹치지 않게 한다.

`main.jsx`는 `import HeroTrustShell`과 `<HeroTrustShell />`로 바꾸는 한 줄(`<App initial={ssr} />` 줄)이다. `App.jsx`와 다른 컴포넌트는 지우지 않는다. 새 npm 의존성은 없다.

### 3-2. `data.js`는 얇은 어댑터다

`useHeroTrustData()` 훅 하나를 내보낸다(여기서 `fetchBrands`, `fetchBanners`를 부른다). 계산 로직은 두지 않는다.

| 화면 값 | 읽는 곳 | 어댑터가 하는 일 |
| --- | --- | --- |
| 목록 | `applyFilters(brands, defaultFilters())` | 그대로 |
| 대표 오퍼 | `splitOffers(brand.offers, includesFrom(filters)).best[0]` | 그대로 |
| 금액 글자 | `amountText(offer)` | 그대로 |
| 칩 | `chipsOf(offer)`에서 `onCard` 칩 | 그대로 |
| 최소주문 | `minLabel(offer.minOrderAmount)` | `null`이면 `최소주문 미확인`을 그린다(3-4) |
| 시각 | `latestCaptured(brand.offers)` | 현재와의 차이를 `N분 전`, `N시간 전`, `N일 전` 글자로 바꾼다. 이 서식만 어댑터가 하는 유일한 가공이다 |
| 링크 | `offerLink(offer, brand.links, brand.name)` | 그대로 |
| 앱별 칸 | `PLATFORMS`(`platforms.js`)와 브랜드의 `offers` | 앱마다 그 앱의 대표 오퍼를 찾아 넘긴다(3-5) |

- 이슈가 이름으로 든 모듈에 `certaintyOf`, `includesFrom`, `splitOffers`, `defaultFilters`, `PLATFORMS`는 없다. 같은 파일들(`filters.js`, `couponModel.js`, `platforms.js`)에서 읽기만 하므로 "고치지 않는다"는 지킨다. 구현자가 새로 짜지 않고 불러 쓴다.
- `fetchBanners` 결과로 `setHubLinks(banners)`를 부른다. 안 부르면 `offerLink`의 허브 폴백이 비어 일부 앱 링크가 앱 홈으로만 떨어진다. 배너 요청이 실패하면 `[]`로 두고 목록은 그린다(App과 같다).
- 정렬은 기본값 그대로다. 시안 전용 정렬을 만들지 않는다.

### 3-3. 화면 구성(360px 첫 화면)

위에서 아래로:

1. **오늘의 한 장**(큰 카드, 목록 첫 브랜드의 대표 오퍼)
   - 브랜드 이름, 앱 이름, 금액(가장 크게)
   - 조건 한 줄: 최소주문(3-4), 칩(채널, 멤버십, 한정, `첫 주문`). 줄이되 숨기지 않는다
   - 신뢰 줄: `N분 전 갱신`과 확정 표시(3-6)
   - 큰 버튼 `쿠폰 받으러 가기`: 카드 아래쪽 엄지가 닿는 자리. `offerLink` 주소로 연다(3-7)
2. **목록**(대표 카드 다음 브랜드부터): 행마다 브랜드 이름, 최고 금액, 최소주문, 작은 신뢰 표시(같은 `N분 전 갱신`과 확정 표시), 앱별 칸(3-5). 행 전체가 누르는 자리다
3. 카테고리 필터 칩은 `CATEGORIES`를 읽어 가로 한 줄로 둔다. 필터 시트와 검색은 이 시안에 넣지 않는다(범위 밖)

### 3-4. 없음과 모름을 가른다(이슈 결정)

- 최소주문을 모르면(`minLabel`이 `null`) 칸을 비우지 않고 기존 정식 라벨 `최소주문 미확인`을 그린다. 새 문구가 아니다(`couponModel.js`가 이미 낸다).
- 앱별 칸에서 그 앱에 오퍼가 없으면 `-`. 오퍼는 있는데 값을 모르면(금액 없음, 최소주문 `null`) 기존 라벨. 둘을 한 모양으로 그리지 않는다.
- 시각을 모르면(`latestCaptured`가 `null`) 시각 자리에 `-`를 그리지 않는다. 시각을 모르는 것은 "오퍼 없음"이 아니라 "값 모름"이므로 그 자리를 비우되 확정 표시는 그대로 둔다. 시안이 `-`를 쓸지 빈 칸을 쓸지는 프리뷰에서 본다(10절).

### 3-5. 앱별 칸

- 행 아래에 앱 넷(`PLATFORMS`의 `baemin`, `coupangeats`, `ddangyo`, `yogiyo`)을 한 줄로 둔다. 앱마다 그 앱 오퍼 중 `splitOffers(그 앱 오퍼만, include).best[0]`의 `amountText`.
- 그 앱 오퍼가 없으면 `-`(3-4). 최고 금액인 칸은 강조한다. 강조 기준은 `displayBestAmount`가 낸 값과 같은 금액일 때만이다. 어댑터가 새로 견주지 않는다.
- 칸을 누르면 그 앱 오퍼의 `offerLink`를 연다. 행 전체 링크와 겹치지 않게 칸이 이긴다(`stopPropagation`).

### 3-6. 신뢰 표시와 문구

- 시각: `capturedAt` 기준 `N분 전 갱신`. 설계 문서와 이슈 본문은 "확인"이라 부르지만 화면 글자에는 `확인`을 쓰지 않는다(`docs/COPY-STYLE.md` 1-4: 수집기의 말). 이슈 결정("시안용 임시 문구는 세션이 정한다. 수집기 말을 새로 만들지 않는다")에 따라 `갱신`으로 쓴다.
- 확정: `certaintyOf(offer) === 'exact'`이면 `확정`. 아니면 `chipsOf`가 이미 내는 `불확정`, `랜덤`, `특정메뉴` 칩을 그대로 신뢰 줄에 둔다. 새 문구는 `확정`, `갱신`, `쿠폰 받으러 가기` 셋뿐이고 모두 시안 임시 문구다.
- 시안이 병합되지 않으므로 `COPY-STYLE.md` 3절의 "개발자에게 묻기"는 이슈 결정으로 갈음한다. **좋은 부분을 본 사이트에 옮길 때는 이 세 문구를 개발자에게 다시 묻는다.**
- `check-copy.mjs`(`npm run test:copy`)가 JSX 글자를 훑는다. `N시 오픈` 꼴을 쓰지 않으므로 걸릴 일이 없지만 구현 뒤 돌려 본다.

### 3-7. 클릭

- `<a href={offerLink(...)}>`로 연다. 쿠팡이츠는 `openWithNotice(e, href)`를 `onClick`에 건다. 안 걸면 안내 없이 열려 허브 쿠폰을 받을 수 없다(`offerLink.js`의 `COUPANGEATS_NOTICE`). 두 함수는 `offerLink.js`에서 불러 쓸 뿐 고치지 않는다.
- 분석 이벤트(`track`)는 생략해도 된다. 프리뷰는 `dev`로 찍히므로 운영 집계에 안 섞인다.

### 3-8. SSR 하이드레이션

시각 글자는 서버와 브라우저가 다른 값을 만든다. 서버가 HTML을 그린 뒤 시간이 지나 `N분`이 달라지고, 하이드레이션이 불일치를 낸다.

- 시안은 `window.__SSR__`를 쓰지 않는다. `main.jsx`에서 `ssr`을 `null`로 두고 `createRoot`로 그린다. 이슈가 허용한 한 줄이고 PR 본문에 적는다.
- 이때 `setHubLinks(ssr.banners)` 줄은 `ssr`이 없으므로 건너뛴다. 대신 3-2의 `data.js`가 배너를 받아 부른다.
- 첫 데이터가 오기 전에는 기존 `BrandGridSkeleton`을 그린다(고치지 않고 불러 쓴다).

## 4. 동반 변경 묶음(`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 해당 | 이번 작업에서 |
| --- | --- | --- |
| 1 확실성 | 읽기만 한다 | `certaintyOf`, `splitOffers`, `displayBestAmount`를 불러 쓴다. 판정을 웹에서 새로 짜면 서버 순서와 어긋나므로 **새 판정 코드를 만들지 않는다.** 목록 순서와 대표 선택은 기존 함수가 정한다 |
| 4 최소주문 | 읽기만 한다 | 모르면 `최소주문 미확인`. 문턱을 지어내지 않는다 |
| 6 화면에 나가는 글자 | 해당 | 3-6. 새 문구 셋은 시안 임시 문구로 이슈 결정에 따른다. 수집기 말은 안 쓴다 |
| 7 행동 이벤트 | 해당 없음 | `track`을 새로 쏘지 않는다. `ALLOWED_EVENTS`와 계약 스크립트는 그대로 초록이어야 한다 |
| 8 배포 순서, 프리뷰 | 해당 | 서버 변경이 없으므로 순서 문제는 없다. 웹 프리뷰 먼저 절차를 따른다. `main`에 병합하지 않는다 |
| 9 새 파일 | 해당 | 새 `*.test.js`를 만들면 `package.json`의 `test` 명령에 걸리는지 확인한다. 구조 문서 검사(`scripts/githooks`)가 새 파일 때문에 막히면 `scripts/generate_project_structure.py`로 다시 만든다. 병합하지 않으므로 이 갱신이 PR에 섞여도 된다 |
| 2, 3, 5 | 해당 없음 | 배너 모양, 묶음, 알림을 만지지 않는다 |

## 5. 시험

시안이라 시험을 늘리지 않는다. 기존 시험이 초록이어야 하는 것이 통과 조건이다.

- `npm test`와 `npm run build`.
- `git diff --stat main -- web/src/*.js`에 `shells/` 밖 변경이 없고, `web/src/main.jsx`만 예외다. 이 명령의 출력을 PR에 붙인다.
- `data.js`에 순수 함수(시각 서식)를 뺐다면 한 파일 `data.test.js`로 `N분 전`, `N시간 전`, `null` 세 경우만 박는다. 만들면 `package.json`의 `test` 사슬에 걸리는지 먼저 본다.
- 손으로 볼 것(스크린샷):
  - 360px 첫 화면에 대표 카드, 신뢰 줄, 큰 버튼이 모두 들어온다.
  - 실제 운영 API 데이터로 그려진다.
  - 카드와 행과 앱 칸을 누르면 앱 링크가 열린다(쿠팡이츠는 안내가 먼저).
  - 오퍼가 없는 앱 칸은 `-`, 최소주문을 모르는 오퍼는 `최소주문 미확인`.

## 6. 대안과 버린 이유

| 대안 | 버린 이유 |
| --- | --- |
| 화면 글자에 `N분 전 확인` | 이슈 개념어지만 `확인`은 수집기 말이다(`COPY-STYLE.md` 1-4). 사용자 화면에 새는 사고가 세 번 있었다(6번 묶음) |
| 어댑터에서 대표 오퍼와 "최고"를 새로 계산 | 서버 순서와 어긋난다(1번 묶음). 기존 함수를 부른다 |
| `App.jsx`를 고쳐 시안 분기를 넣음 | 이슈가 금지했고, 버리는 시안이 운영 홈 코드에 남는다 |
| SSR 데이터를 그대로 쓰고 시각만 `suppressHydrationWarning` | 불일치가 값 하나가 아니라 목록 전체로 번질 수 있다. `ssr`을 무시하는 편이 단순하다 |

## 7. 끊기면 무엇이 보이나

- `setHubLinks`를 안 부르면 화면은 멀쩡하고 쿠팡이츠 외 일부 앱 링크가 앱 홈이나 검색으로만 떨어진다. 5절 "링크가 열린다" 손 확인이 잡는다.
- 쿠팡이츠 칸에 `openWithNotice`를 안 걸면 안내 없이 열려 쿠폰을 못 받는 사람이 생긴다. 화면은 같다.
- 시각 서식을 어댑터 밖에서 새로 짜면 `갱신`이 기준 시각과 다른 값을 낸다. 대표 오퍼의 `capturedAt`이 아니라 브랜드 전체의 `latestCaptured`를 쓰는 것으로 정했다(3-2). 대표 카드가 다른 오퍼의 시각을 보여 주지 않게 구현자가 한 값만 쓴다.
- 최소주문 `null`을 칸 비움으로 두면 틀린 문턱이 아니라 빈 칸이 뜨지만 목표 1을 어긴다.

## 8. 구현 순서

1. `data.js`와 `HeroTrustShell.jsx`, `heroTrust.css`를 만든다.
2. `main.jsx` 한 줄과 `ssr` 무시 한 줄을 바꾼다.
3. `npm test`, `npm run build`, `git diff --stat`을 돌린다.
4. 360px 스크린샷을 찍는다(운영 API, 대표 카드와 목록 둘 다).
5. `preview/shell-hero-trust`로 push한다(사람 또는 sub 세션, `docs/WORKFLOW.md` §3-3). 프리뷰 주소는 `https://beggars-git-preview-shell-hero-trust-nn98s-projects.vercel.app`. PR 본문 맨 위에 적는다.
6. 스크린샷을 결과 댓글에 단다. PR은 초안으로 둔다.

## 9. 범위 밖

- 필터 시트, 검색, 배너, 푸시, 설문, 푸터, 분석 이벤트.
- 서버 변경. 새 칸이 필요하면 이 시안에서 하지 않고 #230에 올린다.

## 10. 결정이 필요한 것

- **화면 글자 `갱신`, `확정`, `쿠폰 받으러 가기`로 시안을 돌려도 되는가.** 이슈 결정으로 임시 문구는 세션이 정해도 되지만, 본 사이트로 옮길 때는 다시 묻는다.
- **시각을 브랜드 전체의 `latestCaptured`로 보여 줘도 되는가.** 대표 오퍼 한 건의 `capturedAt`이 아니라 같은 브랜드 오퍼 중 가장 늦은 값이다. 대표 오퍼의 값으로 바꾸려면 어댑터 한 줄이다.
- 확인하지 않은 것: 운영 API 응답에서 `capturedAt`이 오퍼 전부에 채워지는지는 보지 않았다(코드로만 읽었다). 비어 있는 오퍼가 많으면 신뢰 줄이 자주 빈다. 프리뷰에서 본 비율을 결과 댓글에 적는다.

## 변경 이력

- 2026-11-03 (구현): 이슈 결정(2026-11-03)에 따라 `ssr`을 `null`로 둔 것에 더해, `main.jsx`가 `App` 가져오기를 지우면 쿠폰 카드 CSS 조각이 빌드에서 사라져 `ssr-template.mjs`가 깨졌다. 그래서 `App`을 남기고 `?legacy`일 때만 운영 홈을 그린다(기본은 시안). `main.jsx`는 3줄이 바뀐다.
- 2026-11-03 (구현): 목록 불러오기 실패 문구 한 줄(`할인 정보를 불러오지 못했어요.`)을 시안 임시 문구로 더했다. 본 사이트로 옮길 때 3-6의 세 문구와 함께 다시 묻는다.
- 2026-11-03 (구현): `data.test.js`를 만들어 `agoText`의 `N분`, `N시간`, `N일`, `null`을 박았다. `run-node-tests.mjs`가 `src/**`를 재귀로 훑는 것을 확인했다.
