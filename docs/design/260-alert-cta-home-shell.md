# 260: 홈 리뉴얼 시안 - 알림으로 다시 오게 (alert-cta)

- 이슈: [#260](https://github.com/woowacourse-teams/2026-to-discount/issues/260) (묶음 #230)
- 성격: 버리는 시안(껍데기). 병합하지 않는다. PR은 초안으로 두고 프리뷰만 본다.
- 만지는 곳: `web/src/shells/alert-cta/` 아래 새 파일, `web/src/main.jsx` 한 줄(필요하면 한 줄 더), `docs/PROJECT-STRUCTURE.md` 재생성.

## 1. 무엇을 보여 주나

재방문율이 1차 목표다. 목록 사이사이와 화면 아래에 '내 브랜드 새 할인 알림 받기' 카드를 눈에 띄게 둔다. 카드를 누르면 기존 알림 설정(`PushNotificationSetting`)이 켜지는 길로 들어간다. 알림 로직은 건드리지 않는다.

리뉴얼 목표 세 개(신뢰성, 핵심 강조, 누를 곳)는 카드 한 장 안에서 이렇게 드러낸다.

| 목표 | 카드에서 |
| --- | --- |
| 1. 신뢰성 | 카드마다 가장 최근 값 시각(`latestCaptured`)을 "n분 전" 꼴로 한 줄. 최소주문을 모르면 "최소주문 미확인" 라벨을 그린다 |
| 2. 핵심 강조 | 브랜드 이름, 큰 금액(`displayBestAmount`), 어느 앱, 조건 칩 순서. 금액이 제일 크다 |
| 3. 누를 곳 | 앱별 행마다 "받으러 가기" 버튼 하나. `offerLink`로 실제 앱 링크를 연다 |

## 2. 화면 구성 (360px, 위에서 아래)

1. 머리: 서비스 이름 한 줄과 가장 최근 값 시각 한 줄.
2. **알림 카드(1번째, 큼)**: 첫 화면에 보인다. 이 시안의 개념.
3. 카테고리 가로 띠: `CATEGORIES`로 거르기만 한다(`applyFilters`의 `categories`).
4. 브랜드 카드 목록. **4장마다** 알림 카드(작은 띠 꼴)를 끼운다.
5. 화면 아래 알림 카드(마지막, 큼). 목록 끝까지 본 사람이 마주친다.

브랜드 카드 안(위에서 아래):

- 이름 + 최고 금액(큰 글씨, `displayBestAmount` 값을 `amountText`로 글자화)
- 앱 행: 배민, 쿠팡이츠 등 `PLATFORMS`(`platforms.js`) 순서대로 한 줄씩. 행 = 앱 이름, 금액, 최소주문, 칩, 버튼.
- 칩: `chipsOf(offer).filter(onCard)`와 `qualifiersOf`가 뽑은 것(첫 주문, 월 1회 등). 줄이되 숨기지 않는다.
- 맨 아래 작은 글씨: 값 시각.

## 3. 데이터 어댑터 `data.js`

계산을 새로 쓰지 않는다. 기존 함수를 부르고 모양만 바꾼다.

| 필요한 값 | 읽는 곳 |
| --- | --- |
| 브랜드와 배너 | `api.js`의 `fetchBrands`, `fetchBanners` |
| 허브 링크 준비 | `offerLink.js`의 `setHubLinks(banners)`를 불러온 직후 한 번 (`main.jsx`가 SSR 데이터로만 불렀기 때문) |
| 목록 거르기, 정렬 | `defaultFilters()`를 `applyFilters(brands, filters)`에 넣는다. 이 함수가 정렬(`sortBrands`)과 신규 앞세우기까지 한다(`filters.js:350-381`). 따로 정렬하지 않는다 |
| 앱별 대표 오퍼 | 브랜드의 오퍼를 `platform`으로 나눈 뒤 `splitOffers(offers, includesFrom(filters)).best[0]` |
| 최고 금액 | `displayBestAmount(brand.offers, includesFrom(filters))` |
| 금액 글자 | `amountText(offer)` |
| 최소주문 | `minLabel(offer.minOrderAmount)`. `null`이면 "최소주문 미확인" 문자열 |
| 칩 | `chipsOf(offer).filter(onCard)` |
| 링크 | `offerLink(offer, brand.links, brand.name)` (`brand.links` 칸 이름은 `App.jsx`/`CouponCard.jsx`가 `offerLink`를 부르는 자리에서 그대로 따라 쓴다) |
| 값 시각 | `latestCaptured(offers)` |

`data.js`가 내보내는 것: `loadHome()`(두 fetch를 부르고 `setHubLinks`까지), `toCards(brands)`(위 표를 한 모양으로 묶는 순수 변환).

- 시각을 "n분 전" 글자로 바꾸는 작은 함수 하나만 `data.js`에 새로 둔다. 구현 전에 `web/src` 안에 이미 있는 시각 글자 함수를 먼저 찾고(`capturedAt`을 쓰는 jsx), 있으면 그것을 쓴다.
- **없음과 모름을 가른다**(이슈 결정). 그 앱에 오퍼가 없으면 행의 금액 칸에 `-`. 오퍼가 있고 최소주문이 `null`이면 "최소주문 미확인". 금액 자체를 모르는 오퍼(`amount == null`)는 `amountText`가 주는 `rawText`를 그대로 쓴다. 기존 카드(`CouponCard.jsx`)가 이 경우 다른 정식 라벨을 쓰면 그것을 따른다.
- 숨긴 브랜드(`hiddenBrands.js`), 필터 시트, 검색은 이 시안에 넣지 않는다.

## 4. 알림 카드가 기존 알림을 여는 방법

`PushNotificationSetting`의 알림 안내 창(`previewPrompt`)은 바깥에서 열 길이 없다. 열리는 경우는 둘뿐이다. 개발 모드 전용 버튼, 그리고 `discount-offer-prompt` 이벤트(링크를 누른 뒤 한 번만, `hasSeenOfferPrompt`가 막는다). 이 파일은 고치지 않으므로 **이미 있는 `discount-push-toggle` 이벤트**를 쓴다.

- 카드 `onClick`에서 `window.dispatchEvent(new Event('discount-push-toggle'))`. `ReportButton.jsx:123`이 같은 이벤트를 쏜다.
- 이 이벤트는 켜짐/꺼짐을 뒤집는다. 켜진 사람이 누르면 꺼진다. 그래서 켜졌으면 카드를 누를 수 없는 "알림 켜짐" 상태로 바꾼다.
  - 켜짐 여부: 이벤트 `discount-push-state`(`PushNotificationSetting.jsx:35`, `detail`이 true/false)를 듣고, 첫 값은 localStorage `discount-push-enabled`를 읽는다(읽기만).
  - 서버 렌더와 맞추려고 첫 렌더는 "꺼짐"으로 그리고 마운트 뒤 effect에서 읽는다.
- 셸 맨 위에 `<PushNotificationSetting toggleSlot={slot} />`를 직접 단다. `App.jsx:574`가 하던 일을 셸이 대신한다. 이 컴포넌트가 없으면 이벤트를 들을 곳이 없다.
  - `slot`은 셸이 만든 빈 `div`. 켜고 끈 결과 말풍선이 거기에 뜬다. 슬롯이 없으면 결과가 화면에 안 보인다.
- 카드를 보이는 조건은 `pushAvailability() === 'ready'`(마운트 뒤 effect에서). `unsupported`는 `PushNotificationSetting`도 아무것도 안 그린다. `denied`와 `ios-install`은 토글로는 성공할 수 없고(안내 창은 위 이유로 못 연다) 눌러도 실패 말풍선만 뜬다. 이 시안에서는 이 둘도 카드를 숨긴다.
- 분석 이벤트(`track`)는 생략한다. `PushNotificationSetting`이 `source: 'report_sheet'`로 이미 켜기 이벤트를 쏘므로 시안의 켜기가 제보 시트 수치에 섞인다. 병합하지 않는 시안이라 두고, 프리뷰는 `?dev=1` 트래픽으로 본다.

## 5. 파일

새 파일(전부 `web/src/shells/alert-cta/`):

| 파일 | 역할 |
| --- | --- |
| `AlertCtaShell.jsx` | 화면 전체. 상태는 `cards`, `enabled`, `available`, `category` 정도 |
| `data.js` | 3절 어댑터 |
| `alert-cta.css` | 이 시안 CSS 하나. 클래스 앞에 `ac-`를 붙여 기존 CSS와 겹치지 않게 한다 |

바뀌는 기존 파일:

- `web/src/main.jsx`: `import App from './App.jsx'`를 `import AlertCtaShell from './shells/alert-cta/AlertCtaShell.jsx'`로, `<App initial={ssr} />`를 `<AlertCtaShell />`로. `import './App.css'`는 둘 다 쓰므로 그대로 둔다(알림 안내 창 스타일이 `App.css`/`styles/`에 있다).
- 하이드레이션 불일치가 프리뷰에서 보이면(서버가 `App` 모양 HTML을 보내므로 날 가능성이 높다) `const ssr = window.__SSR__`를 `const ssr = null`로 바꾼다. 한 줄 더. PR 본문에 적는다.
- `docs/PROJECT-STRUCTURE.md`: 커밋 전 `python scripts/generate_project_structure.py`로 다시 만든다(shells 폴더 때문에 구조 검사가 깨진다).

`web/src/shells/alert-cta/`에는 `*.test.js`를 새로 만들지 않는다(만들면 `web/package.json`의 `test` 명령에 넣어야 한다). 병합하지 않는 시안이라 기존 테스트가 그대로 통과하는지만 본다.

## 6. 변경 전파 점검 (`docs/CHANGE-PROPAGATION.md`)

- 1번 확실성: 판정을 다시 짜지 않고 `applyFilters`, `splitOffers`, `displayBestAmount`를 그대로 불러서 서버 정렬과 어긋나지 않는다. `certainty`가 안 오는 옛 응답 문제(8번)도 기존 함수가 처리한다.
- 4번 최소주문 출처, 6번 문구: 최소주문은 `minLabel`이 `null`이면 기존 정식 라벨을 그린다. 새 문구는 이슈 결정에 따라 시안 한정으로 세션이 정하되(알림 카드 제목, "받으러 가기", "n분 전"), 수집기 말(확인, 미확인, 판독, 관측)은 새로 만들지 않는다. "최소주문 미확인"은 기존 라벨이라 예외다.
- 7번 행동 이벤트: `track`을 새로 쏘지 않으므로 `ALLOWED_EVENTS`와 어긋날 일이 없다.
- 8번 배포 순서: API 변경이 없고 병합도 하지 않는다. 프리뷰만 본다.
- 9번 새 파일: 구조 문서 재생성은 5절에 넣었다. 새 테스트 파일은 만들지 않는다.
- 나머지 묶음(2, 3, 5번): 배너와 알림 서버 쪽을 안 건드린다. 알림 카드는 클라이언트 이벤트만 쏜다.

## 7. 완료 조건 확인

- 360px 첫 화면에 알림 카드와 첫 브랜드 카드 윗부분이 보인다(스크린샷).
- 운영 API 데이터로 그려지고, 앱 행의 버튼을 누르면 앱 링크가 열린다.
- `git diff --stat main -- web/src/*.js`에 shells 밖 변경 없음(`main.jsx` 제외). `.jsx`는 `main.jsx`만.
- `npm test`와 `npm run build` 통과.
- 푸시 지원 브라우저에서 알림 카드를 누르면 권한 요청이 뜨고, 켠 뒤 카드가 "알림 켜짐"으로 바뀌어 다시 눌러도 꺼지지 않는다.
- 프리뷰: 구현 뒤 `preview/shell-alert-cta`로 올린다(사람 또는 sub 세션, `docs/WORKFLOW.md` §3-3). 주소는 `https://beggars-git-preview-shell-alert-cta-nn98s-projects.vercel.app`.

## 8. 대안과 버린 이유

- `PushNotificationSetting`에 "안내 창 열기" 이벤트를 더한다: 깔끔하지만 기존 로직 파일 diff 0줄 조건에 어긋난다. 이 시안이 좋게 평가되면 그때 별도 이슈로 한다.
- `discount-offer-prompt` 이벤트로 안내 창을 연다: 안내 창이 열리지만 사람당 한 번만 뜬다(`hasSeenOfferPrompt`). 두 번째 방문부터 카드가 죽는다.
- 알림 상태를 직접 구독 조회(`currentSubscription`)로 읽는다: 정확하지만 이벤트와 저장값을 읽는 것보다 코드가 늘고 `PushNotificationSetting`과 중복된다.

## 9. 열린 질문

- iOS 사파리(홈 화면에 추가 전)와 권한을 거부한 사람은 카드가 숨겨져 이 시안의 개념이 안 보인다. 한국 모바일 비중이 큰 쪽이라 프리뷰 평가에서 같이 봐야 한다. 안내 창 열기 이벤트를 더하면 풀리지만 4절 때문에 이번에는 안 한다.
