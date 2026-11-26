# 혜택 칩 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 분류 줄에 네이버페이, 포장, 적립, 자사 행사 칩을 더한다. `?c=<키>` 주소로 그 칩을 고른 채 연다.

**Architecture:**
- 서버는 배너에서 세운 오퍼에 `via`와 `channel` 두 칸을 싣는다.
- 웹은 이미 있는 특수 칩 장치(`SPECIAL_CATEGORIES`, `SPECIAL_MATCH`)에 키 넷을 더한다.
- 주소의 `c` 값으로 칩 하나를 미리 고른다.

**Tech Stack:** Spring Boot 4.1 + Jackson 3 (api, `./gradlew test`), React + Vite + node:test (web, `npm test`)

**Spec:** `docs/superpowers/specs/2026-11-26-benefit-chips-design.md`

## Global Constraints

- 신규 판정, 최고 할인 비교, 알림 규칙은 바꾸지 않는다. `via`와 `channel`은 표시와 거르기에만 쓴다.
- 칩 이름은 "네이버페이", "포장", "적립", "자사 행사"이고, 키는 `naverpay`, `pickup`, `reward`, `own`이다.
- 칩 순서: 한정, 랜덤, 네이버페이, 포장, 적립, 자사 행사.
- 메뉴 바는 칩을 하나만 고른다.
- 웹 변경은 프리뷰(`preview/benefit-chips`)를 거친다. PR은 병합하지 않고 사용자 승인을 기다린다.
- mono는 공개 저장소다. 호스트, 계정, 내부 경로를 적지 않는다.
- 새 `web/src/*.test.js` 파일은 만들지 않는다. 있는 `filters.test.js`에 더한다.

## Review Focus

1. 칩 키가 `brands.yml`의 분류 키와 겹치면 그 분류 탭이 특수 칩처럼 동작한다. 겹치지 않음을 테스트로 박는다(Task 2).
2. `?c=`에 모르는 값(`?c=<script>`, `?c=chicken`)이 오면 무시하고 기본 화면이어야 한다(Task 3).
3. 적립 칩은 `kind`가 `cashback`인 오퍼와 `points`인 오퍼를 둘 다 잡아야 한다(Task 2).
4. 포장 칩은 원장 오퍼의 구간 `channel`이 "포장"인 것도 잡아야 한다. 배너만 보면 안 된다(Task 2).
5. 칩을 누르거나 풀 때 주소의 다른 값(`from=share`, 해시)이 사라지면 안 된다(Task 3).

---

### Task 1: api: 배너 오퍼에 `via`, `channel` 싣기

**Files:**
- Modify: `api/src/main/java/com/discounttracker/offer/OfferRecord.java` (record 끝에 칸 2개, Builder)
- Modify: `api/src/main/java/com/discounttracker/offer/Offer.java` (record 끝에 칸 2개. `from`과 `new Offer(` 7곳이 값을 넘긴다)
- Modify: `api/src/main/java/com/discounttracker/banner/BannerOffers.java` (`common`)
- Modify: `api/src/test/resources/contracts/offer-cases.json` (`offerKeys`에 `channel`, `via`를 가나다순으로)
- Test: `api/src/test/java/com/discounttracker/banner/BannerOffersViaTest.java` (새 파일)

**Interfaces:**
- Produces: JSON 오퍼 칸 `via`(string|null)와 `channel`(string|null).

