# 271: 홈 리뉴얼 시안 "다시 오게 묶음" (revisit-pack)

- 이슈: [#271](https://github.com/woowacourse-teams/2026-to-discount/issues/271), 묶음 이슈 #230
- 상태: 설계 초안(승인 대기)
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 프리뷰만 본다.
- 범위: `web/src/shells/revisit-pack/` 새 파일, `web/src/main.jsx` 한 줄(필요하면 둘), `docs/PROJECT-STRUCTURE.md` 재생성

## 1. 목표와 개념

리뉴얼 목표(사용자 2026-11-03, 우선순위 순): ① 값이 언제 어디서 확인됐는지 믿을 수 있게, ② 얼마·어느 앱·조건을 빠르게 강조, ③ 누를 곳을 빨리 보여 클릭과 재방문을 올린다.

시안 개념: 시안 my-brands(#240), alert-cta(#260), new-ending(#236)을 합친 재방문 홈. 위에서 아래로 네 구역이다.

| 순서 | 구역 | 내용 | 비는 경우 |
| --- | --- | --- | --- |
| 1 | 머리 | 서비스 이름, 마지막 갱신 시각(목표 1) | 시각을 못 구하면 시각 줄을 그리지 않는다 |
| 2 | 내 브랜드 줄 | 저장한 브랜드의 최고 할인 가로 줄 | 저장한 브랜드가 없으면 `popularToday` 상위 브랜드로 채운다(처음 온 사람) |
| 3 | 어제 이후 새로 생긴 것 | 새 오퍼가 있는 브랜드 카드 | 없으면 구역을 그리지 않는다 |
| 4 | 전체 목록 + 끝의 알림 받기 카드 | 기본 정렬 카드 목록, 맨 끝에 알림 카드 | 알림 카드는 항상 |

360px 첫 화면에 2번 구역과 3번 구역의 첫 카드가 들어와야 한다(완료 조건 1).

## 2. 고치지 않는 것, 새로 만드는 것

기존 로직 파일은 읽기만 한다. `git diff --stat main -- web/src/*.js`에 shells 밖 변경이 없어야 한다(`main.jsx` 제외).

새 파일(전부 `web/src/shells/revisit-pack/`):

- `RevisitPackShell.jsx`: 화면 조립. 데이터 요청과 상태.
- `data.js`: 어댑터. 기존 모듈 호출을 껍데기용 모양으로 바꾼다.
- `Cards.jsx`: 내 브랜드 칩, 새 오퍼 카드, 목록 카드, 알림 카드(파일 하나로 시작하고 길어지면 나눈다).
- `revisit-pack.css`: CSS 파일 하나. 새 npm 의존성 없음.
- `data.test.js`: 어댑터 테스트(§5). `web/scripts/run-node-tests.mjs`가 `src/` 아래 `*.test.js`를 재귀로 찾으므로 `package.json`은 고치지 않는다. 이슈 지시("새 파일은 shells 아래에만")와도 맞다.

## 3. 데이터 어댑터 (`data.js`)

계산은 전부 기존 함수가 한다. 어댑터는 이름을 바꾸고 모양을 묶을 뿐이다.

| 껍데기가 필요한 값 | 읽는 곳 | 비고 |
| --- | --- | --- |
| 브랜드와 배너 | `api.js` `fetchBrands`, `fetchBanners` | 응답 순서는 서버 정렬. 실패하면 오류 문구 한 줄 |
| 허브 링크 | `offerLink.js` `setHubLinks(banners)` | `main.jsx`는 `ssr`이 있을 때만 부른다. 껍데기가 직접 받은 배너로 부른다 |
| 전체 목록 순서 | `filters.js` `applyFilters(brands, defaultFilters())` | 기본 정렬과 신규 앞(기본 정렬일 때 신규 최고 오퍼 브랜드를 위로)이 그대로 따라온다 |
| 브랜드 대표 금액 | `displayBestAmount`, `couponModel.splitOffers` | 4,999원 정렬 천장값을 화면에 찍지 않게 `displayBestAmount`만 쓴다 |
| 금액 문구 | `couponModel.amountText` | 묶음 행사는 원문 |
| 칩 | `couponModel.chipsOf`, `qualifiersOf`, `channelOf` | `onCard`로 카드용만 거른다 |
| 최소주문 | `couponModel.minLabel` | §4 |
| 새 오퍼 | `couponModel.isUpdated` (서버 `isNew`가 있으면 그것을 따른다) | |
| 마지막 갱신 | `filters.js` `latestCaptured(offers)` | 브랜드별, 전체는 브랜드별 값의 최대 |
| 인기 추천 | `popularStrip.js` `popularToday(brands)` | 상위 5, 세 곳이 안 되면 `STRIP_MIN` 규칙대로 비어 온다 |
| 링크 | `offerLink.js` `offerLink(offer, brand.links, brand.name)` | `CouponCard.jsx:56`과 같은 호출 |

내 브랜드 저장은 데이터 계산이 아니라 껍데기 상태다. `localStorage` 키 `dk_rp_brands`(이름 배열, 새 키)를 `RevisitPackShell.jsx`가 읽고 쓴다. 저장소가 막혀도 멈추지 않게 `try`로 감싼다(`readMinAmount`와 같은 방식). 서버 저장과 로그인은 이 시안에서 하지 않는다.

## 4. 없음, 모름, 조건 표시 규칙

이슈 결정에 따라 셋을 다르게 그린다. 이 규칙이 목표 1(신뢰성)의 핵심이다.

| 상태 | 표시 | 근거 |
| --- | --- | --- |
| 그 앱에 오퍼가 없음 | `-` | 앱별 칸(배달의민족, 쿠팡이츠, 땡겨요, 요기요)을 고정으로 두고 오퍼 없는 칸에 |
| 오퍼는 있는데 최소주문을 모름(`minLabel`이 null) | `최소주문 미확인` (칸을 비우지 않는다) | 기존 정식 라벨. `conditionTable`이 쓰는 문구와 같다 |
| 최소주문 0 | `최소주문 없음` | `minLabel(0)` |
| 최소주문 있음 | `12,000원↑` | `minLabel` 결과에 `원↑`을 붙인다. `conditionTable`의 `won(min)↑`과 같은 꼴 |
| 금액을 모름 | `amountText`의 원문(`rawText`) | 숫자를 지어내지 않는다 |
| 첫 주문, 월 1회, 채널, 멤버십 | `chipsOf` 칩을 줄이되 숨기지 않는다 | 카드 머리에 최대 3칩, 넘치면 `+N`으로 접고 눌러서 펼친다 |

"줄이되 숨기지 않는다"의 구현: 칩은 `headOrder`로 한정된 채널, 멤버십, 한정 순으로 앞에 두고, 접힌 칩은 `+N` 버튼 뒤에 둔다. 최소주문은 어떤 경우에도 접지 않는다.

신뢰성 표시(목표 1):

- 머리에 전체 마지막 갱신 시각, 카드마다 그 브랜드의 마지막 갱신 시각을 한 줄로 단다. 시각 문구는 `latestCaptured` 값을 `N분 전`, `N시간 전`, `어제`로 바꾸는 서식 함수 하나만 어댑터에 둔다(서식이지 판정이 아니다).
- 값이 없으면 시각을 지어 쓰지 않고 줄을 뺀다.
- 24시간이 넘은 갱신은 색을 바꿔 눈에 띄게 한다. 이 임계값은 시안용 상수 하나로 `data.js` 맨 위에 두고, 판정이 아닌 표시 강조에만 쓴다.

## 5. 문구

이슈 결정: 시안용 임시 문구는 세션이 정해도 된다. 수집기 말(확인, 미확인, 판독, 관측, 대조, 수집, 추정)을 **새로** 만들지 않는다. `최소주문 미확인`은 기존 정식 라벨이라 예외다.

임시 문구(병합하지 않으므로 `docs/COPY-STYLE.md` §3의 개발자 확인은 병합 단계로 미룬다. 좋은 부분을 모을 때 다시 묻는다):

| 자리 | 문구 |
| --- | --- |
| 내 브랜드 구역 제목 | `내 브랜드` |
| 내 브랜드가 비어 인기로 채울 때 제목 | `요즘 많이 보는 브랜드` |
| 새 오퍼 구역 제목 | `어제 이후 새로 생긴 것` |
| 브랜드 저장 버튼 | `내 브랜드에 담기` / `담음` |
| 알림 카드 | `새 쿠폰이 뜨면 알려드려요` + 버튼 `알림 받기` |
| 갱신 시각 | `N분 전`, `N시간 전`, `어제` |

CSS 변경은 모두 `revisit-pack.css`에 둔다. 클래스 이름은 `rp-` 접두어로 기존 `App.css`와 겹치지 않게 한다.

## 6. 클릭과 링크

- 카드의 앱별 칸과 대표 금액은 `<a href={offerLink(...)} target="_blank" rel="noopener">`로 실제 앱 링크를 연다.
- 쿠팡이츠는 `offerLink`가 허브 링크나 공유 링크를 돌려준다. 앱이 안 열릴 때 4초 뒤 공유 링크로 넘기는 `openWithNotice`는 쓰지 않아도 되는 시안이므로 일반 링크로 둔다(이슈: 분석 이벤트 생략 가능).
- 분석 이벤트(`track`)는 보내지 않는다. 시안 클릭이 운영 집계(`docs/CHANGE-PROPAGATION.md` 7번 묶음)에 섞이지 않게 하는 장점도 있다. 이벤트를 새로 만들지 않으므로 `ALLOWED_EVENTS` 대조도 필요 없다.

## 7. main.jsx 변경

기존 `<App initial={ssr} />` 한 줄을 `<RevisitPackShell />`로 바꾼다. 이 브랜치 한정이다. `App.jsx`와 다른 컴포넌트는 지우지 않는다.

SSR 하이드레이션: 홈은 서버가 `App`을 그려 HTML을 보내고(`web/api/ssr.js`) 브라우저가 `hydrateRoot`로 이어받는다. 껍데기를 하이드레이션하면 서버 HTML(App)과 달라 불일치 경고나 깜박임이 난다. 프리뷰에서 보이면 이슈 결정대로 `const ssr = window.__SSR__`를 `const ssr = null`로 바꾸는 한 줄을 더 바꾼다. 이 경우 `createRoot` 길을 타서 껍데기가 새로 그려진다. 둘째 줄을 바꿨으면 PR 본문에 적는다.

## 8. 묶음 영향 점검 (`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 닿는가 | 이유 |
| --- | --- | --- |
| 1 확실성 | 읽기만 | 판정은 `filters.js`와 `displayBestAmount`가 한다. 껍데기가 최고 금액을 직접 고르지 않는다. 이 규칙을 어기면 특정메뉴 쿠폰이 4,999원처럼 찍힌다 |
| 2·3 배너 모양, 묶음 | 허브 링크 용도로만 | 배너를 그리지 않는다. `setHubLinks`만 부른다 |
| 4 최소주문 | 읽기만 | `minLabel`이 null이면 `최소주문 미확인`으로 그린다. 틀린 문턱을 짓지 않는다 |
| 6 화면에 나가는 글자 | **닿는다** | §5. 시안 임시 문구. 병합하면 개발자 확인이 필요하다 |
| 7 행동 이벤트 | 안 닿는다 | `track`을 부르지 않는다 |
| 8 배포 순서 | 안 닿는다 | 프리뷰만. API는 안 바꾼다 |
| 9 새 파일 | **닿는다** | `PROJECT-STRUCTURE.md` 재생성. 테스트는 재귀 탐색이라 `package.json` 불필요 |

## 9. 검증 계획

테스트 (`data.test.js`, 화면 없이 어댑터만):

- Given 오퍼 없는 앱 / When 앱별 칸을 만들 때 / Then 그 칸은 `-`.
- Given `minOrderAmount`가 null인 오퍼 / When 칸을 만들 때 / Then `최소주문 미확인`.
- Given `minOrderAmount`가 0 / Then `최소주문 없음`.
- Given 특정메뉴 쿠폰뿐인 브랜드 / When 대표 금액을 만들 때 / Then 4,999가 나오지 않는다.
- Given 저장한 브랜드 이름이 응답에 없음 / Then 그 이름은 건너뛴다. 저장소가 비면 `popularToday` 결과로 채운다.
- Given `isNew`가 true인 오퍼가 하나도 없음 / Then 새 오퍼 구역은 비어 있다.

그 밖의 확인:

1. `npm test`와 `npm run build` 통과.
2. 실제 운영 API 데이터로 그려지는지: 프리뷰에서 구역 네 개가 보이는지.
3. 360px 스크린샷(`web/scripts/dev/banner-shot.mjs`)을 결과 댓글에 단다. 첫 화면에 내 브랜드 줄과 새 오퍼 첫 카드가 드러나야 한다.
4. 카드를 눌러 앱 링크가 열린다. 쿠팡이츠 카드는 허브 링크가 열리는지 따로 본다.
5. `git diff --stat main -- web/src/*.js`에 shells 밖 변경이 없고 `main.jsx`만 있다.
6. 커밋 전에 `python scripts/generate_project_structure.py`를 돌려 `docs/PROJECT-STRUCTURE.md`를 갱신한다.

## 10. 열린 점과 위험

- **알림 카드가 실제로 구독을 시작하는가.** 기존 `PushNotificationSetting.jsx`는 `toggleSlot`을 받고 `App.jsx`에서 마운트한다. 마운트 방식이 `main.jsx`를 `App` 없이 띄우면 맞는지는 구현 때 읽어 정한다. 맞으면 카드 버튼에서 그 컴포넌트를 재사용하고, 안 맞으면 카드는 모양만 보이고 구독을 시작하지 않는다고 PR 본문에 적는다. 새 구독 로직은 짜지 않는다(이슈: 로직 새로 짜지 않음).
- **내 브랜드가 localStorage뿐이라** 다른 기기와 맞지 않고, 지우면 사라진다. 시안 비교에는 충분하다. 좋은 부분을 모을 때 서버 저장을 따로 설계한다.
- **새 오퍼 판정은 서버 `isNew`** 를 따른다. 옛 응답에는 `firstSeenAt` 오늘 규칙이 쓰여 "어제 이후"보다 좁을 수 있다(오늘만). 문구가 실제보다 넓게 말하지 않는지는 프리뷰에서 본다.
- **프리뷰 push는 이 세션이 하지 않는다.** 구현 뒤 사람 또는 sub 세션이 `preview/shell-revisit-pack`를 올린다(`docs/WORKFLOW.md` §3-3). 주소는 `https://beggars-git-preview-shell-revisit-pack-nn98s-projects.vercel.app`.
