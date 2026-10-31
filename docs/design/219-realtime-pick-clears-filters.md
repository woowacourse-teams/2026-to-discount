# 219 실시간 순위에서 다른 분류 브랜드를 눌러도 카드로 이동

이슈: [#219](https://github.com/woowacourse-teams/2026-to-discount/issues/219). 웹만 바꾼다. API 변경 없음.

## 결론

순위(HOT 도크)에서 브랜드를 고르면, 지금 걸린 분류나 검색 때문에 그 카드가 목록에 없을 때 **그 조건을 상태에서 실제로 지운 뒤** 카드로 이동한다. 어떤 조건을 지워도 카드가 안 서는 경우는 이동 대신 안내를 띄운다.

- 판정은 순수 함수 하나(`filters.js`의 `revealFilters`)로 뺀다. `App.jsx`의 `pickPopular`가 부른다.
- 지우는 조건은 분류(`categories`)와 검색(`search`) 둘뿐이다. 플랫폼, 최소금액, 멤버십, 업데이트만, 숨김은 건드리지 않는다(아래 "플랫폼과 숨김").
- 분류가 전체이고 검색이 비어 있으면 지금 동작 그대로다.

## 배경

이슈 원인이 코드와 맞다(코드 읽기로 확인, 화면 재현은 구현자가 먼저 한다).

- `rankBrands`(`App.jsx:422`)는 `categories`를 비우고 `search`를 `''`로 둔 필터로 만든다(#147).
- 카드 목록 `visibleBrands`(`App.jsx:428`)는 `filters` 전체를 쓴다.
- `pickPopular`(`App.jsx:298`)는 `linkedBrand`만 세운다. 카드의 `highlighted`와 `scrollIntoView`(`CouponCard.jsx:370~375`)는 그 카드가 그려질 때만 일어난다.
- 그래서 피자 분류나 검색이 걸린 채 치킨 브랜드를 누르면 그려진 카드가 없어, 스크롤도 펼침도 조용히 사라진다.
- "더 보기" 묶음에 가린 카드는 `App.jsx:455~459`가 `shown`을 늘려 풀어 준다. 목록에 없는 카드는 풀 수 없다.

## 변경

### 웹: `web/src/filters.js`에 `revealFilters` 추가

```js
/**
 * 순위에서 고른 브랜드가 카드로 서게 하는 가장 작은 필터 변경.
 * listFor(f)는 필터 f로 그려질 카드 이름 목록(숨김까지 적용한 것)을 돌려준다.
 * 돌려주는 값: { filters, cleared: [] | ['category'] | ['search'] | ['category','search'] } 또는 null(어떻게 해도 안 섬).
 */
export function revealFilters(filters, name, listFor) {
  const has = (f) => listFor(f).includes(name)
  if (has(filters)) return { filters, cleared: [] }
  const noCategory = { ...filters, categories: new Set() }
  const noSearch = { ...filters, search: '' }
  const neither = { ...noCategory, search: '' }
  if (filters.categories.size > 0 && has(noCategory)) return { filters: noCategory, cleared: ['category'] }
  if (filters.search.trim() !== '' && has(noSearch)) return { filters: noSearch, cleared: ['search'] }
  if (has(neither)) return { filters: neither, cleared: ['category', 'search'] }
  return null
}
```

- 후보를 분류만, 검색만, 둘 다 순서로 시험해 **가장 적게 지운다**. 분류만 풀어도 서면 검색은 남긴다.
- 검색만 푸는 후보는 분류가 그 브랜드를 담을 때(예: 치킨 분류에서 검색어에 안 걸린 치킨 브랜드)에 쓰인다.
- 순수 함수라 `App.jsx`의 `useMemo`를 건드리지 않고 `filters.test.js`에서 검증한다.

### 웹: `web/src/App.jsx`의 `pickPopular`

```js
const pickPopular = (name) => {
  const target = revealFilters(filters, name,
    (f) => applyHidden(applyFilters(brands, f), hidden, bestOf).map((b) => b.name))
  if (!target) { setPickNotice(true); return }
  if (target.cleared.length > 0) setFilters(target.filters)
  setLinkedBrand(null)
  requestAnimationFrame(() => setLinkedBrand(brandCardId(name)))
}
```

- `brands`가 `null`(불러오는 중)이면 도크가 안 그려지므로 호출되지 않는다. 구현자가 방어 한 줄을 둘지 정한다.
- `setFilters`를 부른 렌더에서 `gridKey`가 바뀌어 `shown`이 처음으로 돌아가고 격자가 새로 마운트된다. 그 뒤 `requestAnimationFrame`으로 세운 `linkedBrand`를 `App.jsx:455` 효과가 받아 `shown`을 그 카드 자리까지 늘린다. 효과 순서(초기화 → 확장)는 지금 코드 그대로 맞는다.
- 검색을 지우면 `search` 상태가 비는 것으로 끝나는지, 검색창 입력 칸의 글자도 같이 비는지 구현자가 360px에서 본다. 입력 칸이 별도 상태를 가지면 같이 비워야 화면과 걸린 조건이 어긋나지 않는다(요구사항).
- 분류를 풀면 이후 `filters`가 바뀌어 `setFilterContext(analyticsFilterContext(filters))`(`App.jsx:336`)가 자동으로 최신 값을 싣는다. 별도 처리 없음.

### 웹: 이동 불가 안내 (`pickNotice`)

`revealFilters`가 `null`이면 이동 대신 이유를 보여 준다. 기존 `shareNotice`(`App.jsx:678`, `role="alert"`)와 같은 자리에 같은 모양으로 둔다. 문구는 새 문구라 세션이 정하지 않는다(`docs/COPY-STYLE.md`, CHANGE-PROPAGATION 6번). 아래는 **제안**이고 개발자 확정을 기다린다.

- 제안 문구: "이 브랜드는 지금 보이는 목록에 없어요. 숨겼거나 데이터가 바뀌었을 수 있어요."
- 사라지는 때: 다음 순위 선택, 필터 변경, 카드 조작 중 먼저 오는 것. 시간 제한은 두지 않는다.

이 경로가 실제로 타는 경우는 좁다. 도크의 브랜드는 `rankBrands`(분류와 검색만 뺀 같은 필터와 숨김 적용)에서 나온다. 그래서 `neither` 후보가 `rankBrands`와 같은 집합이다. 안 서는 경우는 (a) 순위를 그린 뒤 `brands`가 새로 불러와져 브랜드가 빠졌을 때, (b) 이후 숨기기 상태가 바뀌었을 때 정도다. 사용자 요구("어느 경우에도 이동이 안 되면 이유를 볼 수 있어야 한다")를 지키되 구현을 키우지 않는 최소다.

### 플랫폼과 숨김 (요구사항 2번의 답)

플랫폼 토글, 5천원 이상, 멤버십, 업데이트만, 숨김은 `rankBrands`에도 이미 걸려 있다(`App.jsx:423`). 순위에 있다는 것은 이 조건을 통과했다는 뜻이라 카드도 같은 조건을 통과한다. 그래서 이 조건들은 풀지 않는다. 풀면 사용자가 일부러 끈 앱이 다시 켜져 순위에 안 보이던 브랜드가 뜨는, 걸린 조건과 화면이 어긋나는 일이 생긴다.

- 검색이 걸려 있을 때 `applyFilters`는 5천원 거르기를 건너뛴다(`filters.js:355`). 검색을 지우면 5천원 거르기가 다시 걸리지만, 순위의 브랜드는 이미 `search: ''`로 그 거르기를 통과했다. 그래서 검색을 지워도 카드는 남는다. 시험으로 박는다(아래).

### 하지 않는 것

- 해시 딥링크(`#brand-이름`)로 들어온 경우의 같은 문제. `applyHash`(`App.jsx:241`)는 필터를 안 건드린다. 이슈 범위가 순위 선택이라 이번에는 두고 열린 질문 1에 둔다.
- 새 분석 속성. `quick_filter`(`key: popular_dock`)는 그대로 쏜다. 어떤 조건을 풀었는지 싣는 속성은 열린 질문 2에 둔다.
- `rankBrands` 정의 변경. 순위는 계속 분류와 검색에 무관하다(#147).

## 변경 전파 확인 (`docs/CHANGE-PROPAGATION.md`)

- 해당 묶음 없음. 1번 확실성, 2번 배너 모양은 정렬 판정과 배너 모양을 안 건드린다.
- 6번 문구: 안내 문구가 새로 생긴다. 제안일 뿐이고 확정은 개발자다. 확정 전에는 구현자가 문구를 임의로 넣지 않는다.
- 7번 행동 이벤트: 새 이벤트도 새 속성도 없다(열린 질문 2가 아니라면). `ALLOWED_EVENTS`, `verify-analytics-event-contract.mjs` 영향 없음.
- 8번 배포: 웹만이라 순서 제약 없음. 웹 변경은 프리뷰 먼저(`docs/WORKFLOW.md` §3-3).
- 9번 새 파일: 새 파일 없음. 테스트는 이미 `test` 사슬에 있는 `filters.test.js`에 더한다.
- 같이 움직이는 암묵 묶음: `rankBrands`의 필터 정의(`categories` 비움, `search` 비움)와 `revealFilters`가 푸는 조건이 같아야 한다. 한쪽만 바꾸면(예: 순위에서 다른 조건도 뗌) 순위에는 있는데 이동이 안 되는 브랜드가 생긴다. `rankBrands` 주석에 이 관계를 한 줄 적는다.
- #147 설계, #201 설계(`pinPopular`, 카드 순번 삭제)는 당시 기록으로 두고 고치지 않는다. 이번 변경은 `rankBrands`를 안 바꾼다.

## 테스트

`web/src/filters.test.js`에 더한다(새 파일 없음). 먼저 현재 동작을 재현한다.

- 재현(고치기 전): 피자 분류를 건 `applyFilters(brands, f)`에 치킨 브랜드가 없고, `categories: new Set(), search: ''`로 만든 순위 목록에는 있다. 이 차이가 안 나오면 원인을 잘못 짚은 것이다. 구현자는 이 재현을 먼저 출력으로 본다.
- `revealFilters`
  - 분류 피자 + 치킨 브랜드: `cleared`가 `['category']`이고 `filters.categories.size === 0`이다.
  - 검색어가 걸린 채 검색에 안 걸리는 브랜드: `cleared`가 `['search']`이고 `filters.search === ''`이다.
  - 분류와 검색이 둘 다 걸려 둘 다 풀어야 서는 경우: `['category','search']`.
  - 분류 치킨 + 검색어, 분류만 풀어서 서는 경우: 검색은 남는다(가장 적게 지움).
  - 분류 전체, 검색 빔, 브랜드가 목록에 있음: `cleared`가 `[]`이고 `filters`가 같은 객체다(기존 동작 그대로).
  - 어떻게 해도 안 서면 `null`.
  - 검색 중 5천원 미만 오퍼만 보이던 브랜드를 순위에서 골라 검색을 지워도 서는지(5천원 거르기 재개 시험).
  - 양성 신호: `listFor`는 실제 `applyFilters`와 `applyHidden`을 쓰는 형태로 시험해, 가짜 목록만으로 초록이 되지 않게 한다.
- `App.jsx` 조립(`setFilters` 뒤 이동)은 단위로 못 잡는다. 아래 스크린샷이 맡는다.

실행: `cd web && npm test`. 새 시험 이름이 출력에 나오는지 본다.

## 확인 (구현자)

- 360px 스크린샷(필수, PR에 남김)
  - 피자 분류를 켠 채 순위의 치킨 브랜드를 누름: 분류 칩이 사라지고 그 카드가 가운데로 오며 강조 테두리가 선다.
  - 검색어를 확정한 채 순위의 다른 브랜드를 누름: 검색창이 비고 그 카드로 간다.
  - 분류 전체에서 순위 브랜드를 누름: 변경 전과 같은 동작.
  - 목록 아래쪽(12장 뒤)에 있는 브랜드: 카드가 펼쳐져 이동한다.
- 같은 브랜드를 두 번 연달아 눌러도 두 번째에 다시 이동한다(`pickPopular`의 한 번 비우기 유지).
- 안내 경로는 시험용으로 `brands`를 비우는 식의 조작이 어렵다. 구현자가 재현이 어려우면 어렵다고 PR 확인 절에 `미확인`으로 적는다.

## 열린 질문

1. 해시 딥링크(`#brand-이름`)로 진입했는데 분류가 걸려 카드가 없는 경우도 같은 규칙으로 풀까? 이번에는 순위 선택만 다룬다.
2. 어떤 조건을 풀었는지 `quick_filter` 이벤트에 속성(`cleared`)으로 실을까? 새 속성이라 `docs/ANALYTICS.md` 갱신이 따른다. 기본은 싣지 않는다.
3. 이동 불가 안내 문구는 위 제안으로 갈까, 다른 문구가 있을까?
4. 분류나 검색을 풀 때 "분류를 풀었어요" 같은 알림은 두지 않는다(`submitSearch` 선례). 이대로 둬도 되는가.
