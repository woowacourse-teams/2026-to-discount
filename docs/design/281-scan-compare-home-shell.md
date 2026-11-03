# 281: 홈 리뉴얼 시안 scan-compare (훑고 펼쳐 비교)

- 이슈: [#281](https://github.com/woowacourse-teams/2026-to-discount/issues/281) (묶음 이슈 #230)
- 상태: 설계 초안(승인 대기). **병합하지 않는 시안.** PR은 초안으로 두고 프리뷰만 본다.
- 범위: `web/src/shells/scan-compare/` 새 파일, `web/src/main.jsx` 한 줄, `docs/PROJECT-STRUCTURE.md` 재생성

## 1. 목표와 개념

리뉴얼 목표(우선순위 순): 1) 값이 언제 어디서 확인됐는지 믿을 수 있게, 2) 핵심(얼마, 어느 앱, 조건)을 빠르게 강조, 3) 누를 곳을 빨리 보여 클릭률과 재방문율을 올림.

개념: 한 줄 목록이 기본, 줄을 누르면 그 자리에서 앱 4칸 비교가 펼쳐진다.

- 접힌 줄: 브랜드 로고와 이름, 큰 최고 금액, 최고 앱, 최소주문·조건, 몇 시간 전. 한 화면에 여러 줄이 보여 훑는다.
- 펼친 줄: 앱 4칸(배달의민족, 쿠팡이츠, 땡겨요, 요기요). 최고값 칸 강조, 칸마다 받으러 가기.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 데이터 모양 | 브랜드 `{ name, category, links, offers[] }`, 오퍼 `{ platform, amount, minOrderAmount, capturedAt, soldOut, tiers, ... }` | `web/src/CouponCard.jsx`, `filters.js` |
| 앱 4개 목록 | `PLATFORMS`가 `baemin, coupangeats, ddangyo, yogiyo`. 자사앱(`own`)은 별도 | `web/src/platforms.js` |
| 최고 금액 | `displayBestAmount(offers)`. 견줄 수 있고 품절 아닌 오퍼의 액면. 없으면 `null` | `filters.js:441` |
| 최고 후보 판정 | `comparable(offer)`. 서버 판정과 같은 규칙(1번 묶음) | `filters.js:227` |
| 목록 순서 | `applyFilters(brands, defaultFilters())`가 정렬까지 한다(5천원 미만 거르기, 신규 앞) | `filters.js:350` |
| 최소주문 라벨 | `minLabel(m)`은 `0`이면 "최소주문 없음", 모르면 `null`. 정식 라벨 "최소주문 미확인"은 `conditionTable`의 `min`에만 있다 | `couponModel.js:37`, `:176` |
| 조건 칩 | `chipsOf(offer)` 중 `onCard` 칩(채널, 멤버십, 한정, 첫 주문 등) | `couponModel.js:129` |
| 링크 | `offerLink(offer, brand.links, brand.name)`, 열기는 `openWithNotice(e, href, { offerPrompt: true })`. 쿠팡이츠 앱 링크가 안 열리면 4초 뒤 공유 링크로 넘기는 처리가 `openWithNotice` 안에 있다 | `offerLink.js:106`, `:184` |
| 확인 시각 | `latestCaptured(offers)`가 가장 최근 `capturedAt`(ISO 문자열) 또는 `null`. 화면에서 쓰는 곳은 현재 없다(정렬만) | `filters.js:289` |
| 상대 시각 표기 | "N시간 전"을 만드는 기존 함수가 없다 | `web/src` 검색 |
| 문구 검사 | `check-copy.mjs`는 `src/*.jsx`만 본다(`readdirSync('src')`, 재귀 아님). `shells/` 아래 파일은 검사 밖 | `web/scripts/check-copy.mjs:9` |
| 테스트 실행 | `run-node-tests.mjs`가 `src/**/*.test.js`를 재귀로 돌고 `node:test`가 아니면 실패시킨다. `package.json` 수정 불필요 | `web/scripts/run-node-tests.mjs` |
| 하이드레이션 | `main.jsx`는 `window.__SSR__`가 있으면 `hydrateRoot`로 `<App>`을 맞춘다. 껍데기로 바꾸면 서버 HTML(App)과 어긋난다 | `main.jsx:95-131` |

