# Task 8 보고: 배너에서 오퍼를 만드는 길이 문장을 안 읽는다

## 상태: DONE

커밋: (아래 "커밋" 절 참고, 이 문서는 커밋 직전에 작성했다)

## 한 일

1. `BrandComparisonService.bannerRecords()`를 브리프대로 다시 썼다 — `banners.activeMembers()`를
   돌며 브랜드가 있고 구조 칸(`amount:`)이 있는 배너만 레코드로 만든다. 묶음(`group:`)은 접지
   않고 구성원마다 오퍼가 선다. `platform: own` 배너도 더는 거르지 않는다.
2. `qualifierOf(Banner)` 다리 메서드를 추가했다 — 배너 칸에서 정한 `Certainty`를 원장 qualifier
   문자열로 돌려 적어 `Offer.from`이 `Certainty.fromQualifier`로 되짚게 한다. `Task 19`가
   `OfferRecord`에 확실성을 직접 실으면 이 다리는 사라진다(주석에 남겨둠).
3. `bannerQualifier`/`isRandom`/`isTargeted`/`bannerConditions`와 상수
   `BANNER_QUALIFIER`/`CUMULATIVE_QUALIFIER`/`MAX_QUALIFIER`/`RANDOM_QUALIFIER`/`TARGETED_MARK`/
   `LIMITED_MARK`/`MENU_LIMITED_SORTING_AMOUNT`, `confirmedSortingAmount(Offer)`를 지웠다.
   `compare(records)`의 정렬 기여금액은 `OfferComparison.sortingAmount(certainty, amount)`로,
   랜덤 슬롯 분리는 `offer.certainty() == Certainty.RANDOM`으로 바꿨다.
4. `BannerText`를 `public`으로 열고 `conditions(Banner)` 메서드도 `public`으로 바꿨다
   (브리프 지시).
5. **브리프에 없던 항목 — 직접 추가**: 배너 오퍼와 원장 오퍼가 같은 (브랜드, 플랫폼) 자리에서
   확실성이 어긋나면 `log.warn(...)`을 남기도록 `compare(records)`에 추가했다. 컨텍스트가
   "브리프에 없으면 추가하고 보고하라"고 명시한 요구사항이다. `BannerOfferCertaintyTest`에
   logback `ListAppender`로 실제 경고가 찍히는지 확인하는 테스트를 하나 더 넣었다.

## 브리프에서 벗어난 지점 (이유 포함)

- **`new OfferRepository()` / `new BrandCatalog()`(무인자)**: 브리프의 테스트 원문이 이렇게
  썼는데 두 클래스 모두 `Resource`를 요구하는 생성자 하나뿐이라 컴파일이 안 된다. 기존
  테스트들이 쓰는 자리(`new OfferRepository(null)`, `new BrandCatalog(new
  ByteArrayResource("brands: {}"...))`)로 바꿔 썼다. 프로덕션 클래스는 안 건드렸다.
- **`if (amount == null) continue;` 제거**: 브리프 코드 그대로 쓰면 정률(`percent`) 배너는
  대표 정액(`headline()`)이 항상 null이라 전부 걸러져, 브리프가 준 테스트
  `ownBannerNowStandsAsAnOffer`(50% 캐시백 자사 배너)가 카드에 하나도 안 선다 — Step 4의
  "5건 PASS" 기대와 정면으로 어긋났다. 가드를 `banner.amountSpec() == null`(구조 칸 자체가
  없을 때만 제외)로 좁혔다. 정률 배너는 이제 `amount` null인 채 카드에는 서고, 최고 할인
  비교에는 (`offer.amount() != null` 체크가 걸러) 안 들어간다.
- **`Certainty.fromQualifier`에 `"정률" -> PERCENT` 케이스 추가**: 브리프의 `qualifierOf`는
  `CAPPED`와 `PERCENT`를 똑같이 `"최대"`로 적었는데, `Certainty.fromQualifier`는 `"최대"`를
  무조건 `CAPPED`로만 되짚는다(정률로 돌아올 문자열이 아예 없었다). 그러면 정률 배너 오퍼의
  `certainty()`가 CAPPED로 뭉개져 위 테스트가 실패한다. `Certainty.java`에 `"정률" -> PERCENT`
  한 줄을 더하고 `qualifierOf`가 PERCENT는 `"정률"`로 따로 적게 했다. 원장(schema.py)은 이
  qualifier를 절대 안 보내므로 기존 `CertaintyTest`의 어떤 기대도 안 건드린다.

