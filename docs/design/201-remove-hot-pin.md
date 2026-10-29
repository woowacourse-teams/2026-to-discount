# 201 기본 정렬에서 HOT 1~5위 맨 앞 고정 제거

이슈: [#201](https://github.com/woowacourse-teams/2026-to-discount/issues/201). 웹만 바꾼다. API 변경 없음.

## 결정

- `pinPopular`(HOT 1~5위를 목록 맨 앞에 세움)를 지운다. 기본 정렬 순서는 `applyFilters`의 규칙(신규 앞 포함)만 따른다.
- `pinKinds`는 `hot`을 돌려주지 않는다. `new`와 `none`은 그대로다.
- 도크(`PopularDock`)는 건드리지 않는다. 입력이 `rankBrands`이고 `pinPopular`를 거치지 않으므로 고정이 없어져도 순위가 변하지 않는다.
- 카드 순번(`popRanks`)은 **보이는 동작을 유지한다.** 단, 호출부만 두고는 유지되지 않는다(아래 "숨은 의존").

## 지금 구조

`App.jsx:413~429`.

- `rankBrands`: 카테고리와 검색을 뺀 목록. 도크, `pinPopular`, `pinKinds`, `popRanks`가 모두 이 순위표를 읽는다([#147](https://github.com/woowacourse-teams/2026-to-discount/blob/main/docs/design/147-realtime-ignores-category.md)).
- `visibleBrands` = `pinPopular(...)` 결과에 `pinKinds`로 `pin` 값을 붙임.
- `popRanks` = `cardRanks(rankBrands, visibleBrands, 인기순인가)`.

`pinPopular`를 지우면 #147의 "세 곳이 같은 표를 읽는다"에서 한 곳이 빠진다. 남은 둘(도크, 카드 순번)은 여전히 `rankBrands` 하나를 읽으므로 어긋나지 않는다.

## 숨은 의존: 카드 순번이 맨 앞 고정에 기댄다

`cardRanks`(`web/src/popularStrip.js:59`)는 인기순이 아니면 `visibleBrands[0]`이 HOT 1위일 때만 순번을 붙인다. 맨 앞 고정이 켜졌다는 뜻을 이 조건으로 읽는 것이다.

고정을 지우면 기본 정렬의 첫 카드는 신규 또는 금액 1위이고, HOT 1위가 우연히 거기 있지 않는 한 `cardRanks`가 `null`을 돌려준다. 결과: **코드는 안 건드렸는데 카드 순번이 기본 정렬에서 조용히 사라진다.** 이슈의 "`popRanks`는 건드리지 않음"이 의도한 것은 순번을 그대로 보이는 것이라고 읽고, 아래처럼 한다.

- `cardRanks`의 세 번째 인자를 "인기순인가"에서 "순번을 붙이는 정렬인가"로 넓힌다. 인기순이면 지금처럼 전부, 기본 정렬이면 HOT 1~5위(카테고리를 고르면 그 안에 있는 것만), 그 밖의 정렬이면 `null`.
  - 인자는 정렬 종류 문자열 하나로 받는다: `'popularity' | 'default' | 'other'`. 불리언 둘을 늘어놓지 않는다.
  - `App.jsx`는 `primarySort(filters).key === 'popularity'`와 `sortSignature(filters.sorts) === sortSignature(DEFAULT_SCALARS.sorts)`로 만든다. 기본 정렬 판정은 `pinPopular`에 있던 것과 같은 식이다. `filters.js`에 `isDefaultSort(filters)`로 뽑아 `applyFilters`(신규 앞)도 같이 쓴다.
- `visibleBrands[0].name === lead.brand.name` 조건은 지운다. 이 조건이 고정을 확인하던 자리다.

이렇게 하면 기본 정렬에서 HOT 카드는 목록 중간에 서고 순번(1~5)만 붙는다. 순번이 목록 순서와 어긋나 보이는 것이 사용자 지시의 의도에 맞는지는 개발자 확인이 필요하다(리뷰 포인트 1).

## 바꾸는 곳

| 자리 | 변경 |
| --- | --- |
| `web/src/filters.js` `pinPopular` | 삭제. `popularToday`, `STRIP_MIN` import가 `pinKinds`에서 안 쓰이면 같이 뺀다 |
| `web/src/filters.js` `pinKinds` | `hot` 분기 삭제. `rankBrands` 인자 삭제(더는 안 읽음). 주석의 "'hot' | 'new'"와 "HOT 앞" 문구를 고친다 |
| `web/src/filters.js` `applyFilters` 주석 | "2026-10-18 신규보다 앞" 결정이 뒤집혔음을 적지 않고, 현재 규칙만 쓴다 |
| `web/src/popularStrip.js` `cardRanks` | 위 "숨은 의존" 대로. 머리 주석의 "맨 앞에 HOT 순위권을 세웠을 때만"을 고친다 |
| `web/src/App.jsx` | import에서 `pinPopular` 삭제. `visibleBrands`는 `applyHidden(applyFilters(...))`에 `pinKinds(ordered, filters)`를 붙임. `rankBrands`는 도크와 `popRanks`가 쓰므로 유지. 417행 주석에서 "HOT 고정" 삭제 |
| `docs/ANALYTICS.md` 87~88행 | `pin` 값에서 `hot`을 빼고 "2026-10-29 이후 `hot` 없음"을 적는다 |
| `web/src/PopularDock.jsx` | 변경 없음 |

`pin` 값 검증은 API에 없다(`api/src`에 `pin` 없음). 이벤트 허용 목록(`ALLOWED_EVENTS`)도 이벤트 이름만 본다. 그래서 API는 손대지 않고 배포 순서 문제도 없다.

## 전파 확인 (`docs/CHANGE-PROPAGATION.md`)

- 7번 행동 이벤트: `pin` 속성 값 집합이 바뀐다. 이벤트 이름은 그대로라 `verify-analytics-event-contract.mjs`는 영향 없다. 값 집합은 대조 장치가 없으므로 `ANALYTICS.md`와 `filters.test.js`가 기록이다.
- 8번 배포: 웹만이라 순서 제약 없음. 프리뷰 먼저, 승인 뒤 main.
- 1번 확실성, 2번 배너 모양: 정렬 순서 판정은 안 바꾼다. 해당 없음.
- 9번 새 파일: 새 파일 없음. `filters.test.js`는 이미 `test` 사슬에 있다.

## 테스트

`web/src/filters.test.js`. 먼저 고쳐야 할 것이 많고, 모두 `pinPopular`를 부른다.

- 63행 "기본 정렬이면 HOT 1~5위가 맨 앞에…": 뒤집는다. 같은 입력의 `applyFilters(list, defaultFilters())` 순서에 HOT이 앞에 서지 않음을 박는다. 양성 신호로, 입력에서 HOT 1위가 금액 순서로는 뒤에 오도록 짠다. 안 그러면 "고정이 없다"와 "우연히 앞이다"가 구분되지 않는다.
- 302행 `pinPopular: 고른 카테고리…`: 삭제. 순번 쪽은 아래 새 시험이 맡는다.
- 316행 `pinKinds`: `pinPopular`를 빼고 `ordered = applyFilters(brands, f)`로 바꾼다. 기대값은 `hot`이 하나도 없고, 신규는 `new`, 나머지는 `none`. 정렬을 바꾸면 `size === 0`, 세 곳 미만 시험은 `hot`이 없다는 점에서 위와 같아지므로 `new`만 남는 시험 하나로 합친다. **`hot` 문자열이 어떤 입력에서도 안 나옴**을 직접 단언한다(`[...kinds.values()].includes('hot') === false`).
- 337, 349행 `cardRanks`를 쓰는 시험: `pinPopular`를 빼고 `cardRanks(rank, applyFilters(...), 'default')`를 부른다. 도크와 같은 이름에 같은 순위가 붙는 단언은 그대로 둔다. 새 단언: 기본 정렬에서 HOT 1위가 첫 카드가 아니어도 순번이 붙는다. `'other'`이면 `null`이다.
- 새 시험: `App.jsx`의 조립(`visibleBrands`에 `pin` 붙이기)은 컴포넌트 안이라 단위로 못 잡는다. 대신 `isDefaultSort` 시험을 둔다.
- `brandImpression.test.js:90`, `offerLink.test.js:22`는 `pin: 'hot'`을 그대로 통과시키는 시험이다. 값 목록을 검사하지 않으므로 `hot` 대신 `new`로 바꿔 더는 `hot`이 정상 값처럼 보이지 않게 한다.

실행: `cd web && npm test`.

## 확인 (구현자)

- 360px 스크린샷, 기본 정렬 첫 화면: HOT 브랜드가 맨 앞에 안 서 있다. 같은 데이터로 변경 전 스크린샷도 찍어 맞댄다. 데이터가 바뀌어 HOT이 우연히 앞이면 증거가 안 되므로, 변경 전 화면에서 HOT이 맨 앞인 상태를 먼저 확인한다.
- 같은 화면에서 HOT 카드의 순번(1~5)이 목록 중간에서도 붙어 있다.
- 도크가 변경 전과 같은 다섯 곳, 같은 순서다.
- 카테고리를 고르면 도크는 그대로이고 그 안에 있는 HOT 브랜드에만 전역 순위 순번이 붙는다.

## PR 본문에 적을 것

- 분석: `pin=hot`은 이 변경이 배포된 시점부터 안 나온다. 배포는 mono main 푸시 시 미러로 가고 Vercel이 올린다. 정확한 끊기는 시각은 Vercel 프로덕션 배포 시각을 병합 뒤에 적는다(지금은 모른다). 그 전 데이터에는 `hot`이 남는다. #185의 `pin` 계측 비교 기간은 이 시각 앞뒤로 나눈다.
- `PopularDock`과 `popRanks` 처리는 위 "결정" 그대로.

## 리뷰 포인트

1. **카드 순번을 기본 정렬에서도 붙여 두는 것이 맞는가.** 이슈 문구("건드리지 않을 것")를 순번이 계속 보이는 것으로 읽었다. 맨 앞 고정이 없어지면 순번 1이 목록 중간에 설 수 있다. 아니오라면 `cardRanks`의 기본 정렬 분기를 `null`로 두고(순번은 인기순 정렬에서만), 도크만 HOT을 보여 준다. 이 경우 `cardRanks` 변경은 조건 삭제 한 줄로 줄어든다.
2. 도크 문구나 위치는 이번에 바꾸지 않는다. 맨 위 고정이 사라지면 도크가 HOT의 유일한 상단 노출이 된다. 맞는가.

## 변경 이력

- 2026-10-29 재설계 실행: 이슈 입력에 권한자(OWNER, MEMBER, COLLABORATOR) 댓글이 없어 인계 댓글도 없다. 설계 내용은 바꾸지 않았다. `web/src`의 현재 코드(`pinPopular`, `pinKinds`, `cardRanks` 호출부와 시험)를 다시 대조해 위 "바꾸는 곳"과 "테스트"의 대상이 그대로임을 확인했다. 이 이력 절만 추가했다. 권한자 댓글이 달리면 그 댓글이 이 문서보다 앞서므로 다시 반영한다.
