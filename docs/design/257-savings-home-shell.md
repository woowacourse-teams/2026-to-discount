# 257 홈 리뉴얼 시안: 얼마 아끼나 (savings)

이슈: [#257](https://github.com/woowacourse-teams/2026-to-discount/issues/257). 묶음 이슈 #230. 웹만 바꾼다. API 변경 없음. **버리는 시안이라 병합하지 않는다.** PR은 초안으로 두고 프리뷰만 본다.

## 결론

홈 맨 위에 '주문 금액' 입력(기본 20,000원)을 두고, 그 금액으로 실제 받을 수 있는 할인만 '아끼는 돈' 큰 숫자 순으로 보여 준다. 기존 모듈은 한 줄도 고치지 않는다. 새 코드는 `web/src/shells/savings/` 안에만 둔다.

- 신뢰성(목표 1): 받을 수 없는 할인(최소주문이 입력 금액보다 큼)은 목록에서 뺀다. 최소주문을 모르면 기존 라벨 "최소주문 미확인"을 그린다. 맨 위에 최근 갱신 시각을 둔다.
- 핵심 전달(목표 2): 카드의 가장 큰 글자는 '아끼는 돈'. 앱, 조건은 그 아래 한 줄로 줄인다.
- 클릭(목표 3): 카드마다 '쿠폰 받으러 가기' 버튼을 첫 화면 안에 둔다. `offerLink`로 실제 앱 링크를 연다.

## 배경

- 지금 홈(`App.jsx`)은 브랜드 카드마다 최고 할인과 앱별 쿠폰을 늘어놓고 최소주문은 작은 글씨다. 내 주문 금액으로 쓸 수 있는지는 사용자가 읽어서 판단한다.
- 시안 개념은 그 판단을 입력 한 칸으로 옮기는 것이다. 계산은 금액 비교 한 줄(`minOrderAmount <= 입력 금액`)이고 나머지는 기존 함수가 한다.

## 변경 범위

새 파일은 전부 `web/src/shells/savings/` 아래. 기존 파일 수정은 `web/src/main.jsx` 한 곳.

| 파일 | 역할 |
| --- | --- |
| `data.js` | 기존 모듈을 불러 껍데기용 모양으로 바꾸는 얇은 어댑터. 계산 로직 없음 |
| `SavingsShell.jsx` | 화면. 데이터 불러오기, 입력, 카드 목록 |
| `savings.css` | 이 시안의 CSS 하나. 새 npm 의존성 없음 |
| `data.test.js` | `data.js` 단위 테스트(아래 "테스트") |

### `data.js`: 읽는 모듈과 쓰는 곳

| 필요한 값 | 읽는 곳 |
| --- | --- |
| 브랜드와 오퍼 | `api.js`의 `fetchBrands` |
| 배너 | `api.js`의 `fetchBanners` → `offerLink.js`의 `setHubLinks` (아래 "링크") |
| 분류 칩 | `filters.js`의 `CATEGORIES` |
| 분류, 앱, 5천원 거르기 | `filters.js`의 `defaultFilters`, `applyFilters` |
| 받을 수 있는 오퍼 가르기 | `filters.js`의 `comparable`, `isBundle` |
| 브랜드의 아끼는 돈 | `filters.js`의 `displayBestAmount` (받을 수 있는 오퍼만 넣는다) |
| 정렬 | `filters.js`의 `sortBrands` |
| 금액 글자, 칩, 조건 | `couponModel.js`의 `amountText`, `chipsOf`, `qualifiersOf`, `minLabel`, `channelOf` |
| 갱신 시각 | `filters.js`의 `latestCaptured` |
| 앱 링크 | `offerLink.js`의 `offerLink`, `openWithNotice` |
| 오늘 인기(선택) | `popularStrip.js`의 `popularToday` |

`data.js`가 내보내는 함수 하나: `savingsRows(brands, orderWon, categories)`. 순서는 다음과 같다.

1. `applyFilters(brands, {...defaultFilters(), categories})`로 분류, 앱, 5천원 거르기를 기존 규칙 그대로 적용한다.
2. 브랜드마다 오퍼를 `받을 수 있음`, `최소주문 모름`, `최소주문 초과`로 가른다. 가르는 기준은 비교 한 줄이다.
   - 받을 수 있음: `minOrderAmount != null && minOrderAmount <= orderWon`
   - 모름: `minOrderAmount == null` (`minLabel`이 null을 내는 경우)
   - 초과: 그 밖
3. `받을 수 있음` 오퍼를 `displayBestAmount`에 넣어 브랜드의 '아끼는 돈'을 얻는다. 값이 null인 브랜드(특정메뉴, 랜덤, 상한만 있는 브랜드 포함)는 '아끼는 돈' 목록에서 뺀다. `displayBestAmount`가 `comparable`로 가르므로 4,999원 정렬 천장이 화면에 찍히지 않는다.
4. `sortBrands`에 '받을 수 있음' 오퍼만 담은 브랜드를 넘겨 할인금액 높은순으로 정렬한다.
5. 최소주문을 모르는 오퍼만 있는 브랜드는 위 목록과 섞지 않고 아래 구역 "최소주문 미확인"에 따로 둔다. 확정 큰 숫자 순위를 흐리지 않기 위함.

정렬, 판정, 금액 글자를 새로 만들지 않는다. `data.js`가 직접 하는 일은 위 2번의 비교 한 줄과 모양 바꾸기뿐이다.

### 카드 한 장

- 로고와 브랜드명: 기존 `logos.jsx`의 `BrandLogo`를 불러 쓴다.
- 큰 숫자: 브랜드의 '아끼는 돈' (`displayBestAmount` 값, 글자는 `amountText`).
- 그 값을 낸 오퍼의 앱 이름, `chipsOf`에서 뽑은 칩, 최소주문(`minLabel`).
- 앱 4개 한 줄: 앱마다 그 앱의 받을 수 있는 최고 금액. 없음과 모름은 다르게 그린다.
  - 그 앱에 오퍼가 없음: `-`
  - 오퍼는 있는데 최소주문을 모름: 기존 라벨 "최소주문 미확인"
  - 오퍼는 있는데 입력 금액이 모자람: 흐린 글자로 `minLabel` 값을 단다. 누를 수 없음
- 버튼 '쿠폰 받으러 가기': 아끼는 돈을 낸 오퍼의 링크를 연다.
- 카드 아래 작게 그 브랜드의 갱신 시각(`latestCaptured`).

### 링크

- `<a href={offerLink(offer, brand.links, brand.name)}>`에 `onClick={(e) => openWithNotice(e, href)}`. 커스텀 스킴(`coupangeats://` 등)은 같은 탭, `http`는 새 탭. `CouponCard.jsx`의 `OfferLinkA`와 같은 규칙을 따른다(코드는 복사하지 않고 같은 두 함수를 부른다).
- `track(...)`은 부르지 않는다(이슈가 생략을 허용). 그래서 `ALLOWED_EVENTS`(변경 전파 7번 묶음)에 닿지 않는다.
- `setHubLinks`는 `main.jsx`가 SSR 데이터가 있을 때만 부른다. 이 시안은 `fetchBanners()` 결과로 `SavingsShell`이 직접 부른다. 안 부르면 배민 오퍼 중 링크가 없는 것이 허브 대신 앱 열기로 떨어진다.

### `main.jsx`: 한 줄

`<App initial={ssr} />`를 `<SavingsShell />`로 바꾸고 `import`를 한 줄 더한다. 기존 `App.jsx`와 다른 컴포넌트는 지우지 않는다.

- 프리뷰에서 하이드레이션 불일치가 보이면(홈 HTML을 SSR 서버가 `App`으로 그려 보내므로 가능성이 높다) `const ssr = window.__SSR__`를 `const ssr = null`로 바꾸는 한 줄을 더한다. 그때는 PR 본문에 적는다(이슈 결정). 이 경우 `setHubLinks(ssr.banners)`도 안 타므로 위 링크 항목이 필수다.

## 변경 전파 점검

`docs/CHANGE-PROPAGATION.md`에서 이번 변경이 닿는 묶음을 찾았다.

| 묶음 | 닿나 | 이유 |
| --- | --- | --- |
| 1. 확실성 판정 | 읽기만 | `comparable`, `displayBestAmount`를 그대로 부른다. 규칙을 다시 쓰지 않으므로 서버와 어긋나지 않는다 |
| 2~3. 배너 모양, 묶음 배너 | 아니오 | `EventBanner`, `bannerTag`를 쓰지 않는다. 배너는 `setHubLinks` 입력으로만 읽는다 |
| 4. 최소주문 출처 | 읽기만 | 지어내지 않는다. 모르면 "최소주문 미확인"을 그대로 그린다 |
| 6. 화면 글자 | 닿음 | 아래 "문구" |
| 7. 행동 이벤트 | 아니오 | `track`을 부르지 않는다 |
| 8. 배포 순서 | 아니오 | API 변경 없음. 프리뷰만 올린다 |
| 9. 새 파일 | 닿음 | 아래 "새 파일" |

한 묶음의 절반만 고치는 일은 없다. 닿는 묶음에서 고치는 파일이 없기 때문이다(읽기만).

## 문구

새 문구는 시안 한정으로 세션이 정해도 된다(이슈 결정). 지키는 것:

- 수집기 말(확인, 미확인, 판독, 관측, 수집, 추정 등)을 새로 만들지 않는다. "최소주문 미확인"은 `couponModel.js`의 기존 정식 라벨이라 새 문구가 아니다.
- 명사구 또는 짧은 조건, 문장 끝 `다.`, `요.` 금지(`docs/COPY-STYLE.md` 1번). 후보: 입력 라벨 "주문 금액", 큰 숫자 위 "아끼는 돈", 버튼 "쿠폰 받으러 가기", 갱신 시각 "N월 N일 HH:mm 기준".
- 여는 시각이 글자에 들어가면 시각 뒤에 `오픈`을 붙인다(`npm run test:copy`가 JSX 글자를 검사한다).

## 새 파일

- `web/src/shells/savings/data.test.js`는 `web/scripts/run-node-tests.mjs`가 `src/` 아래 `*.test.js`를 전부 찾는다. `package.json`의 `test`에 따로 적을 필요 없다.
- `node --test`는 `.jsx`를 못 읽는다(`logoSrc.js` 주석). 그래서 테스트할 계산은 `data.js`에 있고 `.jsx`에는 없어야 한다.
- 구조 문서: 새 파일이 생기므로 `python scripts/generate_project_structure.py`로 `docs/PROJECT-STRUCTURE.md`를 다시 만든다. 안 하면 push 훅이 막는다. (이 설계 문서만 있는 이번 커밋에는 해당 없음, 구현 때 한다.)

## 테스트

`data.test.js` (`node:test`). 결론은 테스트로 박는다.

- 최소주문이 입력 금액 이하인 오퍼만 '아끼는 돈'에 든다. 경계(`==`)는 든다.
- 최소주문이 입력 금액보다 큰 오퍼는 안 든다. 그 앱 칸은 "초과" 상태다.
- `minOrderAmount == null`은 '받을 수 있음'에도 '초과'에도 들지 않고 "모름"으로 나간다. `-`(오퍼 없음)와 상태가 다르다.
- 특정메뉴 쿠폰만 있는 브랜드는 목록에 없다. 4,999가 큰 숫자로 나오지 않는다.
- 정렬은 큰 숫자 내림차순, 같으면 이름순.
- 입력 금액을 바꾸면 같은 브랜드의 큰 숫자가 달라진다(20,000원 → 10,000원).
- 기존 모듈의 diff가 0줄이다: `git diff --stat main -- web/src/*.js`에 `shells/` 밖 변경이 없다(`main.jsx` 한 줄 제외).

`.jsx` 화면은 단위 테스트가 없다. 360px 스크린샷과 프리뷰로 본다.

## 완료 조건 대응

| 완료 조건 | 어떻게 |
| --- | --- |
| 360px 첫 화면에 개념이 드러남 | 헤더 한 줄(제목, 갱신 시각), 주문 금액 입력, 첫 카드의 큰 '아끼는 돈'과 버튼이 스크롤 없이 한 화면에 든다 |
| 운영 API 데이터, 카드 누르면 앱 링크 | `fetchBrands()`는 `VITE_API_BASE_URL` 설정을 그대로 쓴다. 링크는 `offerLink` |
| 기존 로직 파일 diff 0줄 | 위 "테스트"의 마지막 항목 |
| `npm test`, `npm run build` 통과 | 구현 뒤 실행 |

## 화면 상태

- 불러오는 중: 기존 `BrandGridSkeleton.jsx`를 쓸 수 있으면 쓰고, 아니면 글자 한 줄.
- 불러오기 실패: 글자 한 줄과 다시 시도 버튼. 조용히 빈 목록을 그리지 않는다(빈 목록과 실패가 구분되지 않는다는 `AGENTS.md`의 경고).
- 입력 금액이 너무 낮아 받을 수 있는 할인이 0건: 빈 화면 대신 "받을 수 있는 할인 없음"과 최소주문이 가장 낮은 값(`lowestMinOrder`)을 보여 준다.
- 입력: 숫자만, 비우면 기본 20,000원. 천 단위 쉼표. 1,000원 단위 눈금은 `MIN_AMOUNT_OPTIONS`와 별개 값이므로 쓰지 않는다.

## 구현자에게

- 브랜치는 이 설계 브랜치에 이어서 커밋한다. push와 PR 갱신은 워크플로가 한다.
- 프리뷰: 구현이 끝나면 `preview/shell-savings`로 올린다(사람 또는 sub 세션이 push, `docs/WORKFLOW.md` §3-3). PR 본문 맨 위에 `https://beggars-git-preview-shell-savings-nn98s-projects.vercel.app`를 적는다. PR은 초안 유지, 병합하지 않는다.
- 360px 스크린샷을 결과 댓글에 단다.
- 기존 `web/src/*.js`와 `App.jsx`를 고치지 않는다. 고칠 일이 보이면 시안이 틀어진 것이니 멈추고 알린다.

## 열린 질문(리뷰 포인트)

- **최소주문을 모르는 오퍼를 '아끼는 돈'에서 뺀 것이 맞는가.** 이슈는 "모르면 라벨을 그린다"만 정했다. 이 설계는 큰 숫자 순위에서는 빼고 아래 구역에 라벨과 함께 둔다. 같이 순위에 넣는 쪽이 낫다면 2번 규칙 한 줄만 바뀐다.
- **최소주문 초과 오퍼를 앱 칸에 흐리게 남기는 것이 맞는가.** 지우면 `-`(오퍼 없음)와 구분이 사라진다.
- **갱신 시각의 글자 "N월 N일 HH:mm 기준"이 수집기 말이 아닌가.** 기준 시각 표시는 목표 1(신뢰성)의 핵심이라 넣었다.
- **`capturedAt`의 형식은 이 설계가 확인하지 못했다.** 코드에서 문자열 비교(`latestCaptured`)만 쓰고, 실제 응답 형식은 구현자가 `/api/brands` 응답으로 먼저 본다.

## 변경 이력

- 2026-11-03: 이슈 "결정 (2026-11-03, 설계 점검 뒤)"을 설계로 반영했다. 최소주문을 모르면 "최소주문 미확인", 오퍼 없음은 `-`, 시안 문구는 세션 재량(위 본문과 같다). 아래는 구현 중 생긴 변동이다.
  - `main.jsx`가 한 줄이 아니다. 이슈가 허용한 하이드레이션 대비로 `const ssr = null`(SSR 데이터 무시)을 처음부터 넣었다. 서버가 `App`으로 그린 HTML에 `SavingsShell`을 하이드레이션하면 어긋난다고 보았다. 프리뷰에서 확인하지는 못했다.
  - 빌드 후처리(`scripts/ssr-template.mjs`)가 `App`의 지연 로드 쿠폰 카드 CSS 조각을 찾아, 홈이 `App`을 안 부르면 `npm run build`가 실패한다. 그래서 `import App`을 남기고 `window.__App = App` 한 줄로 번들에 붙들었다. 시안 한정이고 병합하지 않는다.
  - 최소주문 글자는 `minLabel`이 숫자 문자열만 내서 `최소주문 12,000원`으로 감쌌다(`data.js`의 `minText`). 0원은 기존 라벨 "최소주문 없음" 그대로.
  - `capturedAt` 실제 응답 형식은 확인하지 못했다(운영 API 호출이 이 세션에서 막혔다). `capturedLabel`은 `Date.parse`가 읽으면 "N월 N일 HH:mm 기준"(KST), 못 읽으면 원문을 그대로 그린다.