## 3. 결정

### 3-1. 파일 구성(새 파일 3개 + 시험 1개, 모두 `web/src/shells/scan-compare/`)

| 파일 | 역할 |
| --- | --- |
| `data.js` | 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 옮긴다. 계산 규칙을 새로 쓰지 않는다 |
| `ScanCompareShell.jsx` | 화면. 데이터 불러오기(`fetchBrands`, `fetchBanners`), 목록, 펼침 상태 |
| `scan-compare.css` | 이 시안의 CSS 한 파일. 클래스 접두사 `sc-` |
| `data.test.js` | 어댑터 시험(`node:test`) |

기존 `App.jsx`와 다른 컴포넌트는 그대로 둔다. `web/src/*.js` 기존 파일 diff는 0줄이다.

### 3-2. `data.js`가 내보내는 모양

`toRows(brands)`: 기존 모듈로 줄 목록을 만든다.

1. `applyFilters(brands, defaultFilters())`로 거르고 정렬한다(홈 기본 목록과 같은 순서).
2. 브랜드마다 줄 하나를 만든다. 줄의 값:

| 칸 | 값을 얻는 곳 | 비고 |
| --- | --- | --- |
| `name`, `category`, `links` | 브랜드 그대로 | 로고는 화면이 `BrandLogo`로 그린다 |
| `bestAmount` | `displayBestAmount(offers)` | `null`이면 접힌 줄 금액 자리에 `amountText(대표 오퍼)` |
| `bestOffer` | `splitOffers(offers).best[0]` | 대표 오퍼. 접힌 줄의 앱, 최소주문, 조건이 여기서 나온다 |
| `capturedAt` | `latestCaptured(offers)` | 접힌 줄의 시각. `null`이면 시각 칸을 그리지 않는다 |
| `cells` | 아래 | 앱 4칸 |

`cells`: `PLATFORMS` 순서(배달의민족, 쿠팡이츠, 땡겨요, 요기요) 네 칸 고정. 칸 하나는 `{ platform, state, offer, href, amount, min, chips, isBest }`.

| state | 조건 | 화면 |
| --- | --- | --- |
| `none` | 그 앱의 오퍼가 `offers`에 없다 | `-` |
| `offer` | 오퍼가 있다 | 금액, 최소주문, 조건 칩, 받으러 가기 |

- 한 앱에 오퍼가 여럿이면(확정, 랜덤, 선착순이 따로 선다. `offerKey` 참고) 칸 대표는 `splitOffers(그 앱 오퍼).best[0]`이다. 나머지는 이번 시안에서 칸에 안 그린다(남는 한계, §7).
- `isBest`: 칸 오퍼의 `amount`가 `bestAmount`와 같고 `comparable(offer)`다. 동점이면 칸 전부 강조한다(`splitOffers`의 규칙과 같다. 하나만 골라 올리지 않는다).
- `min`: `minLabel(offer.minOrderAmount)`, `null`이면 **"최소주문 미확인"**(이슈 결정). 새 문구가 아니라 `couponModel.js:176`의 기존 라벨이다. 같은 문자열을 `data.js`에 상수로 한 번 적고, 줄 단위 시험이 `conditionTable`이 내는 라벨과 같은지 맞댄다(§5).
- `chips`: `chipsOf(offer).filter(onCard).map(c => c.text)`. 조건(첫 주문, 월 1회 등)은 줄이되 숨기지 않는다.
- `href`: `offerLink(offer, brand.links, brand.name)`.
- 없음(`-`)과 모름(최소주문 미확인)은 다른 상태다. 오퍼가 없으면 최소주문 칸 자체가 없고, 오퍼가 있는데 값을 모르면 "최소주문 미확인"이 뜬다.

