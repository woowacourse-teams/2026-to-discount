# 272 홈 리뉴얼 시안: 카테고리별 오늘의 한 장 (category-hero)

버리는 시안이다(묶음 이슈 #230). 병합하지 않고 프리뷰만 본다. 기존 로직 파일은 한 줄도 고치지 않는다.

## 1. 목표와 개념

리뉴얼 목표(우선순위 순): 신뢰성, 핵심(얼마, 어느 앱, 조건)의 빠른 전달, 누를 곳(받으러 가기)의 빠른 노출.

- 개념: 카테고리(치킨, 피자 등)마다 가장 큰 할인 하나를 큰 카드로 만들어 가로로 넘긴다. hero(#231)의 '한 화면 한 판단'을 카테고리 단위로 늘린 것.
- 360px 첫 화면: 카테고리 카드 한 장이 화면 폭 대부분을 차지하고 다음 카드가 오른쪽에 살짝 비쳐 넘길 수 있음을 알린다. 카드 안에 금액, 앱, 조건, 기준 시각, 큰 '받으러 가기'가 한 번에 보인다.

## 2. 파일과 경계

| 파일 | 일 |
| --- | --- |
| `web/src/shells/category-hero/CategoryHeroShell.jsx` (새) | 화면. 데이터를 받아 카드 가로 목록을 그린다 |
| `web/src/shells/category-hero/data.js` (새) | 기존 모듈을 불러 껍데기용 모양으로 바꾸는 얇은 어댑터 |
| `web/src/shells/category-hero/category-hero.css` (새) | CSS 하나. 클래스는 `chs-` 접두사 |
| `web/src/main.jsx` (수정) | 홈을 `<CategoryHeroShell />`로 교체(§6) |

- 기존 `App.jsx`와 다른 컴포넌트, `web/src/*.js`는 고치지 않는다. 새 npm 의존성 없음.
- 완료 검사: `git diff --stat main -- web/src/*.js`에 shells 밖 변경이 없고 `main.jsx`만 남는다.

## 3. 데이터 어댑터 (`data.js`)

기존 함수만 부른다. 비교, 정렬, 확실성 판정을 다시 짜지 않는다(변경 전파 1번: 판정은 `filters.js`, `couponModel.js`가 가진 한 벌만 쓴다).

### 3-1. 카테고리 카드 목록

1. `fetchBrands()`로 브랜드를 받는다. 배너는 `fetchBanners()`로 받아 `setHubLinks(banners)`를 부른다(`App.jsx`와 같은 순서. 브랜드별 링크가 없는 앱의 허브 링크용). 배너 실패는 빈 목록으로 삼킨다.
2. 카테고리마다 `CATEGORIES`(`filters.js`)를 돈다.
3. 그 카테고리의 대표 브랜드 = `applyFilters(brands, { ...defaultFilters(), categories: new Set([key]) })[0]`. 기본 필터(5천원 이상, 할인금액 높은 순)의 맨 앞이 그 카테고리에서 가장 큰 할인이다.
4. 대표 오퍼 = `splitOffers(brand.offers, include).best[0]`. `include`는 `{ random: false, menu: false }`(기본값, 필터의 `includesFrom(defaultFilters())`).
5. 대표 브랜드가 없거나 `splitOffers(...).hasBest`가 false(확정 최고 없음)이면 그 카테고리 카드는 만들지 않는다. 불확정 값을 '오늘의 한 장'으로 세우지 않기 위함.
6. 오퍼가 너무 적은 카테고리를 거르는 `visibleCategories(brands)`를 그대로 쓴다. 카드 순서는 `CATEGORIES` 순서.

### 3-2. 카드 한 장의 모양

```
{
  key, label,                      // CATEGORIES
  brandName, brandLinks,           // brand.name, brand.links
  amount,                          // amountText(offer)
  platformKey, platformLabel,      // offer.platform, PLATFORM_BY_KEY 라벨
  min,                             // minLabel(offer.minOrderAmount) ?? '최소주문 미확인'
  chips,                           // 아래 3-3
  capturedText,                    // latestCaptured(brand.offers)를 한국 시각 '월 일 시:분 기준'으로
  href,                            // offerLink(offer, brand.links, brand.name)
  offer,                           // openWithNotice 등에 넘길 원본
  apps: [{ key, label, state, amount, min }]   // 3-4
}
```

### 3-3. 금액과 조건: 줄이되 숨기지 않는다

- 금액: `amountText(offer)`를 가장 크게.
- 최소주문: `minLabel(offer.minOrderAmount)`. 숫자면 `원↑`을 붙여 읽히게 하고(껍데기용 표기. 상세 표의 `{n}원↑` 꼴과 같다), `0`이면 '최소주문 없음'(`minLabel`이 낸 라벨 그대로), `null`이면 칸을 비우지 않고 정식 라벨 '최소주문 미확인'을 그린다(이슈 결정, 목표 1).
- 조건 칩: `chipsOf(offer)` 중 오퍼 범위(`scope === 'offer'`) 칩을 카드 머리에 최대 3개. 첫 주문 한정은 `qualifiersOf` 결과가 칩에 이미 들어 있다. 월 1회 같은 조건은 오퍼 `conditions` 문장이 있을 때 `conditionTable(offer).note`가 아니라 칩이 못 올린 것이므로 한 줄 문장으로 카드 아래에 그대로 둔다(숨기지 않음).
- 칩이 넘치면 잘리게 두지 않고 줄바꿈한다(카드 높이는 늘어도 된다).

### 3-4. 앱별 한 줄 (없음과 모름 구분)

카드 아래 네 앱(`PLATFORMS`)을 한 줄씩 작게 둔다. 이 브랜드에서 앱마다 얼마인지 비교하는 자리다.

| 상태 | 조건 | 그리는 것 |
| --- | --- | --- |
| 없음 | 그 앱의 오퍼가 브랜드에 하나도 없음 | `-` |
| 값 있음 | 그 앱 오퍼의 `splitOffers(...).best[0]`에 금액이 있음 | `amountText` |
| 모름(금액) | 오퍼는 있으나 금액이 비어 `amountText`가 빈 문자열 | 기존 `rawText`가 있으면 그것, 없으면 '금액 ?'(상세 표가 이미 쓰는 라벨) |
| 모름(최소주문) | 오퍼는 있으나 `minOrderAmount`가 null | '최소주문 미확인' |

대표 오퍼의 앱 줄은 강조한다(카드 큰 금액과 같은 값이라 중복이지만 비교 맥락을 위해 유지).

## 4. 화면 (`CategoryHeroShell.jsx`)

- 위: 한 줄 제목 '카테고리별 오늘 가장 큰 할인'(임시 문구). 그 아래 가로 스크롤 카드 목록(`scroll-snap-type: x mandatory`, 카드 폭 약 86vw, 다음 카드가 비친다).
- 카드 구성(위에서 아래로):
  1. 카테고리 이름, 브랜드 로고(`BrandLogo`, `logos.jsx` 재사용), 브랜드 이름.
  2. 큰 금액(토스식으로 숫자를 가장 크게), 그 옆 앱 이름 한 줄.
  3. 조건 줄: 최소주문 라벨, 칩.
  4. 신뢰 줄(목표 1): 'N월 N일 HH:mm 기준 · {앱} 오퍼'. 값이 언제, 어느 앱에서 온 것인지. `latestCaptured`가 null이면 이 줄에서 시각 부분만 뺀다(앱 부분은 남김).
  5. 앱별 한 줄(§3-4).
  6. 큰 '받으러 가기' 버튼: 카드 폭 가득, 높이 48px 이상, 엄지 닿는 카드 하단.
- 누르면: `<a href={href}>`. 쿠팡이츠는 안내 후 이동이 필요하므로 `onClick`에서 `openWithNotice(e, href)`를 부른다(앵커 속성은 `OfferChip.jsx`의 같은 자리를 따른다. 새 규칙을 만들지 않는다). 분석 이벤트(`track`, `offerClickProps`)는 생략한다.
- `href`가 비면(링크 사다리 끝까지 값이 없음) 버튼을 비활성 모양으로 그리고 누를 수 없게 한다.
- 로딩: 카드 모양 자리표시 두 장. 실패: '불러오지 못했어요' 한 줄과 다시 시도 버튼(껍데기용 최소).
- 임시 문구는 세션이 정해도 된다(이슈 결정). 단 수집기 말('확인', '관측', '판독' 등)은 새로 만들지 않는다. 기존 정식 라벨 '최소주문 미확인'은 새 문구가 아니므로 그대로 쓴다.

## 5. 변경 전파 점검 (`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 닿는가 | 판단 |
| --- | --- | --- |
| 1 확실성 판정 | 읽기만 | `splitOffers`, `displayBestAmount`, `applyFilters`를 그대로 호출. 판정 복제 없음. 짝 파일(API, 판정표) 변경 없음 |
| 2, 3 배너 모양, 묶음 배너 | 배너 링크만 읽음 | `setHubLinks`로 허브 링크만 쓴다. 배너 모양 변경 없음 |
| 4 최소주문 출처 | 읽기만 | 모르면 지어내지 않고 '최소주문 미확인' |
| 6 화면에 나가는 글자 | 닿음 | 새 문구는 시안 임시. 병합하지 않으므로 `COPY-STYLE.md`와 라벨 파일은 고치지 않는다. 병합으로 바뀌면 개발자에게 문구를 받아야 한다(후속) |
| 7 행동 이벤트 | 안 닿음 | `track`을 부르지 않는다. 시안이 클릭 집계에 안 잡히므로 클릭률은 프리뷰 수치로 판단하지 않는다 |
| 8 배포 순서, 프리뷰 | 닿음 | API 변경 없음, 웹만. 프리뷰 먼저 규칙대로 `preview/shell-category-hero` push는 sub 세션이나 사람이 한다 |
| 9 새 파일 | 닿음 | `python scripts/generate_project_structure.py`로 `docs/PROJECT-STRUCTURE.md`를 다시 만들어 커밋. `*.test.js`는 만들지 않아 `package.json` 변경 없음 |

## 6. `main.jsx` 변경 (이 브랜치 한정)

1. import: `import App from './App.jsx'` 줄을 `import CategoryHeroShell from './shells/category-hero/CategoryHeroShell.jsx'`로 바꾼다(한 줄).
2. 트리: `<App initial={ssr} />`를 `<CategoryHeroShell />`로 바꾼다(한 줄).
3. SSR 무시(한 줄 추가): `const ssr = window.__SSR__`를 `const ssr = null`로 바꾸고 이유를 주석으로 단다. 서버가 보내는 HTML은 `App`의 마크업인데 껍데기는 다른 트리를 그린다. `hydrateRoot`는 이 불일치를 복구 가능 오류로 올리고(`onRecoverableError` 텔레메트리에 쌓임) 전체를 다시 그리므로, 결과가 확실해서 먼저 막는다. 이슈 결정은 '프리뷰에서 보이면'이지만 React의 동작상 확정이라 미리 적용하고 PR 본문에 적는다. 이 줄이 빠지는 것은 `setHubLinks(ssr.banners)`뿐이며, 껍데기가 배너를 직접 받아 `setHubLinks`를 부르므로 영향 없음.

기존 `App.jsx` import 제거로 `App.css`는 `main.jsx`가 그대로 불러온다(전역 변수와 글꼴을 쓰기 위해 유지).

## 7. 검증

- `npm test`, `npm run build` 통과(기존 테스트만. 새 테스트 파일은 만들지 않음: 병합하지 않는 시안이라 `package.json` 변경을 피함).
- `git diff --stat main -- web/src/*.js`에 shells 밖 변경 없음, `main.jsx`는 §6의 세 줄.
- 운영 API로 로컬 `npm run dev`를 띄워 360px 스크린샷: 첫 화면에 카드 한 장과 다음 카드 가장자리, 큰 금액, 기준 시각, '받으러 가기'가 보여야 한다.
- 카드를 눌러 앱 링크가 열리는지(최소 배민, 쿠팡이츠 안내 후 이동 두 경우), 오퍼 없는 앱 칸이 `-`인지, 최소주문 null 오퍼가 '최소주문 미확인'인지 본다. 못 본 것은 PR 본문 '미확인'에 적는다.
- 스크린샷은 결과 댓글에 단다. PR 본문 맨 위에 프리뷰 주소 `https://beggars-git-preview-shell-category-hero-nn98s-projects.vercel.app`, PR은 초안 유지.

## 8. 열린 질문 (시안이라 구현 세션이 정해도 되는 것)

- 카드 폭, 칩 개수 상한(3)은 360px에서 보고 조정한다.
- 가로 스크롤 하단 점 표시 여부.
