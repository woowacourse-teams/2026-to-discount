# 201 기본 정렬에서 HOT 1~5위 맨 앞 고정 제거

이슈: [#201](https://github.com/woowacourse-teams/2026-to-discount/issues/201). 웹만 바꾼다. API 변경 없음.

## 결정

이슈 본문 "결정 (2026-10-29, 사용자)"에 맞춘다.

- `pinPopular`(HOT 1~5위를 목록 맨 앞에 세움)를 지운다. 기본 정렬 순서는 `applyFilters`의 규칙(신규 앞 포함)만 따른다.
- `pinKinds`는 `hot`을 돌려주지 않는다. `new`와 `none`은 그대로다.
- **카드 왼쪽 위 순번(`popRanks`)을 지운다.** 기본 정렬이든 인기순이든 숫자를 그리지 않는다. `cardRanks`, `popRanks`, `CouponCard`의 `rank` 속성, 순번 전용 CSS, 관련 시험을 함께 정리한다.
- 도크(`PopularDock`)는 유지한다. 입력이 `rankBrands`이고 `pinPopular`를 거치지 않으므로 고정이 없어져도 도크의 순위는 변하지 않는다.
- 새 분석 속성은 추가하지 않는다. 클릭과 노출 이벤트가 이미 싣는 `position`(카드 순서)만 계속 수집한다.

## 지금 구조

`App.jsx:413~429`.

- `rankBrands`: 카테고리와 검색을 뺀 목록. 도크, `pinPopular`, `pinKinds`, `popRanks`가 이 순위표를 읽는다([#147](https://github.com/woowacourse-teams/2026-to-discount/blob/main/docs/design/147-realtime-ignores-category.md)).
- `visibleBrands` = `pinPopular(...)` 결과에 `pinKinds`로 `pin` 값을 붙임.
- `popRanks` = `cardRanks(rankBrands, visibleBrands, 인기순인가)`. `CouponCard`에 `rank`로 전달(`App.jsx:728`).

이 변경 뒤에는 `rankBrands`를 읽는 곳이 도크 하나다. #147의 "세 곳이 같은 표를 읽는다"는 읽는 곳이 하나로 줄어 어긋날 일이 없다. `rankBrands` 자체는 도크가 쓰므로 유지한다(`pinKinds` 인자에서는 뺀다).

## 순번을 지울 때 번지는 곳

`CouponCard.jsx:401~404`의 왼쪽 위 리본은 `rank`가 있으면 순번을, 없으면 신규 오퍼가 있을 때 `NEW!`를 그린다. 둘 다면 순번이 이겼다.

- **`NEW!` 리본이 새로 보이는 카드가 있다.** 지금까지 HOT 1~5위 카드는 신규 오퍼가 있어도 순번에 가려 `NEW!`가 안 보였다. 순번을 지우면 이 카드들에 `NEW!`가 뜬다. 사용자 결정이 이 효과를 포함한다고 읽고 그대로 둔다. 사용자 확인이 필요하면 리뷰 포인트 1.
- **`pin=new`와 화면이 맞아야 한다.** `NEW!`는 `brand.offers.some(isUpdated)`, `pin=new`는 `hasNewBest`(최고 오퍼가 신규)라 조건이 원래 다르다. 이번에 합치지 않는다.
- **CSS**: `web/src/styles/coupon-card.css`의 `.cc-rank`는 `.cc-rank--new`가 바탕으로 쓴다(위치, 색, 글자 굵기). 그래서 `.cc-rank` 본체는 남기고, 순번 숫자 전용인 `::before`(말풍선 꼬리 모양)와 `::after`(🔥)와 이를 끄던 `.cc-rank.cc-rank--new::before, ::after { content: none }`만 지운다. 지운 뒤 `.cc-rank--new`가 같은 모양으로 그려지는지 360px 스크린샷으로 확인한다.
- **접근성 이름**: `aria-label="인기 N위"`가 사라진다. 인기 순위는 도크의 `aria-label`(`N위 …`)만 남는다.

## 바꾸는 곳

| 자리 | 변경 |
| --- | --- |
| `web/src/filters.js` `pinPopular` | 삭제. 1행 `popularStrip.js` import(`STRIP_MIN`, `popularToday`)는 `pinKinds`에서도 안 쓰게 되므로 같이 뺀다 |
| `web/src/filters.js` `pinKinds` | `hot` 분기 삭제. `rankBrands` 인자 삭제(더는 안 읽음). 주석의 "'hot' \| 'new'"와 "pinPopular(HOT 앞)" 문구를 고친다 |
| `web/src/filters.js` `applyFilters` 주석 | 현재 규칙만 쓴다. "2026-10-18 신규보다 앞" 결정이 뒤집혔다는 서술은 넣지 않는다 |
| `web/src/popularStrip.js` `cardRanks` | 삭제. `ranks`, `popularToday`, `STRIP_SIZE`, `STRIP_MIN`은 도크가 쓰므로 유지. 머리 주석의 "세 곳이 안 되면…"은 도크 기준이라 그대로 둔다 |
| `web/src/App.jsx` | import에서 `pinPopular`, `cardRanks` 삭제. `primarySort`는 다른 곳에서 안 쓰면 같이 뺀다. `visibleBrands`는 `applyHidden(applyFilters(...))`에 `pinKinds(ordered, filters)`를 붙임. `popRanks`와 그 `useMemo` 삭제. 728행 `rank: popRanks?.get(b.name)` 삭제. 417행 주석에서 "HOT 고정" 삭제 |
| `web/src/CouponCard.jsx` | `rank` 속성 삭제. 리본은 `brand.offers.some(isUpdated) && <span className="cc-rank cc-rank--new" …>`만 남김. 401행 주석 고침 |
| `web/src/styles/coupon-card.css` | 위 "CSS" 대로 |
| `docs/ANALYTICS.md` 87~88행 | `pin` 값에서 `hot`을 빼고 "2026-10-29 이후 `hot` 없음"을 적는다. `position` 설명은 그대로 |
| `web/src/PopularDock.jsx` | 변경 없음 |

`isDefaultSort` 같은 새 보조 함수는 만들지 않는다. 기본 정렬 판정을 `cardRanks`와 나눌 일이 없어졌다.

`pin` 값 검증은 API에 없다(`api/src`에 `pin` 없음). 이벤트 허용 목록(`ALLOWED_EVENTS`)도 이벤트 이름만 본다. 그래서 API는 손대지 않고 배포 순서 문제도 없다.

## 전파 확인 (`docs/CHANGE-PROPAGATION.md`)

- 7번 행동 이벤트: `pin` 속성 값 집합이 바뀐다(`hot` 제거). 이벤트 이름과 새 속성은 없어 `verify-analytics-event-contract.mjs`는 영향 없다. 값 집합은 대조 장치가 없으므로 `ANALYTICS.md`와 `filters.test.js`가 기록이다. `position`은 그대로 수집한다.
- 8번 배포: 웹만이라 순서 제약 없음. 프리뷰 먼저, 승인 뒤 main.
- 1번 확실성, 2번 배너 모양: 정렬 순서 판정은 안 바꾼다. 해당 없음.
- 9번 새 파일: 새 파일 없음. `filters.test.js`는 이미 `test` 사슬에 있다.
- [#147 설계](https://github.com/woowacourse-teams/2026-to-discount/blob/main/docs/design/147-realtime-ignores-category.md): 도크, `pinPopular`, `popRanks`가 같은 표를 읽는다는 관계의 정본이다. 이 변경이 그중 둘을 지우므로 #147 문서는 당시 기록으로 남기고 고치지 않는다. 남는 읽는 곳은 도크 하나다.

## 테스트

`web/src/filters.test.js`. 먼저 고쳐야 할 것이 많고, 모두 `pinPopular`나 `cardRanks`를 부른다. 시험 번호(줄)는 현재 파일 기준이다.

- 63행 "기본 정렬이면 HOT 1~5위가 맨 앞에…": 뒤집는다. 같은 입력의 `applyFilters(list, defaultFilters())` 순서에 HOT이 앞에 서지 않음을 박는다. 양성 신호로, 입력에서 HOT 1위가 금액 순서로는 뒤에 오도록 짠다. 안 그러면 "고정이 없다"와 "우연히 앞이다"가 구분되지 않는다.
- 302행 `pinPopular: 고른 카테고리…`: 삭제.
- 316행 `pinKinds`: `pinPopular`를 빼고 `ordered = applyFilters(brands, f)`로 바꾼다. 기대값은 `hot`이 하나도 없고, 신규는 `new`, 나머지는 `none`. 정렬을 바꾸면 `size === 0`. 세 곳 미만 시험은 `hot`이 없다는 점에서 위와 같아지므로 `new`만 남는 시험 하나로 합친다. **`hot` 문자열이 어떤 입력에서도 안 나옴**을 직접 단언한다(`[...kinds.values()].includes('hot') === false`).
- 337행 `카드 순번은 도크와 같은 이름에…`, 349행 `검색 중에도 HOT 순위와 카드 순번은…`: `cardRanks`를 부르는 시험이므로 삭제한다. 도크 쪽 보장은 `popularToday(rankList147(...))`가 카테고리와 검색에 상관없이 같은 다섯을 돌려준다는 단언(285~300행, 349행의 첫 단언)이 맡는다. 349행 시험은 첫 단언만 남겨 `검색 중에도 HOT 순위는 전역 그대로다(#147)`로 이름을 고친다. 두 시험 이름의 "카드 순번"을 `grep`으로 다시 찾아 남은 곳이 없게 한다.
- 285행 주석의 "(도크·맨 앞 고정·카드 순번)"을 "(도크)"로 고친다.
- `filters.test.js` 11행 import에서 `cardRanks`를 뺀다. `STRIP_MIN`, `popularToday`는 남는 시험이 쓰므로 유지한다.
- 구조로 짚는 시험: `App.jsx`의 조립은 컴포넌트 안이라 단위로 못 잡는다. 대신 `grep`성 단언은 두지 않고, 구현자가 `pinPopular`, `cardRanks`, `popRanks`가 `web/src`에 한 곳도 안 남았음을 확인한다(아래 "확인").
- `brandImpression.test.js:90`, `offerLink.test.js:22`는 `pin: 'hot'`을 그대로 통과시키는 시험이다. 값 목록을 검사하지 않으므로 `hot` 대신 `new`로 바꿔 더는 `hot`이 정상 값처럼 보이지 않게 한다.

실행: `cd web && npm test`.

## 확인 (구현자)

- 360px 스크린샷, 기본 정렬 첫 화면: HOT 브랜드가 맨 앞에 안 서 있다. 같은 데이터로 변경 전 스크린샷도 찍어 맞댄다. 데이터가 바뀌어 HOT이 우연히 앞이면 증거가 안 되므로, 변경 전 화면에서 HOT이 맨 앞인 상태를 먼저 확인한다.
- 같은 화면에서 어떤 카드에도 왼쪽 위 숫자가 없다. 인기순 정렬으로 바꿔도 없다(변경 전에는 인기순에서 전 카드에 숫자가 있었다).
- 신규 오퍼가 있는 HOT 카드에 `NEW!` 리본이 뜨고, 모양이 신규 오퍼가 있던 다른 카드와 같다.
- 도크가 변경 전과 같은 다섯 곳, 같은 순서다. 카테고리를 골라도 도크는 그대로다.
- `grep -rn "pinPopular\|cardRanks\|popRanks" web/src`가 아무것도 안 낸다. 그 전에 같은 명령이 변경 전에는 결과를 내는 것을 봐서 명령이 제대로 도는지 확인한다.
- 클릭과 노출 이벤트의 `position`은 변경 전과 같은 값이다. 새 속성이 추가되지 않았다.

## PR 본문에 적을 것

- 분석: `pin=hot`은 이 변경이 배포된 시점부터 안 나온다. 배포는 mono main 푸시 시 미러로 가고 Vercel이 올린다. 정확한 끊기는 시각은 Vercel 프로덕션 배포 시각을 병합 뒤에 적는다(지금은 모른다). 그 전 데이터에는 `hot`이 남는다. #185의 `pin` 계측 비교 기간은 이 시각 앞뒤로 나눈다. 새 속성은 없고 `position`만 계속 수집한다.
- 카드 순번 삭제와 도크 유지는 위 "결정" 그대로.

## 리뷰 포인트

1. 순번이 사라지면 HOT 1~5위 카드에도 신규 오퍼가 있을 때 `NEW!` 리본이 뜬다(지금은 순번에 가려 안 보임). 이대로 둬도 되는가.
2. 도크 문구나 위치는 이번에 바꾸지 않는다. 맨 위 고정과 카드 순번이 둘 다 사라지면 도크가 HOT의 유일한 노출이 된다. 맞는가.

## 변경 이력

- 2026-10-29 재설계 실행: 이슈 입력에 권한자(OWNER, MEMBER, COLLABORATOR) 댓글이 없어 인계 댓글도 없다. 설계 내용은 바꾸지 않았다. `web/src`의 현재 코드(`pinPopular`, `pinKinds`, `cardRanks` 호출부와 시험)를 다시 대조해 위 "바꾸는 곳"과 "테스트"의 대상이 그대로임을 확인했다. 이 이력 절만 추가했다. 권한자 댓글이 달리면 그 댓글이 이 문서보다 앞서므로 다시 반영한다.
- 2026-10-29 재설계 실행(두 번째): 이슈 입력에 여전히 권한자 댓글과 `인계:` 댓글이 없다. 설계와 부딪히는 댓글이 없어 내용은 바꾸지 않았다. `pinPopular`, `pinKinds`, `cardRanks`가 `web/src`의 `filters.js`, `popularStrip.js`, `App.jsx`, `filters.test.js`에 그대로 있음을 다시 확인했다. 리뷰 포인트 1과 2는 답이 없어 열려 있다.
- 2026-10-29 재설계 실행(세 번째): 이슈 본문 "결정 (2026-10-29, 사용자)"에 맞춰 고쳤다. 권한자 댓글은 이번에도 없고, 이 절이 이슈 본문 안에 있어 설계와 부딪히는 부분은 이 절이 이긴다.
  - 기존: 카드 순번(`popRanks`)을 유지하고 `cardRanks`의 세 번째 인자를 `'popularity' | 'default' | 'other'`로 넓힘. `filters.js`에 `isDefaultSort` 추가. 리뷰 포인트 1(순번 유지 여부)과 2(도크 유지) 열림.
  - 변경: 카드 순번을 지움. `cardRanks`, `popRanks`, `CouponCard`의 `rank`, 순번 전용 CSS(`.cc-rank::before`, `::after`)를 삭제. `isDefaultSort`와 "숨은 의존" 절은 순번이 없어져 뺌. 도크는 유지. 새 분석 속성 없음, `position`만 수집. 리뷰 포인트 1과 2는 이 결정으로 닫고, 순번 삭제의 부수 효과인 `NEW!` 리본 노출을 새 리뷰 포인트 1로 올렸다(리뷰 포인트 2는 도크 단독 노출 확인으로 바꿈).
  - 근거: 순번 리본은 `rank`가 있으면 `NEW!`를 가렸으므로(`CouponCard.jsx:402~404`) 순번을 지우면 HOT 카드에 `NEW!`가 보일 수 있다. `.cc-rank--new`가 `.cc-rank` 본체를 바탕으로 쓰므로 본체 CSS는 남긴다.
  - 시험 변경: `cardRanks`를 쓰던 337행, 349행 시험을 삭제하거나 도크 순위 단언만 남김. `grep`으로 세 이름(`pinPopular`, `cardRanks`, `popRanks`)이 안 남는지 확인하는 단계를 "확인"에 추가.
