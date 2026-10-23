# 147. 실시간 순위(HOT)를 카테고리와 떼어 놓기

추적 이슈: [#147](https://github.com/woowacourse-teams/2026-to-discount/issues/147)

## 결론

실시간 순위는 카테고리 필터를 거치기 전 목록으로 계산한다. 섹션을 나누지 않고 입력 목록만 바꾼다.

- `PopularDock`에 넘기는 목록을 `visibleBrands`(카테고리까지 거른 것)에서 `rankBrands`(카테고리만 빼고 나머지 필터는 그대로 건 것)로 바꾼다.
- 카드 쪽 HOT 맨 앞 고정(`pinPopular`)과 카드 순번(`popRanks`)은 `rankBrands`의 순위표를 쓴다. 카테고리를 고르면 맨 앞 고정은 하지 않고, 순번은 그 카테고리 안에 있는 브랜드에만 전역 순위 그대로 붙인다.
- API는 바꾸지 않는다.

## 배경

이슈 추정이 맞다. `web/src/App.jsx:413`의 `visibleBrands`가 `applyFilters`로 카테고리(`filters.categories`, `filters.js:357`)까지 거른 뒤 `PopularDock`(`App.jsx:541`)에 들어간다. `PopularDock`은 `popularToday(brands)`로 상위 5를 뽑고, 세 곳(`STRIP_MIN`)이 안 되면 `null`을 돌려준다(`PopularDock.jsx:71`). 1~5위가 치킨·피자인데 패스트푸드를 고르면 후보가 0~2곳이라 섹션이 통째로 사라진다. 주석의 "지금 목록에 남은 브랜드 중"(`popularStrip.js:2`)이 의도된 설계였고, 이번에 그 의도를 뒤집는다.

같은 목록을 먹는 자리가 둘 더 있다. 다 같이 고치지 않으면 서로 다른 순위를 보인다.

- `pinPopular`(`filters.js:370`): 기본 정렬일 때 상위 5를 목록 맨 앞에 세운다. 입력이 `visibleBrands`.
- `popRanks`(`App.jsx:418`): 카드 왼쪽 위 순번. 주석에 "HOT과 같은 표라 순위가 맞는다"고 되어 있다. 도크만 전역으로 바꾸면 도크는 1위 BBQ, 카드는 패스트푸드 안에서 1위라고 맥도날드에 1을 붙이는 모순이 난다.

## 확인한 것

- 필터 중 카테고리만이 아니라 검색(`filters.search`), 앱 선택(`platforms`), 최소금액(`minAmount5k`), 멤버십, 업데이트만, 숨김(`applyHidden`)도 도크 입력을 줄인다. 이슈가 말한 것은 카테고리뿐이다.
- 도크의 쓰임은 "지금 사람들이 누르는 브랜드"를 보여주는 것이라 카테고리와 무관해야 한다. 반면 앱 선택·숨김은 "내가 안 보는 것"이라 순위에도 반영되는 편이 자연스럽다. 이 구분으로 이번에는 카테고리만 뗀다. 검색은 아래 열린 질문에 둔다.
- `popularToday`는 입력 순서와 무관하다. `popularityToday` 값으로만 순위를 매겨 입력 목록만 바꿔도 순위 계산은 그대로 쓴다.
- `PopularStrip.jsx:18`도 `popularToday`를 부르지만 `App.jsx`에서 쓰이는 곳은 `PopularDock`뿐이다. 구현자가 `PopularStrip`의 사용처를 확인한다. 쓰이면 같은 입력을 준다.

## 변경

### 웹: `web/src/App.jsx`

```js
// 순위 기준 목록: 카테고리만 뺀다. 실시간 순위는 어느 카테고리를 보든 같다(#147).
const rankBrands = useMemo(
  () => (brands ? applyHidden(applyFilters(brands, { ...filters, categories: new Set() }), hidden, bestOf) : brands),
  [brands, filters, hidden, bestOf],
)
const visibleBrands = useMemo(
  () => (brands ? pinPopular(applyHidden(applyFilters(brands, filters), hidden, bestOf), filters, rankBrands) : brands),
  [brands, filters, hidden, bestOf, rankBrands],
)
```

- `PopularDock brands={rankBrands}`로 바꾼다(541행).
- `popRanks`는 `rankBrands`로 만든 순위표(`ranks(rankBrands, 'popularityToday')`, `popularToday(rankBrands)`)에서 `visibleBrands`에 있는 브랜드만 고른다. 인기순 정렬이면 지금처럼 전부, 그 밖에는 HOT 1~5위만 붙인다. 지금 조건 `visibleBrands[0] === top[0]?.brand`(맨 앞이 1위인지)는 맨 앞 고정이 켜졌을 때만 순번을 붙이려는 것이므로 유지한다. 비교 대상은 `rankBrands` 쪽 1위 이름으로 한다(필터로 객체가 새로 만들어질 수 있어 이름 비교).
- 이름·값으로 보는 이유: `applyFilters`는 오퍼를 줄인 브랜드를 `{ ...b, offers }`로 새로 만든다. 도크가 보여주는 최고 할인(`bestConfirmedAmount`)은 `rankBrands` 쪽 오퍼 기준이고 카드는 `visibleBrands` 쪽이다. 카테고리만 다르면 오퍼 필터는 같아 금액이 같다.

### 웹: `web/src/filters.js`

`pinPopular(brands, filters, rankBrands = brands)`로 인자를 더한다.

- 정렬이 기본이 아니면 그대로 돌려준다(지금과 같다).
- `filters.categories.size > 0`이면 그대로 돌려준다. 카테고리 안에 전역 상위 5가 드문드문 있을 때 맨 앞이 비거나 순위가 뛰어 보이는 것을 피한다.
- 아니면 `popularToday(rankBrands)`로 뽑은 이름을 `brands`에서 찾아 앞에 세운다. 카테고리가 비어 있을 때 `rankBrands`와 `brands`는 같은 내용이라 지금 동작과 같다.

기본값을 `brands`로 두어 기존 호출과 `filters.test.js`가 그대로 돈다.

### 웹: 주석 갱신

`popularStrip.js:2`의 "지금 목록에 남은 브랜드 중"을 "카테고리를 뺀 나머지 필터를 건 목록"으로 고친다. `PopularDock.jsx` 머리 주석에 카테고리와 무관하다는 한 줄을 더한다. 옛 문구가 남으면 다음 사람이 도로 되돌린다.

### 하지 않는 것

- 섹션(컴포넌트) 분리. 입력 목록 하나만 바꾸면 끝나서 분리의 이득이 없다.
- API 변경. `popularityToday`는 이미 전 브랜드에 실려 온다.
- 새 문구, 새 이벤트. 없다(`COPY-STYLE`, `ALLOWED_EVENTS` 변경 없음).

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`의 묶음 중 닿는 곳은 없다. 확실성(1번)은 정렬 판정이고 이번 변경은 순위 입력이다. 배너 모양(2번), 행동 이벤트(7번)도 건드리지 않는다. 다만 문서에 없는 묶음이 하나 있다.

- 도크 입력 · `pinPopular` 입력 · `popRanks` 입력이 같은 순위표를 읽어야 한다. 한쪽만 고치면 도크와 카드 순번이 어긋난다. 위 변경은 셋을 한 번에 바꾼다. 테스트가 이 셋을 맞댄다(아래).
- 웹만 바꾸는 변경이라 배포 순서(8번) 문제가 없다. 웹 변경은 프리뷰 먼저다(`docs/WORKFLOW.md` §3-3).

## 테스트

테스트 파일은 새로 만들지 않는다(`web/package.json`의 `test` 건드리지 않음). 구현자는 새 테스트 이름이 출력에 나오는지 본다.

- `filters.test.js`
  - 상위 5가 치킨·피자인 목록에서 카테고리를 패스트푸드로 걸어도 `popularToday(rankBrands)` 입력이 같다. `applyFilters(brands, {...f, categories: new Set()})`가 카테고리 선택과 무관하게 같은 결과를 내는지를 박는다.
  - `pinPopular`: 카테고리가 있으면 입력을 그대로 돌려준다. 카테고리가 없으면 `rankBrands`의 상위 5를 앞에 세운다.
- 부재를 주장하기 전에 양성 신호부터: 실패하는 테스트를 먼저 본다. 고치기 전 코드에서 "패스트푸드 선택 시 도크 후보가 3곳 미만"이 재현되는지 확인한 뒤 고친다. 재현이 안 되면 원인을 잘못 짚은 것이다.
- 순번과 도크의 일치를 한 테스트로 박는다. 같은 입력에서 도크가 보이는 순위와 카드에 붙는 순번이 같은 이름에서 같다. `App.jsx` 안의 `useMemo`라 바로 테스트하기 어려우면 순번 계산을 `popularStrip.js`의 순수 함수(`cardRanks`)로 빼서 그것을 테스트한다.
- 360px 스크린샷(필수): 치킨 선택, 패스트푸드 선택, 전체 세 장에서 HOT 줄이 모두 떠 있고 1위가 같은지 본다.

## 열린 질문

1. **검색 중에도 순위를 유지할까?** 지금 설계는 검색어를 건 채 계산한다. 검색 결과가 3곳 미만이면 도크가 또 사라진다. 이슈는 카테고리만 말했으므로 이번에는 두지만, 같은 증상이 검색에서 난다. 검색도 뗄지 개발자가 정한다. 떼는 경우 `rankBrands`의 `{ ...filters, categories: new Set() }`에 `search: ''`만 더하면 된다.
2. **카테고리 선택 시 카드 맨 앞 고정을 하지 않아도 되나?** 지금 설계는 하지 않는다. 카테고리 안의 HOT 브랜드를 맨 앞에 두는 쪽이 낫다면 알려 달라.