- [ ] **Step 1: 실패하는 테스트 쓰기.** 빌더로 `platform("own")`, `via("naverpay")`, 포장 채널 spec, `amountSpec` 50% points 배너를 만든다. 빌더 쓰는 법은 `BannerBuilderTest.java`를 본다. 그 배너로 `BannerOffers.of(List.of(banner), clock)`을 부르고, 이어서 `Offer.from(record, today)`를 부른다. 결과가 `via() == "naverpay"`, `channel() == "포장"`인지 본다. 원장식 `OfferRecord.builder("baemin","BBQ").build()`에서 만든 오퍼는 `via`와 `channel`이 null인지도 본다.
- [ ] **Step 2:** `cd api && ./gradlew test --tests '*BannerOffersViaTest*'`를 돌린다. 기대: 컴파일 실패.
- [ ] **Step 3: 구현.**
  - `OfferRecord`의 `capturedOn` 뒤에 `String via, String channel`을 더한다. 주석은 "배너에서만 채운다. 원장 export.json에는 없는 키라 null이다"로 단다.
  - Builder에 `via(String)`와 `channel(String)`을 더하고 `build()`에 넘긴다.
  - `Offer`의 `capturedOn` 뒤에 `String via, String channel`을 더한다. `from`에서는 `r.via(), r.channel()`을 넘긴다.
  - 나머지 `new Offer(` 자리(`grep -rn "new Offer(" api/src`)는 복사본을 만드는 곳이니 원래 값의 `via(), channel()`을 그대로 넘긴다. 테스트 쪽 생성자 호출은 `null, null`을 넘긴다.
  - `BannerOffers.common`에 `.via(banner.via()).channel(banner.spec() == null ? null : banner.spec().channel())`를 더한다.
  - `offer-cases.json`의 `offerKeys`에 두 키를 넣는다.
- [ ] **Step 4:** `./gradlew test`(전체)를 돌린다. 기대: 통과. `OfferContractTest`가 다른 계약 사본을 요구하면 메시지대로 맞춘다.
- [ ] **Step 5: 커밋.** `git commit -F msg -- <위 파일들>`. 메시지는 `feat(api): 배너 오퍼에 via와 channel을 싣는다`.

### Task 2: web: 특수 칩 넷 더하기

**Files:**
- Modify: `web/src/filters.js:32-40` (`SPECIAL_CATEGORIES`, `SPECIAL_MATCH`)
- Modify: `web/src/offerContract.test.js` (계약에서 `offerKeys`를 읽으면 그대로 통과하는지만 확인)
- Test: `web/src/filters.test.js`

**Interfaces:**
- Consumes: 오퍼 칸 `via`, `channel`, `kind`, `platform`, `tiers[].channel`
- Produces: `SPECIAL_CATEGORIES` 키 `naverpay|pickup|reward|own`, `isSpecialCategory(key)`

- [ ] **Step 1: 실패하는 테스트.** `filters.test.js`에 아래를 더한다(그 파일의 import 방식을 따른다).

```js
test('혜택 칩은 맞는 오퍼만 남긴다', () => {
  const o = (x) => ({ platform: 'baemin', amount: 3000, ...x })
  const brands = [
    { brand: 'A', category: 'cafe', offers: [o({ platform: 'own', via: 'naverpay', kind: 'points', percent: 50 })] },
    { brand: 'B', category: 'pizza', offers: [o({ tiers: [{ amount: 3000, channel: '포장' }] })] },
    { brand: 'C', category: 'chicken', offers: [o({ kind: 'cashback', platform: 'own' })] },
    { brand: 'D', category: 'chicken', offers: [o({})] },
  ]
  const pick = (key) => applyFilters(brands, { ...defaultFilters(), categories: new Set([key]) }).map((b) => b.brand)
  assert.deepEqual(pick('naverpay'), ['A'])
  assert.deepEqual(pick('pickup'), ['B'])
  assert.deepEqual(pick('reward').sort(), ['A', 'C'])
  assert.deepEqual(pick('own').sort(), ['A', 'C'])
})

test('혜택 칩 키는 분류 키와 겹치지 않는다', () => {
  const cats = new Set(CATEGORIES.map((c) => c.key))
  for (const c of SPECIAL_CATEGORIES) assert.ok(!cats.has(c.key), c.key)
  assert.deepEqual(SPECIAL_CATEGORIES.map((c) => c.label), ['한정', '랜덤', '네이버페이', '포장', '적립', '자사 행사'])
})
```

  `applyFilters`가 플랫폼 필터로 `own`을 빼면, 기본 필터의 `platforms`에 own이 들어 있는지 먼저 본다. 들어 있지 않으면 테스트에서 `platforms`에 own을 넣지 말고 실제 동작을 맞춘다. 자사 오퍼가 지금 홈에 보이는 규칙이 정답이다.