## 회귀 확인 (Task 6이 남긴 `limit: random` 문제)

`BannerCatalog`가 5인자 `BannerSpec`을 쓰게 되면서 `spec().limit()`이 항상 null이 됐고, 옛
`isRandom()`은 그걸 먼저 봤다 — 문구에 "랜덤"이 없는 구조 필드 랜덤 배너가 표식을 잃는
회귀였다. 이번 재작성으로 `isRandom` 자체가 사라지고 `qualifierOf`가 `banner.amountSpec()
.certainty()`(구조 필드 `random: true`)만 본다. 증명:
- `BannerOfferCertaintyTest.randomBeatsCapped` — "랜덤"이라는 글자가 텍스트 어디에도 없는
  배너(`amount: {won: [null, 7000], random: true}`, `period`/`extra` 없음)가 `Certainty.RANDOM`을
  낸다.
- `BrandComparisonServiceTest.aBundleBannerPutsAnOfferOnEveryBrandWithItsOwnAmount`를
  `extra: 랜덤` 땜질을 걷어내고 `group:`로 묶은 두 배너(둘 다 텍스트에 "랜덤" 없음)로
  다시 써서, 여전히 둘 다 qualifier `"랜덤"`을 내는 것으로 확인했다.

## 테스트

- 내 태스크 테스트: `cd api && ./gradlew test --tests
  com.discounttracker.comparison.BannerOfferCertaintyTest` — PASS (6/6, 브리프의 5건 + 경고
  로그 1건).
- 전체 API 스위트: `cd api && ./gradlew test` — PASS (304/304, 실패·에러 0).

## 자기 검토에서 걸린 것들

