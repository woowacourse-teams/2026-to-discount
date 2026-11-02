# 236: 홈 리뉴얼 시안 "새로 생김 / 곧 끝남" (new-ending 껍데기)

- 이슈: [#236](https://github.com/woowacourse-teams/2026-to-discount/issues/236) (묶음 이슈 #230)
- 상태: 설계 초안(승인 대기)
- 성격: **버리는 시안.** 병합하지 않는다. PR은 초안으로 두고 프리뷰(`preview/shell-new-ending`)만 본다.
- 범위: `web/src/shells/new-ending/` 새 파일, `web/src/main.jsx` 이 브랜치 한정 수정. 기존 로직 파일은 0줄.

## 1. 개념

오늘 새로 생긴 할인과 곧 끝나는 할인을 가로 두 줄로 놓는다. 첫 화면에서 "오늘 또 뭐 생겼나"에 답하고, 줄마다 카드를 누르면 앱이 열린다.

리뉴얼 목표 대응(우선순위 순):

1. 신뢰성: 머리에 "마지막 확인 시각"을 둔다. 줄 제목 옆에 개수를 둔다. 비는 줄은 이유를 말한다(§4).
2. 핵심 전달: 카드 한 장에 브랜드, 앱, 금액(큰 글씨), 최소주문, 조건 칩을 둔다. 줄이되 숨기지 않는다.
3. 클릭: 카드 전체가 링크다. 스크롤 없이 두 줄 머리와 첫 카드가 보인다.

## 2. 확인한 사실

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| "새로 생김"을 판정하는 기존 함수가 있는가 | 있다. `isUpdated(offer)`는 서버가 이력으로 판정한 `isNew`를 따르고, 칸이 없는 옛 응답만 `firstSeenAt`이 오늘(KST)인지 본다. 뜻은 "오늘 새로 생겼거나 금액이 바뀜" | `web/src/filters.js:59-65` |
| "곧 끝남"을 판정하는 기존 함수가 있는가 | **없다.** `expiresAt`(YYYY-MM-DD, 없으면 null)을 읽는 웹 코드는 구간 칩(`~09.30`)과 공유 만료 판정뿐이다 | `couponModel.js:159,175`, `offerSharing.js:50` |
| 종료일이 지난 오퍼는 오는가 | 안 온다. API가 요청 시점에 한국 날짜 기준으로 뺀다. 종료일 당일은 유효 | `api/docs/decisions/ADR-008` |
| 종료일을 모르는 오퍼가 많은가 | **많았다.** ADR-008 작성 때(2026-08) 원장 138건 중 91건이 종료일 미확인. 지금 수치는 이 설계가 재지 않았다 | ADR-008 |
| 배너 오퍼의 `expiresAt`은 믿을 만한가 | 배너의 `endsAt`을 그대로 쓴다. 둘이 다른 행사에서는 틀린 값이 나간다고 설계에 적혀 있다 | `docs/archive/superpowers/specs/2026-09-22-banner-model-design.md:553` |
| `main.jsx`를 한 줄만 바꾸면 되는가 | **안 된다.** 홈은 서버가 `App` 기준으로 그린 HTML을 보내고 `window.__SSR__`가 있으면 `hydrateRoot`로 잇는다. 다른 트리를 `hydrateRoot`에 물리면 불일치 오류가 난다 | `main.jsx:95,111`, `web/api/ssr.js`, `entry-server.jsx:40` |
| 쿠팡이츠 카드는 `href`만 열면 되는가 | 안 된다. 쿠팡이츠는 안내를 띄운 뒤 이동하는 `openWithNotice`를 거쳐야 한다 | `offerLink.js:106`, `OfferChip.jsx:45` |
| `check-copy.mjs`가 새 폴더를 보는가 | **안 본다.** `src` 바로 아래 `.jsx`만 읽는다 | `web/scripts/check-copy.mjs:9` |
| 새 테스트를 `package.json`에 적어야 하는가 | 안 적어도 된다. `run-node-tests.mjs`가 `src/` 아래를 재귀로 돈다 | `web/scripts/run-node-tests.mjs:13-15` |

## 3. 설계

### 3-1. 파일 (전부 새 파일)

| 파일 | 역할 |
| --- | --- |
| `web/src/shells/new-ending/NewEndingShell.jsx` | 화면. 머리, 두 줄, 카드, 빈 상태, 오류 상태 |
| `web/src/shells/new-ending/data.js` | 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 바꾼다 |
| `web/src/shells/new-ending/data.test.js` | 어댑터 시험 |
| `web/src/shells/new-ending/new-ending.css` | 스타일 하나. 클래스 접두사 `ne-`, 전역 선택자 금지 |

`web/src/main.jsx`만 기존 파일 중 고친다(§3-5).

### 3-2. `data.js`

두 함수로 가른다. 시험은 순수 함수만 돈다.

- `loadNewEnding()`: `fetchBrands()`와 `fetchBanners()`를 부른다. 배너는 `setHubLinks(banners)`에 넘긴다(`offerLink`가 허브 링크 단계에서 쓴다). 실패하면 던진다. 배너 실패는 던지지 않고 빈 배열로 둔다(`App.jsx:282`와 같다). 결과를 `buildNewEnding(brands, new Date())`에 넘겨 돌려준다.
- `buildNewEnding(brands, now)`: 순수 함수. 반환:
  - `fresh`: 새로 생긴 카드 배열
  - `ending`: 곧 끝나는 카드 배열
  - `lastChecked`: 모든 오퍼의 `latestCaptured` 결과, 없으면 null
  - `counts`: `{ offers, fresh, withExpiry, ending }` — 화면의 빈 상태 문구와 PR 확인에 쓴다(§4)

카드 한 장의 모양: `{ key, brand, offer, href, amount, min, chips, note, endsLabel }`.

| 칸 | 어디서 | 계산 여부 |
| --- | --- | --- |
| 줄 안 브랜드 순서 | `sortBrands(brands, { sorts: <기본 정렬> })` 결과를 그대로 편다 | 기존 정렬 재사용 |
| `fresh` 여부 | `isUpdated(offer)` | 기존 |
| `href` | `offerLink(offer, brand.links, brand.name)` | 기존 |
| `amount` | `amountText(offer)` | 기존 |
| `min` | `minLabel(offer.minOrderAmount)`, `null`이면 "최소주문 미확인" | 기존 + 기존 라벨 |
| `chips` | `chipsOf(offer)`에서 `onCard`인 것을 `headOrder`로 | 기존 |
| `note` | `conditionTable(offer).note` (칩으로 올린 조건과 계산식은 이미 빠진다) | 기존 |
| `ending` 여부 | **새로 짜는 유일한 판정.** §3-3 | 새 코드 |

기본 정렬 값은 `defaultFilters()`가 돌려주는 정렬을 그대로 받는다(`filters.js:110`). 구현자가 그 반환 모양을 보고 `sortBrands`에 넘긴다. 정렬 규칙을 새로 쓰지 않는다.

품절 오퍼(`soldOut`)는 두 줄 모두에서 뺀다. 눌러도 못 받는 쿠폰을 첫 화면에 올리지 않기 위함이고, 이 한 줄 조건은 새 판정이 아니라 거름이다. 뺀 개수는 `counts`에 `soldOut`으로 남긴다.

한 오퍼가 새로 생겼고 곧 끝나기도 하면 두 줄 모두에 선다. 중복 제거를 하지 않는다. 줄마다 의미가 다르다.

### 3-3. "곧 끝남" 판정 (새 코드, 이슈의 "계산 로직 금지"에서 벗어나는 자리)

기존 함수가 없어서 한 곳에만 둔다.

- 대상: `offer.expiresAt`이 `YYYY-MM-DD` 모양인 오퍼. null, 빈 값, 모양이 깨진 값은 **대상이 아니다**(ADR-008: 모른다는 것은 끝났다는 것이 아니다). 구간별 `tiers[].expiresAt`은 안 본다(오퍼 대표 종료일만).
- 기준일: 한국 날짜(`now`를 +9시간 밀어 `toISOString().slice(0, 10)`). `filters.js`의 `kstDay`와 같은 식이다. 그 함수는 내보내지 않았고 로직 파일을 고치지 않으니 어댑터에 한 줄 복사한다. 값의 커네선스(같은 식이 두 곳)라 `data.js`에 출처를 주석으로 적는다.
- 창: 오늘부터 `ENDING_WITHIN_DAYS`일 뒤까지, 양끝 포함. 처음 값은 **3**. 상수 하나로 두어 프리뷰에서 바꿔 본다.
- 이미 지난 날짜(`expiresAt < 오늘`)는 뺀다. API가 빼 주지만 화면을 자정 넘어 열어 둔 경우를 막는 방어다.
- 줄 안 순서: 종료일 가까운 순, 같으면 위 §3-2의 브랜드 순서. 문자열 비교로 충분하다(`YYYY-MM-DD`).
- `endsLabel`: 오늘 끝, 내일 끝, 그 밖은 `~MM.DD`. 날짜 표기는 `couponModel.js:175`의 구간 칩과 같은 모양(`~11.05`)으로 맞춘다.

### 3-4. 화면 (360px)

위에서 아래로:

1. **머리** 한 줄: 제목과 "마지막 확인 오늘 14:20". 시각은 `lastChecked`를 한국 시각으로 찍는다(값 표시 서식일 뿐 계산이 아니다). 날짜가 오늘이 아니면 `MM.DD HH:mm`. `lastChecked`가 null이면 이 말을 그리지 않는다. 지어내지 않는다.
2. **새로 생김 줄**: 제목, 개수, 가로 스크롤 카드. 카드 폭 약 150px로 두 장 반이 보여 옆에 더 있음을 알린다.
3. **곧 끝남 줄**: 같은 모양. 카드 위에 `endsLabel`을 강조한다.
4. 바닥: 기존 홈으로 돌아가는 방법은 두지 않는다(시안이라 필요 없음).

카드 한 장(전체가 `<a>`):

- 브랜드 로고(`BrandLogo`, 40px)와 이름 한 줄(`shortBrandName` 사용 가능).
- 금액 큰 글씨, 아래에 최소주문.
- 칩: 채널, 멤버십, 선착순, 첫 주문 등 `chips`. 머리 줄이 넘치면 잘린다(기존 `headOrder`가 앞에 둘 것을 정해 둠).
- 조건 문장 `note`가 있으면 한 줄 말줄임으로 둔다(`title`에 전문). 숨기지 않는다.
- 앱 표식: `PlatformBadge`(`logos.jsx`).
- 눌렀을 때: `OfferChip.jsx:45` 근처의 앵커 속성과 `openWithNotice(e, href)` 호출을 그대로 따른다. 쿠팡이츠 카드 아래 고정 안내 `COUPANGEATS_HINT`도 `OfferChip`/`CouponCard`와 같은 조건으로 둔다. 분석 이벤트(`track`)는 생략한다.

스타일: 컨테이너 쿼리 단위(`cqw`)를 쓰지 않는다. iOS WebKit이 처음 한 번 잘못 배치한 기록이 있다(`main.jsx:114`). 전역 `body`, `html`, `#root` 선택자를 새로 쓰지 않는다(`App.css`는 `main.jsx`가 그대로 불러온다).

### 3-5. `main.jsx` (이 브랜치 한정)

이슈는 "한 줄"이라 했지만 최소 네 곳이다. 이유는 §2의 하이드레이션.

1. `NewEndingShell` import 한 줄을 더한다.
2. `<App initial={ssr} />`를 `<NewEndingShell />`로 바꾼다.
3. `hydrateRoot` 분기를 타지 않게 한다. `if (ssr) { hydrateRoot… }`를 `createRoot` 쪽으로 보낸다. `createRoot(...).render`는 `#root` 안의 서버 HTML을 비우고 새로 그린다. 첫 화면이 JS가 뜰 때까지 옛 홈으로 잠깐 보이는 것은 시안이라 받아들인다.
4. `if (ssr) setHubLinks(ssr.banners)`는 그대로 둔다(무해). 허브 링크는 어댑터도 다시 건다.

`App.jsx`와 다른 컴포넌트는 안 지운다. `entry-server.jsx`와 `web/api/ssr.js`도 안 고친다(서버가 여전히 옛 홈을 그린다).

## 4. 신뢰성: 비는 줄을 조용히 비우지 않는다

AGENTS.md의 "없다/0/통과" 규칙을 이 화면에 적용한다. 두 줄은 이유가 다르게 빈다.

| 줄 | 비는 이유 | 화면 문구 방향 |
| --- | --- | --- |
| 새로 생김 | 오늘 새로 본 오퍼가 없음(정상), 또는 서버가 `isNew`를 안 줌 | `counts.offers > 0`일 때만 "새로 생긴 할인이 아직 없어요". 응답이 비었으면 오류 상태로 간다 |
| 곧 끝남 | 창 안에 끝나는 오퍼가 없음, 또는 **종료일을 아는 오퍼 자체가 적음** | `counts.withExpiry`를 같이 보고, "종료일이 알려진 할인 N개 중 곧 끝나는 것이 없어요"처럼 근거를 붙인다. "곧 끝나는 할인이 없어요"라고 단정하지 않는다 |

- `fetchBrands` 실패나 빈 목록은 두 줄을 빈 채 그리지 않고 "불러오지 못했어요"와 다시 시도 버튼을 낸다.
- 구현자는 결과 댓글에 **운영 API 실측 개수**를 적는다: 전체 오퍼 수, `fresh`, 종료일 아는 오퍼 수, `ending`, 품절로 뺀 수. 이 값이 §2의 "종료일 미확인이 많다"를 이번에 처음 잰다. 곧 끝남 줄이 상시 비어 있다면 이 시안의 절반이 데이터 때문에 서지 않는다는 뜻이고, 그 판단이 이 시안의 가장 값진 결과일 수 있다.

## 5. 시험: `data.test.js`

`node:test`. `buildNewEnding(brands, now)`에 손으로 만든 브랜드를 준다. `now`를 고정한다.

- 분류: `isNew: true` 오퍼는 `fresh`에, 창 안 `expiresAt` 오퍼는 `ending`에. 둘 다면 양쪽에.
- 옛 응답: `isNew` 칸 없이 `firstSeenAt`이 오늘(KST)이면 `fresh`(`isUpdated`가 처리하는지 확인).
- 종료일 없음: `expiresAt`이 null, 빈 문자열, `2026/11/05`, `abc`이면 `ending`에 없고 `withExpiry`에도 안 센다.
- 창 경계(`now`=2026-11-03 KST): `11-03`(오늘), `11-06`(+3)은 안, `11-07`은 밖, `11-02`(지난 날)는 밖.
- 한국 날짜 경계: `now`=`2026-11-02T15:30:00Z`(한국 11-03 00:30)에서 오늘은 11-03이다. UTC 날짜로 재면 틀린다.
- 순서: `ending`이 종료일 가까운 순. 같은 날은 브랜드 순서.
- 품절: `soldOut` 오퍼는 두 줄에 없고 `counts.soldOut`에 센다.
- `href`: 같은 입력에 `offerLink`를 직접 부른 값과 같다(어댑터가 링크를 만들지 않는다는 못).
- `lastChecked`: 오퍼 `capturedAt` 최댓값. 모두 없으면 null.
- 빈 입력: 브랜드 `[]`이면 `counts.offers === 0`이고 두 배열이 비었다(화면이 이것으로 오류 상태를 고른다).

화면(JSX)은 `node --test`가 `.jsx`를 못 읽어 시험하지 않는다. 대신 §7의 스크린샷으로 본다.

## 6. 동반 변경 묶음(`docs/CHANGE-PROPAGATION.md`)

| 묶음 | 해당 | 이번 작업에서 |
| --- | --- | --- |
| 1 확실성 판정 | 읽기만 | 정렬은 `sortBrands`를 그대로 쓰고, "최고" 배지를 이 화면에 그리지 않는다. 판정을 다시 쓰지 않아 묶음이 안 갈라진다 |
| 2~5 배너, 묶음, 최소주문, 알림 | 해당 없음 | 배너는 허브 링크 용도로 읽기만 한다 |
| 6 화면에 나가는 글자 | **해당** | 새 문구가 생긴다(§8 목록). `COPY-STYLE.md`를 따르고, 문구 확정은 개발자에게 묻는다. `check-copy.mjs`가 `shells/`를 안 보므로 사람이 `COPY-STYLE.md`와 대조한다 |
| 7 행동 이벤트 | 해당 없음 | `track`을 안 쓴다. 이 화면의 클릭은 집계되지 않는다 |
| 8 배포 순서 | 해당 없음 | API를 안 만진다. 프리뷰 먼저: `preview/shell-new-ending` push, 병합 안 함 |
| 9 새 파일 | **해당** | `docs/PROJECT-STRUCTURE.md`를 `python scripts/generate_project_structure.py`로 다시 만든다(안 하면 푸시 훅이 막는다). 시험은 `run-node-tests.mjs`가 자동으로 돈다 |

끊기면 무엇이 보이나:

- 종료일을 안 줘서 "곧 끝남"이 빈 채로 그려지면 화면은 멀쩡하고 "끝나는 할인이 없다"고 읽힌다. §4의 근거 문구가 이것을 막는다.
- 배너 오퍼의 `expiresAt`이 행사 종료와 다르면 틀린 "오늘 끝"이 뜬다. 신뢰성이 목표 1번이라 §8 첫 질문으로 올렸다.
- `main.jsx`에서 하이드레이션 분기를 안 풀면 콘솔에 불일치 오류가 나고 화면이 옛 홈과 섞여 보일 수 있다.

## 7. 확인 방법과 완료 조건

1. `cd web && npm test`, `npm run build` 통과.
2. `git diff --stat main -- web/src`에 `web/src/shells/` 밖은 `main.jsx` 하나뿐. `web/src/*.js`는 0줄.
3. 운영 API를 읽는 프리뷰에서 360px 스크린샷: 첫 화면에 머리, 새로 생김 줄, 곧 끝남 줄 머리가 보인다.
4. 카드 하나를 눌러 앱 링크가 열린다. 쿠팡이츠 카드는 안내가 먼저 뜬다.
5. §4의 실측 개수를 결과 댓글에 적는다.
6. 프리뷰: 구현이 끝나면 `preview/shell-new-ending`으로 올린다(`docs/WORKFLOW.md` §3-3). PR은 초안으로 둔다.

## 8. 결정이 필요한 것

- **배너에서 온 오퍼의 종료일을 "곧 끝남"에 넣어도 되는가.** `fromBanner`(`linkSource === 'banner'`)인 오퍼는 `expiresAt`이 배너 `endsAt`이라 틀릴 수 있다. 이 설계는 일단 넣고, 구현자가 실측에서 배너 오퍼 비율을 보고한다. 빼려면 `data.js`의 `ending` 조건에 `linkSource !== 'banner'` 한 줄을 더한다.
- **창을 3일로 해도 되는가.** 근거 데이터가 없다. 실측에서 줄이 비거나 넘치면 상수만 바꾼다.
- **새 문구 확정.** 이 설계의 초안이다. 확정 전까지 시안에서만 쓴다: "새로 생김", "곧 끝남", "마지막 확인 오늘 HH:mm", "오늘 끝", "내일 끝", "새로 생긴 할인이 아직 없어요", "종료일이 알려진 할인 N개 중 곧 끝나는 것이 없어요", "불러오지 못했어요", "다시 시도". "새로 생김"은 금액이 바뀐 오퍼도 포함한다(`isUpdated`의 뜻). 줄 제목이 "금액이 바뀜"을 숨긴다는 점을 확인해야 한다.
- **`main.jsx`를 한 줄이 아니라 네 곳 고쳐도 되는가.** §2, §3-5.
- **품절 오퍼를 줄에서 빼도 되는가.** 가린다는 쪽이 아니라 못 받는 쿠폰을 올리지 않는다는 쪽으로 판단했다.
- 확인하지 않은 것: 현재 운영 API의 `isNew`, `expiresAt`, `capturedAt` 채움 비율, 실기기(iOS 사파리, 카카오톡 인앱)에서의 가로 스크롤 감촉. 구현 단계에서 재고 프리뷰에서 본다.

## 9. 구현 순서

1. `data.js`와 `data.test.js`(시험 먼저, 순수 함수).
2. `NewEndingShell.jsx`와 `new-ending.css`.
3. `main.jsx` 네 곳.
4. `npm test`, `npm run build`, 구조 문서 다시 만들기.
5. 360px 스크린샷과 운영 API 실측 개수를 결과 댓글에. `preview/shell-new-ending` push는 사람 또는 sub 세션.

## 변경 이력

- 2026-11-03 이슈 본문 `## 결정`(권한자, `/approve-design` 전): §8 새 문구는 시안이라 세션이 정한다(머리 제목 "오늘의 할인"을 더함). 최소주문을 모르면 "최소주문 미확인"(§3-2와 같음). `main.jsx`의 SSR 무시 변경 허용(§3-5 승인).
- 2026-11-03 구현: 최소주문이 금액이면 `CouponCard` `MinOrder`와 같은 꼴 "최소주문 N원↑"(`minLabel`은 숫자만 돌려줘 뜻이 안 읽혔다). `main.jsx`에 App 조각을 빌드에 남기는 한 줄(`window.__keepAppChunk`)을 더했다. 홈이 `App`을 안 부르면 쿠폰 카드 CSS 조각이 빠져 `scripts/ssr-template.mjs`가 빌드를 멈춘다.