- [ ] **Step 2:** `cd web && node --test src/filters.test.js`를 돌린다. 기대: 실패.
- [ ] **Step 3: 구현.**

```js
export const SPECIAL_CATEGORIES = [
  { key: 'firstCome', label: '한정' },
  { key: 'random', label: '랜덤' },
  { key: 'naverpay', label: '네이버페이' },
  { key: 'pickup', label: '포장' },
  { key: 'reward', label: '적립' },
  { key: 'own', label: '자사 행사' },
]
const SPECIAL_MATCH = {
  random: (o) => certaintyOf(o) === 'random',
  firstCome: (o) => o.firstCome === true,
  naverpay: (o) => o.via === 'naverpay',
  pickup: (o) => o.channel === '포장' || (o.tiers ?? []).some((t) => t.channel === '포장'),
  reward: (o) => kindOf(o) === 'cashback' || kindOf(o) === 'points',
  own: (o) => o.platform === OWN,
}
```

  `kindOf`는 `SPECIAL_MATCH`보다 아래에 정의돼 있지만 function 선언이라 끌어올려진다. 화살표 안에서 부르므로 문제없다.
- [ ] **Step 4:** `npm test`를 돌린다. 기대: 전부 통과. `offerContract.test.js`가 웹이 안 읽는 칸 목록(`unreadByWeb`)을 요구하면, 웹이 `via`와 `channel`을 읽으므로 거기에 넣지 않는다.
- [ ] **Step 5: 커밋.** 메시지는 `feat(web): 네이버페이, 포장, 적립, 자사 행사 칩`.

### Task 3: web: `?c=` 주소로 칩 열기

**Files:**
- Modify: `web/src/filters.js` (함수 `categoryFromSearch`, `searchWithCategory`)
- Modify: `web/src/App.jsx` (첫 렌더 뒤 읽기, `homePhoto`를 읽는 useEffect 옆)
- Modify: `web/src/TopBarB.jsx:95-98` (`toggleCategory` 안에서 주소 맞추기)
- Test: `web/src/filters.test.js`

**Interfaces:**
- Produces:
  - `categoryFromSearch(search: string): string|null` 돌려주는 값은 특수 칩 키이거나 null이다.
  - `searchWithCategory(search: string, key: string|null): string` 돌려주는 값은 앞에 `?`가 붙은 문자열이거나 빈 문자열이다.

- [ ] **Step 1: 실패하는 테스트.**

```js
test('?c=는 아는 특수 칩만 받는다', () => {
  assert.equal(categoryFromSearch('?c=naverpay'), 'naverpay')
  assert.equal(categoryFromSearch('?c=chicken'), null)
  assert.equal(categoryFromSearch('?c=%3Cscript%3E'), null)
  assert.equal(categoryFromSearch(''), null)
})

test('칩 주소는 다른 검색 값을 남긴다', () => {
  assert.equal(searchWithCategory('?from=share', 'pickup'), '?from=share&c=pickup')
  assert.equal(searchWithCategory('?from=share&c=pickup', null), '?from=share')
  assert.equal(searchWithCategory('?c=own', null), '')
})
```

- [ ] **Step 2:** `node --test src/filters.test.js`를 돌린다. 기대: 실패.
- [ ] **Step 3: 구현.**

