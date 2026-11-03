# 259: 홈 리뉴얼 시안 "오늘 요약판(digest)" 껍데기

- 이슈: [#259](https://github.com/woowacourse-teams/2026-to-discount/issues/259) (묶음 이슈 #230)
- 상태: 설계 초안(승인 대기)
- 범위: `web/src/shells/digest/` 새 파일, `web/src/main.jsx` 한 줄. 그 밖은 건드리지 않음
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 프리뷰만 본다.

## 1. 문제

- 홈 리뉴얼 시안 여러 개를 빠르게 뽑아 프리뷰로 견주려 한다. 이 시안의 개념은 "아침에 한 번 열어 보는 대시보드".
- 리뉴얼 목표(우선순위 순): ① 값이 언제 어디서 확인됐는지 믿을 수 있게 ② 핵심(얼마, 어느 앱, 조건)을 빠르게 ③ 누를 곳을 빨리 보여 클릭률과 재방문율을 올림.
- 로직을 새로 짜면 시안끼리 숫자가 달라져 견줄 수 없다. 기존 모듈을 그대로 읽는다.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 홈 데이터 모양 | `fetchBrands()`는 브랜드 배열. 브랜드마다 `name`, `category`, `links`, `offers[]`. 오퍼마다 `platform`, `amount`, `minOrderAmount`, `capturedAt`, `isNew`, `soldOut`, `kind`, `certainty`, `link` | `api.js`, `filters.js`, `couponModel.js` |
| 앱은 몇 개인가 | 넷: 배민, 쿠팡이츠, 땡겨요, 요기요(`PLATFORMS`). 자사(`own`)는 필터 밖이라 오퍼 목록에만 섬 | `platforms.js` |
| "오늘 할인" 기본 기준 | `defaultFilters()`가 5,000원 미만과 멤버십 필터를 이미 건다. `applyFilters`가 정렬(할인금액 높은 순)까지 한다 | `filters.js` `DEFAULT_SCALARS`, `applyFilters` |
| "새로 생김"의 정본 | `applyFilters`의 `updatedOnly`가 "최고 오퍼가 신규인 브랜드만"으로 거른다. 신규 판정은 서버 `isNew`가 먼저, 칸이 없는 옛 응답만 `firstSeenAt`이 오늘인지 | `filters.js` `hasNewBest`, `isUpdated` |
| 최고 금액의 정본 | `displayBestAmount(offers, include)`. 정렬용 `bestConfirmedAmount`는 특정메뉴에 4,999원을 끼우므로 화면에 못 찍음 | `filters.js` 주석 |
| 시각 | `latestCaptured(offers)`가 가장 최근 `capturedAt` 문자열 또는 null | `filters.js` |
| 카드의 최소주문 | 기존 `CouponCard.Min`은 `minOrderAmount`가 null이면 **아무것도 안 그린다.** 정식 라벨 "최소주문 미확인"은 `couponModel.js` `conditionTable`의 줄(`min`)에만 있고 상수로 내보내지 않음 | `CouponCard.jsx:35`, `couponModel.js:176` |
| 링크 | `offerLink(offer, brand.links, brand.name)`. 쿠팡이츠 `coupangeats://`와 공유 링크는 `openWithNotice`가 안내를 띄운 뒤 연다 | `offerLink.js`, `CouponCard.jsx:55` |
| SSR | 서버가 `App`을 그려 `window.__SSR__`를 보낸다. `main.jsx`는 그 데이터로 `hydrateRoot`. 홈을 `DigestShell`로 바꾸면 서버 HTML과 트리가 달라 하이드레이션 불일치가 난다 | `main.jsx:95-112`, `entry-server.jsx` |

**미확인:** 운영 API의 `capturedAt`이 오퍼마다 채워져 있는지, `isNew` 칸이 지금 응답에 오는지. 구현 때 실제 응답으로 본다(§6).

## 3. 결정

### 3-1. 화면 (360px 첫 화면)

위에서 아래로 한 화면 안에 개념이 드러나야 한다.

1. **머리 줄:** 앱 이름 자리와 "갱신 M월 D일 HH:mm"(한국 시각). 값이 언제 확인됐는지가 목표 1이라 맨 위, 요약 칸보다 먼저 둔다.
2. **요약 위젯 3칸** (가로 3등분, 칸마다 큰 숫자와 작은 이름):

   | 칸 | 큰 숫자 | 누르면 |
   | --- | --- | --- |
   | 오늘 할인 | 기본 필터를 건 목록의 브랜드 수 `N곳` | 전체 목록(할인금액 높은 순) |
   | 최고 금액 | 그 목록 전체 오퍼에서 `displayBestAmount` | 같은 목록을 금액 순으로 맨 위부터, 최고 카드를 강조 |
   | 새로 생김 | `updatedOnly` 목록의 브랜드 수 `N곳` | `updatedOnly` 목록 |

   - 숫자와 목록은 **같은 목록에서** 센다. 칸 숫자와 눌러서 나온 개수가 다르면 신뢰성 목표에 어긋난다.
   - 칸을 누르면 아래 목록 위에 "지금 보는 기준" 줄을 붙이고(예: 선택한 칸 이름), 같은 칸을 다시 누르면 전체로 돌아간다.
3. **카드 목록.** 카드 한 장:
   - 브랜드 이름, 큰 금액(`displayBestAmount`, 없으면 `amountText` 원문), 그 오퍼의 앱 이름.
   - 조건 줄: `chipsOf`의 카드용 칩(첫 주문, 월 1회류 배지)과 최소주문. 줄이되 숨기지 않는다.
   - **앱 4칸 줄:** 배민, 쿠팡이츠, 땡겨요, 요기요 순서 고정. 칸마다 그 앱의 그 브랜드 최고 금액.
   - **주 버튼 "쿠폰 받으러 가기":** 카드 오른쪽 아래, 최고 오퍼의 `offerLink`로 연다. 앱 4칸도 각각 눌러 그 앱으로 연다.

### 3-2. 없음과 모름을 다르게 그린다

| 상태 | 판정 | 그리는 것 |
| --- | --- | --- |
| 그 앱에 그 브랜드 오퍼가 없다 | 브랜드 `offers`에 그 `platform`이 없음 | `-` (누를 수 없음) |
| 오퍼는 있고 최소주문을 모른다 | `minLabel(o.minOrderAmount) === null` | "최소주문 미확인" |
| 오퍼는 있고 최소주문이 0 | `minLabel`이 "최소주문 없음" | 그 라벨 |
| 오퍼는 있고 금액이 숫자가 아니다(최대, 랜덤, 정률) | `amount == null` | `amountText`의 원문(`rawText`)과 `chipsOf` 칩 |
| 품절 | `o.soldOut` | 금액에 취소선과 "품절". 주 버튼은 품절이 아닌 오퍼를 먼저 고름 |
| 갱신 시각을 모른다 | `latestCaptured`가 null | 머리 줄에 "갱신 시각 알 수 없음". 빈 칸으로 두지 않음 |

- "-"를 "0원"이나 빈칸과 섞지 않는 것이 이 시안에서 가장 먼저 시험할 부분이다(AGENTS "먼저 알 것").
- "최소주문 미확인"은 `couponModel.js:176`과 **같은 글자**여야 한다. 기존 모듈이 상수로 내보내지 않아 `data.js`에 한 번 적는다. 이 글자가 바뀌면 시안만 옛 글자로 남는 값의 결합이다(§5). 병합하지 않는 시안이라 두고, 테스트로 두 글자가 같은지 대조한다(§4-3).

### 3-3. 파일

| 파일 | 하는 일 |
| --- | --- |
| `web/src/shells/digest/data.js` | 기존 모듈을 불러 화면용 모양으로 바꾸는 얇은 어댑터. 새 계산 규칙 없음 |
| `web/src/shells/digest/DigestShell.jsx` | 데이터 불러오기(`fetchBrands`, `fetchBanners`, 실패와 로딩 상태), 칸 선택 상태, 화면 |
| `web/src/shells/digest/digest.css` | 이 시안의 CSS 전부. 파일 하나 |
| `web/src/shells/digest/data.test.js` | 어댑터 시험(§4-3) |
| `web/src/main.jsx` | `<App initial={ssr} />`를 `<DigestShell />`로 바꾼 한 줄. `App.css` import는 둔다 |

`DigestShell.jsx`는 이슈가 말한 "화면에 필요한 값은 data.js 한 곳"을 지키려고, 컴포넌트에서 `filters.js`나 `couponModel.js`를 직접 부르지 않는다. 컴포넌트가 하는 계산은 한국 시각 문자열 만들기(`Intl`)뿐이다.

### 3-4. `data.js`가 내보내는 것

```
digestOf(brands, selection)  → {
  capturedAt,            // latestCaptured(전체 오퍼) 또는 null
  tiles: { today: {count}, top: {amount}, fresh: {count} },
  cards: [ { name, best: { amountText, platform, chips, minText, href, soldOut },
             cells: [ { platform, label, amountText|null, href|null } x4 ] } ]
}
```

- 기본 목록: `applyFilters(brands, defaultFilters())`. 오늘 할인 칸 숫자와 첫 목록이 이것.
- 새로 생김: `applyFilters(brands, { ...defaultFilters(), updatedOnly: true })`.
- 최고 금액: 기본 목록의 오퍼에 `displayBestAmount`를 걸고, 브랜드별 값 중 최댓값을 고른다. 이 `Math.max`가 어댑터 안에 들어가는 유일한 합산이고, 규칙이 아니라 모으기다.
- 카드의 최고 오퍼: `splitOffers`가 아니라 `displayBestAmount`와 같은 금액인 오퍼 중 첫째. 최고가 없으면(전부 불확정) `amountText` 원문의 첫 오퍼.
- 앱 4칸: `PLATFORMS` 순서로 그 앱 오퍼만 모아 `displayBestAmount`, 없으면 첫 오퍼 `amountText`. 그 앱 오퍼가 하나도 없을 때만 `-`.
- 링크: `offerLink(offer, brand.links, brand.name)`. `setHubLinks(banners)`는 `main.jsx`가 하던 호출을 `DigestShell`의 배너 로딩 뒤에 부른다(쿠팡이츠 허브 링크가 거기서 온다).

## 4. 구현 순서와 검증

### 4-1. 순서

1. `data.js`와 `data.test.js`. 먼저 시험을 쓴다.
2. `DigestShell.jsx`, `digest.css`. 360px에서 첫 화면 확인.
3. `main.jsx` 한 줄. `ssr`은 일단 무시하지 않는다.
4. 프리뷰에서 하이드레이션 불일치가 보이면 `main.jsx`에서 `ssr`을 무시하는 한 줄을 더 바꾼다(이슈 결정). 바꿨다면 PR 본문에 적는다.

### 4-2. 하지 않는 것

- 기존 `web/src/*.js`와 `App.jsx`, 다른 컴포넌트를 고치거나 지우지 않는다.
- 새 npm 의존성, 새 CSS 파일(`digest.css` 외)을 만들지 않는다.
- 검색, 분류 탭, 정렬 시트, 푸시, 설문, 푸터는 이 시안에 없다. 첫 화면 개념을 견주는 것이 목적.
- `track(...)` 이벤트는 안 쏜다(이슈가 생략을 허용). 그래서 프리뷰의 클릭 수치는 쌓이지 않는다.

### 4-3. 시험 (`data.test.js`)

`web/package.json`의 `test` 명령에 새 파일을 넣는다. 안 넣으면 안 돈다.

- Given 오퍼가 있는 브랜드 / When `digestOf` / Then 오늘 할인 칸 숫자 == 카드 수 == `applyFilters` 결과 길이.
- Given 신규 오퍼가 최고인 브랜드 하나 / When 새로 생김 칸 / Then 숫자 == `updatedOnly` 목록 길이.
- Given 배민 오퍼만 있는 브랜드 / When 앱 4칸 / Then 나머지 셋은 `-`(null)이고 배민 칸은 금액.
- Given `minOrderAmount`가 null인 오퍼 / When 카드 / Then 최소주문 글자는 "최소주문 미확인"이고 빈 문자열이 아님.
- Given `minOrderAmount`가 0 / Then "최소주문 없음".
- Given 특정메뉴 쿠폰만 있는 브랜드 / When 최고 금액 / Then 4,999가 아니라 액면(`displayBestAmount`).
- Given 오퍼가 없는 브랜드 배열 / When `digestOf` / Then 칸 숫자 0, 최고 금액 null, `capturedAt` null, 예외 없음.
- 대조: `data.js`의 "최소주문 미확인"과 `couponModel.js` `conditionTable`이 내는 `min` 글자가 같다(오퍼 하나로 `conditionTable`을 불러 비교).

그 밖의 확인은 `npm test`, `npm run build`, 360px 스크린샷, 운영 API 데이터로 카드를 눌러 앱 링크가 열리는지.

## 5. 변경 전파 점검 ([`CHANGE-PROPAGATION.md`](../CHANGE-PROPAGATION.md))

| 묶음 | 닿는가 | 판단 |
| --- | --- | --- |
| 1. 확실성 판정 | 읽기만 | `applyFilters`, `displayBestAmount`, `isUpdated`를 그대로 불러 판정을 새로 만들지 않는다. 판정표 시험 영향 없음 |
| 2. 배너 모양, 3. 묶음 배너 | 아니오 | 배너 컴포넌트를 안 그린다. 배너는 `setHubLinks`용으로만 받음 |
| 4. 최소주문 출처 | 읽기만 | 모르면 "최소주문 미확인". 지어내지 않음 |
| 6. 화면에 나가는 글자 | **닿는다** | 아래 참고 |
| 7. 행동 이벤트 | 아니오 | `track` 안 씀. `ALLOWED_EVENTS`와 대조 스크립트에 영향 없음 |
| 8. 배포 순서와 프리뷰 | 닿는다 | web만 바뀐다. API 변경 없음이라 순서 문제 없음. 프리뷰 `preview/shell-digest`로만 올림 |
| 9. 새 파일 | 닿는다 | `web/src/shells/digest/*` 새 파일이라 `docs/PROJECT-STRUCTURE.md`를 `python scripts/generate_project_structure.py`로 다시 만들어야 push 훅이 안 막는다. `data.test.js`는 `test` 명령에 넣는다 |

**6번(글자) 판단:**

- 규칙은 "새 문구는 세션이 정하지 않는다"인데, 이슈 결정(2026-11-03)이 "병합하지 않는 시안의 임시 문구는 세션이 정해도 된다"고 풀었다. 이 시안이 쓰는 임시 문구: "오늘 할인", "최고 금액", "새로 생김", "갱신", "쿠폰 받으러 가기", "갱신 시각 알 수 없음", "지금 보는 기준".
- 수집기 말("확인", "미확인", "판독", "관측")은 새로 만들지 않는다. "최소주문 미확인"은 기존 정식 라벨을 그대로 쓴 것이라 예외(이슈 결정).
- "갱신 시각 알 수 없음"에는 "알 수 없음"이 들어간다. 수집기 말은 아니지만 비슷한 결이라 **리뷰에서 확인이 필요하다**(§7).
- 이 문구들은 병합되지 않는다. 시안에서 좋은 부분을 모을 때 정식 문구로 다시 정해야 하며, 그때 `docs/COPY-STYLE.md`를 따른다.

## 6. 위험과 완화

| 위험 | 완화 |
| --- | --- |
| 하이드레이션 불일치로 첫 화면이 깜박이거나 오류가 찍힘 | 프리뷰에서 먼저 본다. 보이면 `main.jsx`에서 `ssr` 무시 한 줄(§4-1) |
| 서버 HTML이 `App`이라 SSR을 켠 프리뷰에서 옛 홈이 잠깐 보임 | 위와 같은 한 줄로 `createRoot`만 쓰게 하면 사라짐. 시안 비교용이라 허용 |
| 오퍼에 `capturedAt`이 없어 갱신 시각이 "알 수 없음"으로만 뜸 | 구현 때 운영 응답을 먼저 본다. 전부 비면 시안 개념(신뢰성 줄)이 못 드러나므로 이슈에 알린다 |
| "-"와 "모름"이 섞임 | §3-2 표와 §4-3 시험. 스크린샷에 둘이 다 나오는 브랜드를 골라 찍는다 |
| 쿠팡이츠 링크가 `openWithNotice` 없이 열려 안내 없이 감 | 주 버튼과 앱 칸이 `openWithNotice`를 거치게 한다(`CouponCard.jsx:63`과 같음, `offerPrompt`는 생략) |

## 7. 리뷰 포인트

- 오늘 할인 칸 숫자를 오퍼 수가 아니라 **브랜드 수(`N곳`)** 로 센다. 누르면 나오는 목록 길이와 맞추려는 선택. 이슈의 "오늘 할인 수"는 오퍼 수로도 읽힌다. 브랜드 수로 가도 되는가?
- 새로 생김을 "최고 오퍼가 신규인 브랜드"(`updatedOnly` 정의)로 센다. 신규 오퍼가 최고가 아닌 브랜드는 안 센다. 시안에서는 기존 정의를 따라도 되는가?
- "갱신 시각 알 수 없음" 문구가 수집기 말 금지 규칙에 걸리는가? 걸리면 "-"만 쓴다.
- **미확인 가정:** 운영 응답에 `capturedAt`, `isNew`, 브랜드 `links`가 채워져 있다. 구현 첫 단계에서 실제 응답으로 확인한다.
- `main.jsx`가 `setHubLinks`를 SSR 데이터로 부르던 줄은 `DigestShell` 안으로 옮기고 `main.jsx`에서는 그대로 둔다. 이슈의 "main.jsx 한 줄 제외" 기준을 넘지 않는가?

## 변경 이력

- 2026-11-03 구현: 권한자 댓글로 바뀐 설계는 없다(이슈 입력에 댓글 없음). 구현 중 확인한 두 가지를 적는다.
  - `web/scripts/run-node-tests.mjs`가 `src/` 아래 `*.test.js`를 전부 돌려서 `package.json`의 `test` 명령은 고치지 않았다(§3-3, §4-3의 가정과 다름).
  - `main.jsx`는 `App` import를 남기고 `?home=app`이면 옛 홈을 그린다. `App`을 클라이언트 번들에서 빼면 쿠폰 카드 CSS 조각이 안 만들어져 `ssr-template.mjs`가 실패해 `npm run build`가 깨진다. 같은 이유로 SSR 하이드레이션은 `?home=app`일 때만 한다(이슈 결정의 `ssr` 무시 한 줄을 처음부터 적용).