- `BrandComparisonServiceTest`/`TargetedBannerTest`의 배너 픽스처를 전부 구조 칸(`amount:
  {won:...}`/`{percent:...}`) 모양으로 바꿨다. 옛 복합쿠폰("6,500원(4,000+10%)" 겹침,
  `tierMode: cumulative`, qualifier `"최적"`) 시나리오는 새 구조 필드에 대응이 없어(
  `Banner.compoundTiers()`/`brandAmounts()`를 더는 안 부른다 — 컨트롤러 판단이 "불러도 되지만
  안 지운다"였다) 관련 단언을 `qualifier() == null`/`tiers() == null`로 고쳤다.
- `dropsBannersThatCannotStandAsAnOffer` 테스트의 필터를 옛 qualifier 문자열
  (`"행사"`/`"최적"`) 대신 `certainty() == EXACT`로 바꿨다 — "행사" 표식 자체가 이제
  `Offer.fromBanner()`와 중복이라 사라졌기 때문이다.
- `banners.yml`(리소스 예시 파일)은 `banners: []`뿐이라 이번 변경의 영향이 없지만, 실제
  배포된 `banners.yml`(jar 밖 파일)이 아직 옛 문장 모양(`amount: "8,000원"`)만 쓰고 있다면
  이번 배포 이후 그 배너들은 카드에 안 선다 — 구조 칸으로 옮겨야 한다. 이 마이그레이션은
  이 태스크 범위 밖이라 손대지 않았다(브리프 뒷부분 "2단계. 보관과 변환"이 다룰 것으로
  보인다).

## 손댄 파일

- Modify: `api/src/main/java/com/discounttracker/comparison/BrandComparisonService.java`
- Modify: `api/src/main/java/com/discounttracker/banner/BannerText.java` (public 전환, 브리프 지시)
- Modify: `api/src/main/java/com/discounttracker/offer/Certainty.java` (브리프 밖, 위 사유)
- Modify: `api/src/test/java/com/discounttracker/comparison/BrandComparisonServiceTest.java`
- Modify: `api/src/test/java/com/discounttracker/comparison/TargetedBannerTest.java`
- Create: `api/src/test/java/com/discounttracker/comparison/BannerOfferCertaintyTest.java`

---

# Fix round 1

## Critical — own banner 최고 할인 오염

1. `OfferRecord`에 `kind`(원문 "discount"/"cashback"/"points") 칸을 더했다 - membership과 같은
   패턴(원장은 raw string, `Offer.from`이 `AmountKind.from`으로 정규화). 기존 19칸 호출부가 전부
   안 깨지게 19칸 보조 생성자를 남겨 `kind=null`(discount)로 위임한다. `BrandComparisonService
   .bannerRecords()`가 `banner.amountSpec().kind().key()`를 채운다.
2. `OfferComparison.isBestCandidate`에 `platform` 인자를 더해(저장값 아님, 매 호출 인자) own을
   거른다. 유일한 호출부 `OfferComparisonTest`는 "baemin"을 넘기게 고쳤다(판정표에 platform 축이
   없으므로 의미가 안 바뀐다).
3. **실제로 새는 자리는 `sortingAmount`가 아니라 `compare(records)`의 maxConfirmed/maxHeld
   적재 조건이었다** - `sortingAmount`는 그대로 두고(지시대로), own 오퍼가 `offer.amount() != null`
   게이트를 못 넘게 `&& !"own".equals(record.platform())`을 더했다. `isBestCandidate`를 이 게이트에
   그대로 꽂으면 MENU_ONLY가 4,999원을 못 내는 기존 통과 테스트가 깨져서(그 값은 EXACT가 아니다),
   두 축을 안 섞었다.

증명(`BrandComparisonService.compare()`를 직접 타는 경로로 - `OfferComparison` 직접 호출 아님):
`BannerOfferCertaintyTest.ownBannerNeverFeedsTheBestDiscountComparison` — own `{won: 5000}`이
카드의 오퍼(`offers().get(0).amount() == 5000`)로는 서지만 `card.maxConfirmedAmount()`는 null.
`ownBannerCarriesItsRealAmountKind` — own `{won: 3000, kind: cashback}`의 `offer.kind() ==
CASHBACK`.

## Important 4건

- **정률 배너 "금액 미확인"**: `bannerRecords()`가 `amountSpec.percent() != null`이면 badge를
  `"{percent}%할인"`(공백 없음)으로 채운다. `BannerOfferCertaintyTest
  .percentBannerGetsARateBadgeInsteadOfANullAmount`가 `"30%할인"`을 정확히 확인한다.
- **`dropsBannersThatCannotStandAsAnOffer` 무의미화**: `fromBanner && certainty==EXACT` 필터를
  버리고, 진짜로 못 서는 두 경우(브랜드 없음, 구조 칸 없는 옛 문장 모양)만 남긴 픽스처로
  다시 썼다 - 셋 중 구조 칸 있는 goobne 하나만 남는지 확인한다.
- **`amountSpec()==null` 가드 무테스트**: `BannerOfferCertaintyTest
  .oldSentenceShapeBannerStaysOnTheRailButNeverBecomesAnOffer` 추가 - 문장만 적은 배너가
  `BannerCatalog.active()`(레일)에는 뜨고 `compare()`(카드)에는 안 서는 것을 확인한다.
- **경고 로그 테스트가 스텁을 못 잡음**: `warningMessages(...)` 헬퍼로 네 가지를 갈랐다 -
  배너/원장 불일치(경고 1건, 메시지에 배너 id `bhc-exact-20260922`와 브랜드 `bhc` 둘 다 포함),
  일치(0건), 배너-배너(0건), 원장-원장(0건). 로그에 배너 id를 실으려고 `OfferRecord.section`
  자리(원장 레코드는 안 쓰고 `Offer.from`도 안 실어 나르는 칸)를 배너 id로 채우고,
  `compare(records)`에 슬롯별 "마지막으로 본 배너 id" 맵을 하나 더 들어 어느 쪽이 배너였든
  id를 찾게 했다.

## Minor 3건

- `qualifierOf`의 `case MENU_ONLY -> "특정메뉴"`를 지웠다 - `BannerAmount.certainty()`는
  EXACT/CAPPED/RANDOM/PERCENT만 내서 도달 불가능한 분기였다. `default -> null`로 EXACT와
  묶어 스위치는 그대로 완전하다.
- `BannerOfferCertaintyTest.groupMembersEachGetTheirOwnOffer`에 각 구성원 오퍼의 `link()`가
  그 구성원 자신의 url인지(묶음 대표 url이 아닌지) 확인하는 줄을 더했다.
- `api/src/main/resources/banners.yml` 헤더의 `platform`/`amount` 설명 두 군데를 고쳤다 -
  own도 오퍼로는 서지만 최고 할인 후보는 아니라는 것, amount는 구조 칸이 있어야 오퍼로
  선다는 것.

## 테스트

- 태스크 테스트: `cd api && ./gradlew test --tests com.discounttracker.comparison.BannerOfferCertaintyTest --tests com.discounttracker.comparison.BrandComparisonServiceTest --tests com.discounttracker.offer.OfferComparisonTest` — PASS.
- 전체 스위트: `cd api && ./gradlew test` — PASS (311/311, 실패·에러 0. 라운드 1 시작 전 304건이었고 이번에 7건을 더했다).

## 손댄 파일 (라운드 1 추가분)

- Modify: `api/src/main/java/com/discounttracker/comparison/BrandComparisonService.java`
- Modify: `api/src/main/java/com/discounttracker/offer/Offer.java`
- Modify: `api/src/main/java/com/discounttracker/offer/OfferComparison.java`
- Modify: `api/src/main/java/com/discounttracker/offer/OfferRecord.java`
- Modify: `api/src/main/resources/banners.yml`
- Modify: `api/src/test/java/com/discounttracker/comparison/BannerOfferCertaintyTest.java`
- Modify: `api/src/test/java/com/discounttracker/comparison/BrandComparisonServiceTest.java`
- Modify: `api/src/test/java/com/discounttracker/offer/OfferComparisonTest.java`

---

# Fix round 2

## Finding 1 — server rule now lives in exactly one place, and covers kind too

`compare(records)`'s maxConfirmed/maxHeld gate (`BrandComparisonService.java`, the block right
after `offersOnPlatform.merge(slot, offer, Offer::preferredOver);`) now computes:

```java
boolean excludedFromComparison = offer.certainty() == Certainty.EXACT
        && !OfferComparison.isBestCandidate(offer.certainty(), offer.kind(), offer.soldOut(), record.platform());
...
if (offer.amount() != null && !excludedFromComparison) { ... }
```

`OfferComparison.isBestCandidate` (`api/src/main/java/com/discounttracker/offer/OfferComparison.java:44`)
already checked `kind == AmountKind.DISCOUNT` since round 1 — the bug was that nothing in
production called it with a real `platform`. It does now, and it's the only place in main code
(besides its own test) that spells out the own/kind/soldOut rule. The raw `"own"` literal is gone
from `BrandComparisonService`; `Banner.OWN` isn't imported there either since the rule no longer
needs the literal locally — `isBestCandidate` owns it via its own `OWN_PLATFORM` constant. (`banner.platform()`
comparisons elsewhere in `bannerRecords()` now use `Banner.OWN` where a literal was needed.)

**Why the `offer.certainty() == Certainty.EXACT` guard, which isn't in your instruction verbatim:**
`isBestCandidate` requires `certainty == EXACT` internally, so calling it unconditionally as the
sole gate would also swallow `MENU_ONLY` offers, which `sortingAmount` deliberately keeps in
`maxConfirmed` at 4,999원 (`menuLimitedOffersSortJustBelowFiveThousand`, a pre-existing passing
test I'm not authorized to change). `MENU_ONLY` only ever comes from the ledger qualifier
`"특정메뉴"` — never from a banner, never non-discount, never `own` — so this guard costs nothing
in reachable states; I verified by running the full suite both with and without it. The rule
itself is still written exactly once, inside `isBestCandidate`; the guard only decides *when* to
ask it, mirroring how `sortingAmount` already owns the `CAPPED/RANDOM/PERCENT → null` axis. Flagging
this deviation explicitly since you asked for the literal call — happy to remove the guard if you'd
rather `MENU_ONLY` also stop feeding `maxConfirmed`, but that's a separate, unrequested behavior
change and would break the test above.

Test (non-own, non-discount — the exact hole Finding 1 named):
`BannerOfferCertaintyTest.deliveryAppCashbackBannerStandsButIsNeverTheBestCandidate` — `platform:
baemin, amount: {won: 3000, kind: cashback}` stands as the offer (`amount() == 3000`, `kind() ==
CASHBACK`) but `card.maxConfirmedAmount()` is null.

## New breakage (i) — percent badge reverted

Removed the `"{percent}%할인"` badge and the `amountSpec() == null`-only guard's replacement; restored
`banner.period()` unconditionally, and added `if (amountSpec.percent() != null &&
!Banner.OWN.equals(banner.platform())) continue;` right after the `amountSpec == null` check —
delivery-app percent banners no longer become offers at all (pre-Task-8 behavior, no regression),
own percent banners still stand. Comment at the guard says Task 17/18 own showing percent properly.
Replaced the now-wrong test with `deliveryAppPercentBannerNeverBecomesAnOffer` (asserts `compare()`
returns no cards for a baemin percent banner); `ownBannerNowStandsAsAnOffer` (brief's own test,
`{percent: 50, kind: cashback}`, own) still stands and still passes untouched.

## New breakage (ii) — own excluded from maxHeld too, now deliberate

`excludedFromComparison` is computed once and applied to the single `if (offer.amount() != null &&
!excludedFromComparison)` that guards *both* the confirmed and held branches — own/non-discount
EXACT offers now skip both `maxConfirmed` and `maxHeld` uniformly. Comment above the gate says so
and why ("어느 쪽 천장도 그 값으로 정할 수 없다").

## `section` tidy-up

Dropped the dead half of the id-lookup ternary — since `bannerRecords()` always precedes the ledger
in `compare()`, `existing` is always the banner side and `offer` is always the ledger side whenever
the mismatch fires; the log now reads `existing.certainty()`/`offer.certainty()` directly and looks
the id up from `bannerIdsHere` unconditionally. Added a one-line comment at the write site
(`banner.id()` into the `section` slot) noting ADR-006 defines `section` as the on-screen section
title for ledger rows, that banner-born records have no such concept, and that `tracker` can never
emit `offerType == "banner"`, so the two meanings never collide. No new field.

## Tests

- Task tests: `cd api && ./gradlew test --tests com.discounttracker.comparison.BannerOfferCertaintyTest --tests com.discounttracker.comparison.BrandComparisonServiceTest --tests com.discounttracker.offer.OfferComparisonTest` — PASS.
- Full suite: `cd api && ./gradlew test` — PASS (312/312, 0 failures/errors; was 311 before this round).

## Files touched this round

- Modify: `api/src/main/java/com/discounttracker/comparison/BrandComparisonService.java`
- Modify: `api/src/main/resources/banners.yml` (percent/own clause tightened to match the revert)
- Modify: `api/src/test/java/com/discounttracker/comparison/BannerOfferCertaintyTest.java`

## Fix round 3 (2026-09-23)

### 1. Ceiling rule collapsed into one call

Added `OfferComparison.comparisonAmount(Certainty, AmountKind, boolean soldOut, String platform,
Integer amount)` (`api/src/main/java/com/discounttracker/offer/OfferComparison.java`) as the single
entry point: `MENU_ONLY` -> `MENU_LIMITED_SORTING_AMOUNT`; `CAPPED`/`RANDOM`/`PERCENT` -> `null`;
`EXACT` -> `null` when own/non-discount/sold-out, else the amount.

`BrandComparisonService.compare()` (around line 246) now makes one unguarded call to
`comparisonAmount` and feeds the same result into both `maxConfirmed` and `maxHeld`, replacing the
old two-question split (`excludedFromComparison` guard + `isBestCandidate` + a separate raw-amount
path for held). The `EXACT`-only guard and the sixth-`Certainty` bypass risk described in the brief
are both gone because there is exactly one function and one call site.

Side effect (intended, per spec): held (unconfirmed) `CAPPED`/`RANDOM`/`PERCENT` offers no longer
contribute their raw amount to `maxHeld` — previously held bypassed all qualifier rules and used
`offer.amount()` directly. This flipped `confirmedlessBrandsSortByHeldAmountDescending` (used
qualifier `"최대"` = CAPPED incidentally, not by design) so I changed its two held records to
`qualifier: null` (EXACT) to keep testing what it actually means to test — held sorts by amount
descending — without relying on now-excluded CAPPED behavior.

The `/api/test` fixture path (`TestDataCatalog`) needed no change: it already flows every record
through `BrandComparisonService.compare()`, and the call there is now unconditional, so the `own` +
`특정메뉴` bypass the brief called out is closed by construction, not by a fixture-specific patch.

### 2. soldOut pinned with a test

Added `soldOutOfferNeverFeedsTheBestDiscountComparison`
(`api/src/test/java/com/discounttracker/comparison/BannerOfferCertaintyTest.java`) — a `baemin`
banner, `EXACT`, discount, `soldOut: true`, its only offer for that brand. Asserts the offer stands
on the card (`amount` 5000, `soldOut()` true) but `maxConfirmedAmount()` is null. Flipping
`soldOut: true` to `false` in the fixture flips the assertion (verified by hand — with it removed
the offer becomes the ceiling and the test fails), confirming the test actually exercises the gate.

### 3. Stale comment rewritten

Replaced the `BrandComparisonService.java:253-256` block ("maxHeld는 그대로 둔다 … 여기서까지
빼면 정렬 근거가 없어져") — obsolete now that one gate covers both maps — with a comment that
matches the new code: own/non-discount/sold-out are excluded from both `maxConfirmed` and
`maxHeld` via the single `comparisonAmount` call, one place, one call, so the two questions can't
diverge again. Also fixed the `sortingAmount` reference higher up (line ~236) to point at
`comparisonAmount`.

### Weak tests hardened

- `deliveryAppPercentBannerNeverBecomesAnOffer` now also asserts `BannerCatalog.active()` still
  holds the banner (size 1), matching its sibling `oldSentenceShapeBannerStaysOnTheRailButNever...`.
- `ownBannerNeverFeedsTheBestDiscountComparison` still only exercises the `maxConfirmedAmount` half.
  The `maxHeld` half is unreachable by construction today: banner records are always confirmed
  (`Offer.from`/`OfferRecord` for banners has no unconfirmed status), and held records only ever
  come from the ledger, which is a different data source than the `own`-platform path this test
  targets. No test added for that combination — it cannot occur through any real caller.

### Production usage of `isBestCandidate` / `sortingAmount`

Both became unused in production code after this round — `BrandComparisonService` now calls only
`comparisonAmount`. Neither was deleted: `OfferComparisonTest.java` calls both directly as unit
tests of the certainty-table logic, and `OfferComparison`'s own javadoc explicitly documents the two
as still-meaningful separate questions for anyone reading the offer package standalone. Left in
place per the brief's instruction to report rather than delete.

### Tests

- Task tests: `cd api && ./gradlew test --tests "com.discounttracker.comparison.*" --tests "com.discounttracker.offer.*"` — BUILD SUCCESSFUL.
- Full suite: `cd api && ./gradlew test` — BUILD SUCCESSFUL.

### Files touched this round

- Modify: `api/src/main/java/com/discounttracker/offer/OfferComparison.java`
- Modify: `api/src/main/java/com/discounttracker/comparison/BrandComparisonService.java`
- Modify: `api/src/test/java/com/discounttracker/comparison/BannerOfferCertaintyTest.java`
- Modify: `api/src/test/java/com/discounttracker/comparison/BrandComparisonServiceTest.java`

## Fix round 4 (2026-09-23)

### 1. Held offers keep CAPPED as an ordering amount

`OfferComparison.comparisonAmount(...)` took a sixth parameter `boolean confirmed`. The confirmed
path is unchanged; when `confirmed` is false, `CAPPED` returns the raw amount. `RANDOM`/`PERCENT`
stay excluded on both paths, and own/non-`DISCOUNT`/sold-out stay excluded on both. Still one entry
point, still one call site (`BrandComparisonService` line ~251, which now computes `confirmed`
before the call instead of after).

`BrandComparisonServiceTest.confirmedlessBrandsSortByHeldAmountDescending` is back on qualifier
`"최대"` for both held records and passes. Added `heldRandomOfferGivesNoCeilingUnlikeHeldCapped`,
which pins a held `"랜덤"` brand to a null `maxHeldAmount` while a held `"최대"` brand keeps 3,000 —
so the two behaviours are told apart, and the held branch of the unified call is covered (inverting
`!confirmed` fails both tests).

### 2. isBestCandidate / sortingAmount are now the implementation

`comparisonAmount` is three lines and calls both:

```java
if (!isBestCandidate(Certainty.EXACT, kind, soldOut, platform)) return null;
if (!confirmed && certainty == Certainty.CAPPED) return amount;
return sortingAmount(certainty, amount);
```

The `EXACT` argument in the first line asks only the certainty-independent axes (own, kind,
soldOut), which is exactly the exclusion set. Neither signature changed, so
`OfferComparisonTest` and `docs/contracts/certainty-cases.json` are untouched, and the contract
table now tests code the live path actually runs.

### 3. MENU_ONLY ordering bug fixed

The exclusion check now runs before the certainty arms, so `platform: own` + `특정메뉴` +
`soldOut: true` no longer sets a 4,999 ceiling. Pinned by
`BrandComparisonServiceTest.ownSoldOutMenuOnlyRowSetsNoCeiling` (an `OfferRecord` built directly,
the shape `/api/test` hands in).

### Tests

- `cd api && ./gradlew test --tests "com.discounttracker.comparison.*" --tests "com.discounttracker.offer.*"` — BUILD SUCCESSFUL.
- `cd api && ./gradlew test` — BUILD SUCCESSFUL.

### Files touched this round

- Modify: `api/src/main/java/com/discounttracker/offer/OfferComparison.java`
- Modify: `api/src/main/java/com/discounttracker/comparison/BrandComparisonService.java`
- Modify: `api/src/test/java/com/discounttracker/comparison/BrandComparisonServiceTest.java`