```js
/** 주소 ?c=로 혜택 칩 하나를 미리 고른다. 분류 칩(치킨 등)은 받지 않는다. 공유 주소용. */
export function categoryFromSearch(search) {
  const key = new URLSearchParams(search).get('c')
  return key && isSpecialCategory(key) ? key : null
}

export function searchWithCategory(search, key) {
  const q = new URLSearchParams(search)
  if (key) q.set('c', key)
  else q.delete('c')
  const s = q.toString()
  return s ? `?${s}` : ''
}
```

  `App.jsx`의 `homePhoto` useEffect 바로 아래에 둔다.

```js
  useEffect(() => {
    try {
      const key = categoryFromSearch(window.location.search)
      if (key) startTransition(() => setFilters((f) => ({ ...f, categories: new Set([key]) })))
    } catch { /* 주소를 못 읽으면 기본 화면 */ }
  }, [])
```

  `TopBarB.toggleCategory`에서는 새 선택을 계산한 뒤 아래를 부른다. 특수 칩일 때만 `c`를 남기고, 분류 칩이거나 해제면 `c`를 지운다. `toggleCategory` 안의 `setFilters` 콜백 밖에서, 계산한 `next` 키로 부른다.

```js
history.replaceState(history.state, '', `${location.pathname}${searchWithCategory(location.search, isSpecialCategory(next) ? next : null)}${location.hash}`)
```

  '전체' 버튼 onClick에서도 `searchWithCategory(location.search, null)`로 같은 호출을 한다.
- [ ] **Step 4:** `npm test`, 이어서 `npm run build`를 돌린다. 기대: 통과.
- [ ] **Step 5: 커밋.** 메시지는 `feat(web): ?c= 주소로 혜택 칩을 연다`.

### Task 4: 프리뷰와 PR

- [ ] `git push -u origin feat/benefit-chips`, 이어서 `git push origin feat/benefit-chips:preview/benefit-chips`를 한다. 둘 다 Bash 단독 명령이다.
- [ ] PR은 main 대상으로 연다. 본문은 `pr-body-ko` 스킬로 쓰고, 다음을 넣는다.
  - 배포 순서: api 먼저.
  - 레퍼런스 배너 두 줄은 ops에서 넣어야 한다(spec 6절).
- [ ] `@coderabbitai review`를 한 번 단다.
- [ ] CI를 기다린다. 병합하지 않는다.
- [ ] 360px 확인: 로컬 `npm run dev`에서 헤드리스로 `/?c=naverpay`를 찍는다. 다 찍으면 서버와 브라우저를 끈다.

## 콜드 리뷰 반영 (2026-11-26, 위 태스크보다 이쪽이 이긴다)

1. **Task 1:** `offer-cases.json`의 `offerKeys`뿐 아니라 모든 `cases[].offer`에 `"via": null, "channel": null`을 넣는다. `note`에도 한 줄 적는다. api `OfferContractTest`(63행)와 웹 `offerContract.test.js`(35행)가 통째로 견주기 때문이다.
2. **Task 1b (tracker):** 고친 정본을 tracker `contracts/offer-cases.json`에 바이트 그대로 복사한다(`cp`). tracker 브랜치와 PR로 올리고 `tests/test_contract_copy.py`를 돌린다. 순서는 정본, tracker 사본, 웹이다.
3. **Task 3:** `TopBarB`에서는 주소를 고치지 않는다.
   - 대신 `App.jsx`에 effect 하나를 둔다. `filters.categories`가 바뀌면, 특수 칩 하나만 골랐을 때 그 키로, 아니면 null로 `searchWithCategory`를 부르고 `replaceState`한다. `history.state`와 해시는 그대로 둔다.
   - 첫 렌더의 `?c=` 읽기를 마치기 전에는 쓰지 않도록 ref 표시를 둔다.
4. `visibleCategories`와 `applyFilters` 466행의 "한정, 랜덤" 주석을 새 칩까지 뜻하도록 고친다. `DiscountTier`의 생성자는 건드리지 않는다.
5. 프리뷰에서 `web/src/shells/my-brands-v2` 화면을 한 번 본다. 이 화면은 `offer.via`를 읽는다(61행, 88행).