`ago(capturedAt, now)`: "N분 전", "N시간 전", "N일 전" 문자열 하나를 만드는 서식 함수. 규칙(분기)은 이 셋뿐이며 비즈니스 판정이 아니다. **기존 함수가 없어 새로 만드는 유일한 계산이다.** 이슈의 "계산 로직 금지"와 부딪히는지는 §8 질문 1.

### 3-3. 화면

360px 기준. 헤더 아래 곧바로 줄 목록(카테고리 칩은 `CATEGORIES`로 한 줄, 가로 스크롤).

- 접힌 줄(높이 약 64px): `[로고] 브랜드명 / 앱 이름 · 최소주문 · 조건 칩 ... 큰 금액 / N시간 전`. 금액이 가장 크고 굵다.
- 펼친 줄: 같은 줄 바로 아래에 2×2 격자 네 칸. 칸 안에 앱 로고(`PlatformBadge`), 금액, 최소주문, 칩, 받으러 가기. 최고 칸은 테두리와 배경으로 강조하고 "최고" 글자를 단다(색만으로 전하지 않는다).
- 줄은 `button`(`aria-expanded`)이고 한 번에 하나만 펼친다. 두 번째로 누르면 접힌다.
- 접힌 줄에도 최고 앱으로 가는 받으러 가기 버튼 하나를 둔다. 펼치지 않고도 누를 곳이 보인다(목표 3). 클릭은 `openWithNotice`로 연다.
- 확인 시각(목표 1): 접힌 줄에 "N시간 전"을 항상 둔다. 칸마다 시각을 두지 않는다(데이터가 브랜드 단위 `latestCaptured`만 쓰므로).
- 로딩과 실패: 줄 모양 뼈대, 실패는 "불러오지 못했어요" 한 줄과 다시 시도 버튼. 값을 조용히 비우지 않는다.

문구는 시안용으로 세션이 정한다(이슈 결정). 수집기 말(확인, 미확인 새 용례, 판독, 관측 등)을 새로 만들지 않는다. 쓸 문구: "받으러 가기", "최고", "-", "N분/시간/일 전", "불러오지 못했어요", "다시 시도". "최소주문 미확인"만 기존 라벨이다.

### 3-4. `main.jsx` 변경

- `import ScanCompareShell from './shells/scan-compare/ScanCompareShell.jsx'`를 더하고, `<App initial={ssr} />`를 `<ScanCompareShell />`로 바꾼다. 이 두 줄이 "한 줄"의 전부다(import 한 줄은 예외로 본다).
- 서버가 보낸 `window.__SSR__`가 있으면 `hydrateRoot`가 서버 HTML(App)과 껍데기를 맞추다 어긋난다. 프리뷰에서 불일치가 보이면 `const ssr = window.__SSR__`를 `const ssr = null`로 바꾼다(이슈 결정, PR 본문에 적는다). 처음부터 바꾸지 않고 프리뷰에서 보고 정한다.
- `setHubLinks(ssr.banners)`는 껍데기도 같은 일을 해야 한다. 껍데기가 `fetchBanners()` 결과를 `setHubLinks`로 넘긴다(허브 링크는 `offerLink`의 사다리 일부다). 이 한 줄은 `ScanCompareShell` 안에 둔다. `ssr`을 끄면 `main.jsx`의 `setHubLinks` 호출도 같이 사라지므로 껍데기가 맡아야 한다.

### 3-5. 하지 않는 것

- 분석 이벤트(`track`)는 생략한다. 이슈가 허용했다. `offer_link_click`이 안 쌓이므로 프리뷰의 클릭률은 이 시안의 수치로 볼 수 없다(`dev` 이벤트라 어차피 운영 집계에 안 섞인다).
- 필터, 검색, 정렬 UI, 배너, 인기 띠(`popularToday`)는 이번 시안에 그리지 않는다. 이슈가 `popularStrip.js`를 읽기 대상으로 적었으나 개념(목록과 펼침 비교)에 필요하지 않다. 넣으면 첫 화면의 줄 수가 줄어 "훑는 속도"가 깎인다. 넣기를 원하면 §8 질문 2.
- 새 npm 의존성 없음.

