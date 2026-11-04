# 설계: 브랜드 카드 좋아요/싫어요

이슈: [#309](https://github.com/woowacourse-teams/2026-to-discount/issues/309)
상태: 2026-11-04 설계 초안. 승인 전.

## 0. 결론

- 카드 왼쪽 아래, "자세히 보기"와 같은 줄에 엄지 위·아래 버튼 두 개를 둔다. 다시 누르면 취소, 반대쪽을 누르면 바뀐다.
- **새 API를 만들지 않는다.** 반응은 기존 이벤트 경로(`POST /api/events`)로 `brand_reaction` 한 줄씩 원장(events.jsonl)에 쌓는다. 화면의 눌린 상태는 브라우저 `localStorage`가 들고 있다.
- 최신값 접기(방문자×브랜드마다 마지막 반응)는 서버가 하지 않고 분석하는 쪽이 한다. 서버가 접은 값을 쓸 곳(조회 API, 공개 집계, 정렬)이 이번 범위에 없다.
- 싫어요와 숨기기는 따로 둔다. 싫어요를 눌러도 카드는 그대로 남는다.
- 공개 응답에 좋아요·싫어요 수를 싣지 않는다. 정렬 반영도 안 한다. 둘 중 하나를 하려면 따로 이슈를 연다(§7 뒤집을 조건).

API 응답 형태는 바뀌지 않는다. 고정하는 계약은 이벤트 한 줄의 모양(§3)이다. API 구현 → 웹 구현 순서로 돌린다(API가 먼저 받지 않으면 웹이 쏜 반응이 조용히 버려진다, 변경 전파 7번·8번).

## 1. 화면

### 자리

지금 카드(촘촘한 안, `cc--compact`, 운영 기본) 5행은 `.cc-hint`("자세히 보기")가 오른쪽 끝(`justify-self: end`, 폭 약 29%)만 차지하고 왼쪽이 비어 있다. 그 왼쪽 빈자리에 둔다.

```
┌──────────────────────────────┐
│ [로고]  브랜드명  배지  [공유]│
│ ┌──────────────────────────┐ │
│ │        쿠폰               │ │
│ └──────────────────────────┘ │
│  배민 3,000원  요기요 2,000원 │
│ [👍] [👎]          [자세히 ▾]│
└──────────────────────────────┘
```

- 마크업: `CouponCard.jsx`의 `.cc-hint` 버튼 바로 뒤에 `<div className="cc-react" role="group">` 하나, 안에 `<button type="button" aria-pressed>` 둘.
- CSS(`web/src/styles/coupon-card.css`): `.cc > .cc-react { grid-row: 5; grid-column: 1; justify-self: start; align-self: end; }`. 버튼 하나는 40×34px(자세히 보기 높이 34px와 맞춤), 두 버튼 사이 4px. `margin-inline-start: var(--pad)`.
- 360px 기준 5행 폭은 약 330px, 자세히 보기는 약 100px, 반응 버튼 둘은 84px라 사이에 140px 넘게 남는다. 겹치지 않는다. 공유 버튼(`.cc-share`)은 오른쪽 위 절대 위치라 5행과 만나지 않는다.
- 자세히 보기가 없는 카드(`canExpand`가 거짓)에도 반응 버튼은 나온다. 5행은 반응 버튼만으로 선다.
- `cc--bare` 카드(묶음 행사만 있고 펼칠 것이 없는 카드)는 행 높이를 `auto`로 풀기 때문에 반응 버튼이 쿠폰 바로 아래에 붙는다. 그대로 둔다.
- 펼친 카드(`cc--open`)에서 자세히 보기는 사라지지만(`.cc--open .cc-hint` 숨김) 반응 버튼은 남긴다. 펼친 영역(`cc-x--rest`, 4~5행)과 겹치므로 펼친 동안은 `.cc--open .cc-react`도 같은 방식으로 숨긴다. 숨긴 동안 `visibility: hidden`이라 포커스도 안 간다.
- 하단 시트(자세히 보기 시트)에는 이번에 두지 않는다. 숨기기 버튼만 시트 맨 아래에 그대로 있다.

### 카드 클릭과 분리

`onCardClick`은 `a, .cc-hide, …`에 닿은 클릭만 시트를 안 연다. 반응 버튼을 누르면 시트가 함께 열리는 사고가 난다. `closest()` 선택자에 `.cc-react`를 더한다(`CouponCard.jsx` `onCardClick` 첫 줄).

### 눌린 상태

- 안 눌림: 테두리만 있는 엄지 아이콘, `var(--text-muted)`.
- 눌림: 채운 엄지 아이콘, `var(--text)`. 모양(테두리/채움)으로 가르고 색에만 기대지 않는다. `aria-pressed="true"`.
- 아이콘은 인라인 SVG(공유 버튼처럼). 이미지 파일을 새로 두지 않는다.
- 상태 전이(§4의 `nextReaction`):

| 지금 | 누른 것 | 다음 |
| --- | --- | --- |
| none | like | like |
| none | dislike | dislike |
| like | like | none (취소) |
| like | dislike | dislike (바뀜) |
| dislike | dislike | none (취소) |
| dislike | like | like (바뀜) |

### 숨기기와의 관계

따로 둔다. 싫어요는 숨기기를 대신하지 않고, 숨기기도 싫어요를 남기지 않는다.

- 숨기기는 "내 목록에서 치운다"는 표시 설정이고 되살리기 규칙(`NEVER`, `WHEN_BIGGER`)까지 있다. 싫어요는 "이 브랜드 할인이 별로다"는 신호다. 숨기기에 싫어요를 묶으면 싫어요 한 번에 카드가 사라져, 눈팅형 방문자가 가볍게 누를 버튼이 무거워진다.
- 분석은 `brand_hide`와 `brand_reaction`을 visitorId·브랜드로 맞대어 볼 수 있다. 둘을 합칠 필요가 생기면 그때 합친다.

### 문구

버튼에 글자는 없다. 화면 읽기용 `aria-label`만 새 문구다. `docs/COPY-STYLE.md` §3에 따라 세션이 정하지 않는다. 후보는 이슈 제목대로 `좋아요`, `싫어요`이고 묶음 `aria-label`은 `${brand.name} 반응`이다. **개발자 답을 받기 전에는 웹 구현자가 후보로 넣고 PR에 묻는다**(열린 질문 1).

## 2. 저장과 API

### 서버 정본이 필요한가: 아니다

- visitorId는 브라우저가 만든 난수로 `localStorage`에 있다(`web/src/analytics.js` 머리 주석). 반응도 `localStorage`에 둔다.
- 서버 정본이 해 주는 일은 "브라우저를 지워도 다른 기기에서도 같은 반응"인데, 브라우저를 지우면 visitorId도 같이 사라지고 다른 기기는 visitorId가 다르다. 서버가 들고 있어도 그 사람을 다시 찾을 열쇠가 없다.
- 그래서 `GET /api/reactions?visitorId=`는 되찾아 주는 경우가 사실상 없다. 만들지 않는다.

### 전용 쓰기 API가 필요한가: 아니다

설문 응답(`survey_answer`)은 `SurveyService`가 원장에 직접 적는다. 이유는 보상이다. `/api/events`는 인증이 없어 위조하면 응답 수와 코드 발급 수가 어긋난다(`EventController` 주석). 반응에는 보상이 없다. 위조로 잃는 것은 집계 품질뿐이고, 그 위험은 숨기기(`brand_hide`)와 같다. 숨기기도 `/api/events`로 쌓는다.

이슈 후보였던 `POST /api/brands/{name}/reaction`은 쓰지 않는다. 브랜드 이름이 경로에 들어가면 한글과 특수문자 인코딩을 nginx와 Spring 양쪽에서 다시 맞춰야 하는 것도 덜어진다.

### 화면이 서버를 기다리지 않는다

누르면 바로 `localStorage`를 바꾸고 화면을 그린 뒤 `track()`을 쏜다. 전송이 실패해도 화면을 되돌리지 않는다. `track()`은 배치·비콘 경로라 실패를 화면에 알릴 길이 없고, 반응 하나를 잃는 손해가 되돌려 헷갈리게 하는 손해보다 작다. 이 손실은 조용하다. §5 계측에서 "보낸 수"를 따로 못 세는 한계로 적는다.

## 3. 스키마

### 이벤트 한 줄

원장 `events.jsonl`에 기존 `VisitEvent` 모양 그대로 한 줄. 새 칸은 없고 `event`와 `props`만 정해진다.

```json
{"ts":"…","event":"brand_reaction","visitorId":"…","sessionId":"…",
 "props":{"brand":"교촌치킨","reaction":"like","prev":"none","position":"3", "…공통 맥락": "…"},
 "ipHash":"…","dev":null,"eventId":"…","bot":null}
```

| props 키 | 값 | 뜻 |
| --- | --- | --- |
| `brand` | API가 내려 준 `brand.name`(대표명) | 어느 브랜드 |
| `reaction` | `like` \| `dislike` \| `none` | 누른 뒤 상태. `none`은 취소 |
| `prev` | `like` \| `dislike` \| `none` | 누르기 전 상태 |
| `position` | 카드 순번 문자열(`brandImpressionProps`처럼 `String(position)`) | 목록 몇 번째에서 눌렀나 |

공통 맥락(필터, A/B 갈래, `entryFrom`)은 `track()`이 늘 붙이는 그대로다. 지금 `MAX_PROPS`(44) 안에 들어간다.

### 별도 파일·테이블이 아니라 원장인 이유

- 원장은 이미 이어 쓰기 잠금(ADR-013), 이어 읽기(ADR-011), PostHog 전달, 봇·개발 트래픽 표시를 다 갖고 있다. 새 파일은 이 넷을 다시 만들어야 한다.
- 지금 읽는 쪽은 분석뿐이다. 분석은 원장을 이미 읽는다.

### 최신값 접기

접는 규칙 하나를 여기서 정해 두고, 이번에는 분석 쪽만 이 규칙을 쓴다.

1. `dev`가 참인 줄, `bot`이 있는 줄은 뺀다(`SurveyEligibility`, `PopularityIndex`와 같은 규칙).
2. `brand`를 `brands.yml` 별칭으로 대표명에 접는다(아래).
3. (visitorId, 대표명)마다 `ts`가 가장 늦은 줄의 `reaction` 하나만 남긴다. `none`이면 반응 없음.
4. `prev`는 세는 데 쓰지 않는다. 브라우저가 밝힌 값이라 믿지 않는다. 바꿈과 취소가 얼마나 나는지 볼 때만 쓴다.

서버가 접는 클래스(`SurveyEligibility`처럼 `EventLogSnapshot`을 쓰는 것)는 조회 API나 공개 집계가 생길 때 만든다. 지금 만들면 기동 때 원장을 한 번 더 훑는 비용만 늘고 쓰는 곳이 없다.

### 브랜드 이름 정규화와 대표명 변경

- 웹은 카드의 `brand.name`을 그대로 싣는다. API가 내려 주는 이름은 이미 `BrandCatalog.canonical()`을 거친 대표명이다. 웹에서 따로 정규화하지 않는다.
- 대표명이 바뀌면 옛 대표명을 `brands.yml`의 그 브랜드 `aliases`에 넣는다(이미 지키는 규칙: 별칭은 한 대표명에만 걸린다, `BrandCatalog.putAlias`). 그러면 옛 이름으로 쌓인 줄도 접기 2단계에서 새 대표명으로 모인다.
- 브라우저 쪽: `localStorage`는 이름을 열쇠로 든다. 대표명이 바뀐 날 그 카드는 반응이 비어 보인다. 막으려고 `reactionOf(map, brand)`는 `brand.name`으로 못 찾으면 `brand.searchAliases`로 한 번 더 찾는다. 찾은 값으로 다시 누르면 새 이름으로 적고 옛 열쇠를 지운다.
  - 한계: 옛 대표명이 `searchAliases`에 없고 `aliases`에만 있으면 못 찾는다. `aliases`는 API 응답에 안 나간다(`BrandControllerTest.brandResponseKeepsFlatContract`). 대표명 바꿀 일이 드물어 이 한계는 받아들인다.

## 4. 바꿀 파일

### API (`api/`)

| 파일 | 바꿀 것 |
| --- | --- |
| `api/src/main/java/com/discounttracker/analytics/EventController.java` | `ALLOWED_EVENTS`에 `brand_reaction`을 주석과 함께 더한다(날짜 2026-11-04, `CouponCard.jsx`). |
| 같은 파일 | `brand_reaction`만 값 검사: `props.reaction`과 `props.prev`가 `like`/`dislike`/`none` 중 하나가 아니거나, `props.brand`가 비었거나, `reaction`과 `prev`가 같으면 그 이벤트를 버린다(`accepted`에 안 셈). 상수 `REACTIONS = Set.of("like", "dislike", "none")`. 다른 이벤트는 지금처럼 이름만 본다. |
| `api/src/test/java/com/discounttracker/analytics/EventControllerTest.java` | §6의 API 시험. |

PostHog 전달(`PostHogEventMapper`)은 고치지 않는다. `brand_reaction`에 자유 입력이 없어 걸러 낼 칸이 없다.

### 웹 (`web/`)

| 파일 | 바꿀 것 |
| --- | --- |
| `web/src/brandReactions.js` (새 파일) | 열쇠 `dk_brand_reactions`, 값 `{ [브랜드]: 'like' \| 'dislike' }`. `readReactions(storage)`, `reactionOf(map, brand)`(이름 → `searchAliases` 순), `nextReaction(current, pressed)`(§1 표), `setReaction(map, brand, reaction, storage)`(`none`이면 지움, 별칭 열쇠도 지움). 저장소가 막히거나 값이 깨지면 빈 목록(`hiddenBrands.js`와 같은 방식). |
| `web/src/brandReactions.test.js` (새 파일) | §6의 웹 시험. `scripts/run-node-tests.mjs`가 `src/**/*.test.js`를 다 돌아 `package.json`을 고칠 필요는 없다. |
| `web/src/App.jsx` | `reactions` 상태. 첫 렌더는 빈 값(서버 렌더와 같게), 마운트 뒤 `useEffect`에서 `readReactions()`로 채운다. `onReact(brand, pressed, position)`을 `useCallback`으로 고정하고 그 안에서 `nextReaction` → `setReaction` → `track('brand_reaction', { brand: brand.name, reaction, prev, position: String(position) })`. 카드에는 그 카드의 값 하나(`reaction` 문자열)와 `onReact`만 넘긴다(카드 `memo`가 깨지지 않게). |
| `web/src/CouponCard.jsx` | §1 마크업, `onCardClick` 선택자에 `.cc-react` 추가. |
| `web/src/styles/coupon-card.css` | §1 자리와 눌린 상태, `.cc--open .cc-react` 숨김, `prefers-reduced-motion` 목록에 더함. |
| `docs/PROJECT-STRUCTURE.md` (웹 구현 PR에 같이) | 새 파일 둘 때문에 `python scripts/generate_project_structure.py`로 다시 만든다(변경 전파 9번, 안 하면 push 훅이 막는다). |

`track()` 이름은 문자열 그대로 쓴다. 변수로 넘기면 `verify-analytics-event-contract.mjs`가 동적 이벤트명이라고 실패한다.

## 5. 어뷰징과 계측

### 어뷰징

인증이 없다. 설문과 같은 수준으로 막고, 그 이상은 안 한다. 집계를 공개하지 않고 정렬에도 안 쓰므로 부풀릴 동기가 작다.

| 막는 것 | 어디서 | 새로 만드나 |
| --- | --- | --- |
| 한 브라우저 한 표 | 접기 3단계(visitorId×브랜드마다 마지막 값 하나) | 규칙만 |
| 한 IP가 visitorId를 바꿔 가며 몰아치기 | 원장 `ipHash`(하루 단위, 솔트는 프로세스마다, `ClientFingerprint`)로 분석 때 같은 날 같은 해시의 visitorId 수를 본다 | 아니오 |
| 연타 | `EventRateLimiter` IP 해시당 분당 120건 | 아니오 |
| 봇 | `CrawlerName`이 `bot` 칸을 채우고 접기 1단계가 뺀다 | 아니오 |
| 개발자 기기 | `dev` 칸, 접기 1단계가 뺀다 | 아니오 |
| 이상한 값 | §4 `EventController` 값 검사 | 예 |

### 계측

- 이벤트 하나: `brand_reaction {brand, reaction, prev, position}`. 따로 `brand_like`/`brand_dislike`로 쪼개지 않는다. 취소와 바꿈을 한 이벤트의 `prev`→`reaction`으로 읽는다.
- 노출 분모는 이미 있는 `brand_impression`이다. "본 카드 중 몇 %에 반응했나"는 둘을 visitorId·브랜드로 맞댄다.
- 허용 목록과 프론트 계약: 웹에 `track('brand_reaction', …)`이 생기고 API `ALLOWED_EVENTS`에 이름이 들어가야 `verify-analytics-event-contract.mjs`가 초록이다. 한쪽만 들어가면 빠진 쪽(`missingEvents`)이나 남는 쪽(`unusedAllowedEvents`)으로 빨개진다. 스크립트는 고칠 것이 없다.
- 한계: 비콘이 떨어진 반응은 원장에 없고, 없다는 사실도 안 남는다. 브라우저에 쌓인 반응 수와 원장 줄 수를 맞댈 방법이 이번에는 없다.

## 6. 시험 목록

### API (`EventControllerTest`)

1. `brand_reaction`을 `{brand, reaction:"like", prev:"none", position}`으로 보내면 `accepted: 1`이고 원장 줄에 네 props가 그대로 있다.
2. 취소(`reaction:"none", prev:"like"`)와 바꿈(`reaction:"dislike", prev:"like"`)도 받는다.
3. `reaction:"love"`처럼 목록 밖 값, `prev` 빠짐, `brand` 빈 값, `reaction`과 `prev`가 같은 값은 버린다(`accepted: 0`, 원장 줄 없음).
4. 같은 배치에 정상 `brand_reaction` 하나와 깨진 것 하나를 섞으면 정상 하나만 남는다.
5. 값 검사가 다른 이벤트에 번지지 않는다: `props`에 `reaction`이 없는 `brand_hide`는 그대로 받는다.

### 웹 (`brandReactions.test.js`)

1. `nextReaction`이 §1 표 여섯 칸을 다 맞춘다.
2. `setReaction(…, 'none')`은 열쇠를 지우고, 저장된 JSON에 그 브랜드가 없다.
3. `readReactions`는 저장소가 던지거나(사생활 보호 창), 값이 깨졌거나, 배열이면 `{}`.
4. `reactionOf`는 `brand.name`으로 먼저 찾고, 없으면 `searchAliases`로 찾는다. 둘 다 없으면 `'none'`.
5. 옛 별칭 열쇠로 찾은 브랜드를 다시 누르면 새 이름 열쇠로 적고 옛 열쇠는 지운다.
6. `like`/`dislike`가 아닌 저장값(손으로 고친 값)은 `'none'`으로 읽는다.

### 계약과 화면

1. `npm test`(웹)의 `test:event-contract`가 초록. API 쪽을 아직 안 고친 웹 브랜치에서는 빨개야 한다(API 먼저 병합).
2. 360px 스크린샷 셋: 자세히 보기가 있는 카드, 없는 카드, 좋아요가 눌린 카드. 반응 버튼과 자세히 보기·공유가 겹치지 않는다.
3. 반응 버튼을 눌러도 시트가 안 열린다(프리뷰에서 손으로, 스크린샷에 시트 없음).
4. 새로고침 뒤에도 눌린 상태가 남는다(프리뷰에서 손으로).

## 7. 폭발 반경

`docs/CHANGE-PROPAGATION.md`에서 찾은 묶음과 이번에 같이 고치는지.

| 묶음 | 이번에 넣나 | 이유 |
| --- | --- | --- |
| 7. 행동 이벤트 | 넣는다 | `track()`과 `ALLOWED_EVENTS` 두 자리를 같은 이슈에서 고친다. 대조 스크립트가 반쪽을 잡는다. |
| 8. 배포 순서 | 지킨다 | API 먼저 병합·배포, 웹 나중. 웹이 먼저 나가면 반응이 서버에서 조용히 버려진다. |
| 9. 새 파일 | 넣는다 | `brandReactions.js`, `brandReactions.test.js` → `PROJECT-STRUCTURE.md` 재생성. 테스트는 `run-node-tests.mjs`가 자동으로 줍는다. |
| 6. 화면 글자 | 묻는다 | `aria-label` 두 개가 새 문구. 열린 질문 1. |

이슈가 짚은 "카드 마크업"과 "원장 스냅샷" 묶음은 `CHANGE-PROPAGATION.md`에 줄이 없다. 코드에서 직접 본 결과:

- 카드 마크업: 카드 클래스를 읽는 곳은 `firstVisitGuide.js`(`.cc-ticket`, `.cc-hint`)와 `CouponCard.jsx` `onCardClick` 선택자다. `.cc-hint`는 이름도 자리도 안 바뀐다. `onCardClick`은 §1대로 고친다.
- 원장 스냅샷: `EventLogSnapshot`을 쓰는 `SurveyEligibility`는 `offer_link_click`, `banner_click`, `survey_answer`만, `PopularityIndex`는 `offer_link_click`, `banner_click`만 센다. 새 이벤트가 들어와도 두 집계는 그 줄을 건너뛴다. 스냅샷 버전을 안 올린다.

### 뒤집을 조건

아래 중 하나가 생기면 서버가 접는 쪽으로 간다(전용 API, `EventLogSnapshot` 기반 접기 클래스, 조회 엔드포인트). 각각 따로 이슈다.

- 브랜드별 좋아요·싫어요 수를 화면에 보인다.
- 인기순 정렬에 반응을 섞는다.
- 반응에 보상을 건다.

## 8. 열린 질문

1. **`aria-label` 문구**: `좋아요`, `싫어요`, 묶음 `${브랜드} 반응`으로 써도 되나.
2. **펼친 카드에서 숨김**: 카드 안에서 펼친 동안(인기 브랜드 바로가기로 들어온 경우) 반응 버튼을 숨기는 것으로 괜찮나. 펼친 영역 맨 아래 "접기" 줄 왼쪽에 다시 두는 안도 있다.
3. **시트에는 안 둠**: 자세히 보기 시트 안(숨기기 위)에도 둘 필요가 있나. 이번 설계는 카드에만 둔다.