## 4. 동반 변경 묶음(`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 해당 | 이번 작업에서 |
| --- | --- | --- |
| 1번 확실성 | 읽기만 | `comparable`, `displayBestAmount`, `splitOffers`를 그대로 부른다. 판정을 다시 쓰지 않으므로 서버 판정표와 안 어긋난다. 이 묶음을 지키는 가장 큰 이유가 "계산을 어댑터에 안 쓴다"이다 |
| 2번 배너 모양, 3번 묶음 배너 | 읽기만 | `fetchBanners`는 허브 링크용으로만 쓴다. 배너 칸은 그리지 않는다 |
| 4번 최소주문 출처 | 해당 | 모르면 비우고 "최소주문 미확인". 지어낸 문턱을 그리지 않는다 |
| 6번 화면에 나가는 글자 | 해당 | 새 문구는 시안용이다(이슈 결정). 병합하지 않으므로 `COPY-STYLE`의 정식 절차를 밟지 않는다. 병합하게 되면 문구부터 개발자 확인을 받는다 |
| 7번 행동 이벤트 | 해당 없음 | `track`을 안 쏜다. `ALLOWED_EVENTS`와 대조 스크립트는 그대로 초록 |
| 8번 배포 순서, 저장소 경계 | 해당 | 프리뷰는 `preview/shell-scan-compare` 브랜치(sub 세션이 push). main에 안 들어간다 |
| 9번 새 파일 | 해당 | `data.test.js`는 `run-node-tests.mjs`가 재귀로 돌므로 `package.json`을 안 고친다. `python scripts/generate_project_structure.py`로 `docs/PROJECT-STRUCTURE.md`를 다시 만들고 커밋한다 |

## 5. 시험

### `web/src/shells/scan-compare/data.test.js` (`node:test`)

실제 응답 모양의 픽스처 브랜드 몇 개로 `toRows`를 돌린다.

- 앱 4칸이 `PLATFORMS` 순서로 항상 네 칸이다. 오퍼 없는 앱은 `state: 'none'`.
- 최고 칸: `amount`가 `bestAmount`와 같고 `comparable`인 칸만 `isBest`. 동점이면 둘 다. 랜덤, 특정메뉴, 품절 오퍼는 최고가 안 된다(`certainty-cases.json`의 대표 사례 두세 개를 인용).
- `minOrderAmount`가 `0`이면 "최소주문 없음", `null`이면 "최소주문 미확인", 숫자면 `toLocaleString('ko-KR')`.
- "최소주문 미확인" 상수가 `conditionTable`이 낸 `min`의 라벨과 같다(같은 문자열을 두 곳에 적은 값의 커네선스를 맞댄다).
- 줄 순서가 `applyFilters(brands, defaultFilters())`의 순서와 같다.
- `ago`: 59초 → "방금", 5분, 3시간, 2일. `null`/잘못된 문자열이면 빈 값(그리지 않음), 던지지 않는다.
- `links`와 `offerLink` 결과가 칸 `href`와 같다(쿠팡이츠는 공유 링크 폴백까지).

### 빌드와 기존 시험

- `npm test`, `npm run build` 통과. 위 시험은 같은 `npm test`에 자동으로 들어간다.
- `git diff --stat main -- web/src/*.js`에 변경 없음. `web/src/shells/` 밖은 `main.jsx`뿐.

### 프리뷰에서 눈으로

- 360px 스크린샷: 첫 화면(접힘 줄 여러 개), 줄 하나를 펼친 화면, `-`와 "최소주문 미확인"이 함께 보이는 브랜드. 결과 댓글에 단다.
- 운영 API 데이터로 그려지는지, 받으러 가기가 각 앱 링크로 열리는지 확인. 앱 링크는 데스크톱 브라우저에서 앱이 없어 실패할 수 있으므로 링크 주소(`href`)를 보는 것으로 갈음하고 **그렇게 했다고 적는다.**

## 6. 끊기면 무엇이 보이나

- `bestAmount`를 `displayBestAmount` 대신 직접 최댓값으로 계산하면 특정메뉴나 랜덤 쿠폰이 "최고"로 서고 서버 정렬과 배지가 어긋난다(1번 묶음의 사고). 어댑터는 판정을 기존 함수에만 맡긴다.
- 오퍼 없음(`-`)과 값 모름을 한 모양으로 그리면 "그 앱에 쿠폰이 없다"와 "있는데 최소주문을 모른다"가 섞여 신뢰성(목표 1)이 깎인다. 상태를 나눈 이유.
- `main.jsx`에서 `setHubLinks`를 안 부르면 허브 링크 사다리가 비어 일부 앱 링크가 `undefined`로 떨어진다. 화면은 멀쩡하고 누르면 아무 데도 안 간다. 시험의 `href` 단언이 잡는다.
- 하이드레이션 불일치는 콘솔 경고와 깜박임으로만 보이고 기능은 산다. 프리뷰에서 먼저 본다.

## 7. 대안과 남는 한계

| 대안 | 버린 이유 |
| --- | --- |
| 접힌 줄을 누르면 모달이나 하단 시트로 비교 | 개념이 "그 자리에서 펼침"이다. 목록 맥락을 잃는다 |
| 접힌 줄에 4칸을 항상 노출(#233 그대로) | 줄당 높이가 4배가 되어 훑는 속도가 깎인다 |
| 줄 전체를 링크로 | 펼침과 클릭 의도가 겹친다. 줄은 펼침, 받으러 가기는 별도 버튼 |
| 어댑터 없이 화면에서 기존 모듈 직접 호출 | 화면에 변환이 흩어져 시험이 어렵다. 이슈가 `data.js` 한 곳을 정했다 |

남는 한계(시안이라 두는 것):
- 한 앱에 오퍼가 여럿이면 칸에 대표 하나만 그린다. 선착순과 상시가 함께 있는 브랜드에서 나머지가 안 보인다.
- 확인 시각은 브랜드 단위(`latestCaptured`)다. 앱마다 다른 시각을 칸에 못 보인다.
- `track`이 없어 클릭률을 못 잰다.

## 8. 결정이 필요한 것

1. **`ago`(몇 시간 전 서식)를 `data.js`에 새로 두어도 되는가.** 기존 함수가 없다. 규칙 판정이 아닌 서식이므로 두는 것으로 가정했다. 안 된다면 접힌 줄은 시각을 날짜 문자열(`capturedAt`의 `MM.DD HH:mm`)로 그린다.
2. **인기 띠(`popularToday`)를 이번 시안에서 뺀다.** 읽기 대상으로 이슈에 적혀 있으나 개념에 필요하지 않다고 판단했다. 넣기를 원하면 목록 위에 한 줄로 얹는다.
3. **하이드레이션 처리를 프리뷰에서 본 뒤 정한다.** 처음부터 `ssr`을 끄는 쪽을 원하면 `main.jsx` 변경이 두 줄이 된다.
4. 확인하지 않은 것: 운영 API 응답에서 `capturedAt`이 오퍼마다 채워지는 비율. 비어 있으면 접힌 줄에 시각이 안 뜬다(목표 1 약화). 프리뷰에서 확인한다.

## 9. 구현 순서

1. `data.js`와 `data.test.js`(시험 먼저). `npm test` 통과.
2. `ScanCompareShell.jsx`와 `scan-compare.css`.
3. `main.jsx` 변경, `npm run build`.
4. `python scripts/generate_project_structure.py`로 `docs/PROJECT-STRUCTURE.md` 재생성, 커밋.
5. 사람 또는 sub 세션이 `preview/shell-scan-compare`로 push. 프리뷰에서 360px 스크린샷을 찍어 결과 댓글에 단다.
