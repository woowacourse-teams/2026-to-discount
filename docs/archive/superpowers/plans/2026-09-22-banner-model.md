# 배너 모델 재설계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배너 한 건을 브랜드 하나로 고정하고, 묶음을 `group` 칸으로 명시하고, `qualifier` 한 칸이 겸하던 세 질문을 `certainty`와 `kind`로 갈라 API, 운영 콘솔, 웹이 같은 값을 같은 뜻으로 읽게 한다.

**Architecture:** API가 배너 파일의 옛 모양과 새 모양을 한동안 둘 다 읽는다. 원장(`data/log.jsonl`)은 안 고치고 API가 읽을 때 `qualifier`에서 `certainty`를 끌어낸다. 파일 변환은 `--dry-run`으로 화면 문구가 바이트 단위로 같은지 먼저 확인한 뒤에 적용한다. 웹은 `PlatformBadge`, 플랫폼 필터, 묶음 렌더 순서로 고친다. 이 순서를 어기면 배포 즉시 흰 화면이 된다.

**Tech Stack:** Spring Boot 3(Java 17, JUnit 5, snakeyaml), React 18 + Vite(`node --test`), Python 3(표준 라이브러리 + PyYAML, pytest).

**Spec:** `docs/superpowers/specs/2026-09-22-banner-model-design.md`

## Global Constraints

- 원장(`data/log.jsonl`)은 덧붙이기 전용이다. 이 계획은 원장을 한 줄도 고치지 않는다.
- 시간대는 `Asia/Seoul`로 못박는다. 배너 파일에는 시간대 없는 지역 시각으로 적고 서버가 `Asia/Seoul`로 읽는다.
- 사용자에게 보이는 문구는 `docs/COPY-STYLE.md`를 따른다. 서버 쪽 사본은 `beggars-ops/ops_apply.py`의 `COPY_FIELDS`와 `COPY_FORBIDDEN`이다. 글자 수 상한은 `amount` 30, `period` 30, `extra` 80, `event` 20, `note` 30이다.
- 웹 작업 순서는 `PlatformBadge`, 플랫폼 필터, 묶음 렌더다. 바꾸지 않는다.
- `certainty` 열거값은 `exact`, `capped`, `random`, `menuOnly`, `percent` 다섯이다.
- `kind` 열거값은 `discount`, `cashback`, `points` 셋이다.
- 정률 상한을 나중에 넣을 때 칸 이름은 `maxDiscount`다. `cap`은 `capped`와 헷갈리므로 쓰지 않는다.
- 특정 메뉴 한정 쿠폰의 정렬 기여액은 4,999원이다. 이 값은 의도된 것이라 그대로 둔다.
- 어느 단계에서도 `data/devices.json`, `capture/device.py`, `scripts/_env_paths.py`를 건드리지 않는다.

---

## 저장소와 실행 방법

세 저장소를 오간다. 작업마다 어디서 도는지 적어 둔다.

| 이름 | 경로 | 테스트 실행 |
| --- | --- | --- |
| mono | `C:\Users\Jaewun\_dev\delivery-discount-tracker\mono` | API는 `cd api && ./gradlew test`, 웹은 `cd web && node --test src/<파일>.test.js` |
| 트래커 | `C:\Users\Jaewun\_dev\delivery-discount-tracker` | `python -m pytest tests/<파일>.py -q` |
| ops | `C:\Users\Jaewun\_dev\beggars-ops` | `python tools/test_convert.py`, `node --test tools/<파일>.mjs` |

살아 있는 `banners.yml`은 서버에 있다(`/home/ubuntu/delivery-discount-api/data/banners.yml`). mono 저장소의 `api/src/main/resources/banners.yml`은 주석과 `banners: []`뿐인 빈 파일이라 테스트 기본값으로만 쓴다.

---

## File Structure

### mono `api/` (Java)

| 파일 | 하는 일 |
| --- | --- |
| `api/src/main/java/com/discounttracker/offer/Certainty.java` | 새로 만든다. 확실성 다섯 값과 옛 `qualifier`에서 오는 대응 |
| `api/src/main/java/com/discounttracker/offer/AmountKind.java` | 새로 만든다. 종류 셋 |
| `api/src/main/java/com/discounttracker/offer/OfferComparison.java` | 새로 만든다. "최고 후보인가"와 "정렬에 얼마로 기여하나" 두 질문의 유일한 답 |
| `api/src/main/java/com/discounttracker/banner/BannerAmount.java` | 새로 만든다. `amount: {won, percent, random, kind}` 한 덩이 |
| `api/src/main/java/com/discounttracker/banner/BannerSpec.java` | 새 칸을 더하고 `items`와 `amountRange`를 지운다 |
| `api/src/main/java/com/discounttracker/banner/Banner.java` | `group`, `via`, `amountSpec`, `startsAt`, `endsAt`, `targeted`, `firstCome`, `untilSoldOut`을 더한다. 문장 파싱 메서드를 지운다 |
| `api/src/main/java/com/discounttracker/banner/BannerCatalog.java` | 두 모양을 읽는다. 묶음을 접어 `active()`로 내고 안 접은 `activeMembers()`를 따로 낸다 |
| `api/src/main/java/com/discounttracker/banner/BannerText.java` | 새 칸에서 문구를 만든다 |
| `api/src/main/java/com/discounttracker/offer/Offer.java` | `certainty`, `kind`를 싣고 `fromBanner`의 `@JsonIgnore`를 뗀다 |
| `api/src/main/java/com/discounttracker/comparison/BrandComparisonService.java` | 문장 파싱을 지우고 `OfferComparison`을 부른다. 자사 배너도 오퍼로 세운다 |

### mono `web/` (JavaScript)

| 파일 | 하는 일 |
| --- | --- |
| `web/src/platforms.js` | `PARTNERS`와 `ICON_BY_KEY`를 더한다 |
| `web/src/logos.jsx` | `PlatformBadge`가 모르는 키에서 안 죽게 한다 |
| `web/src/filters.js` | `certainty` 기반 판정. 자사 오퍼를 플랫폼 필터 밖에 둔다 |
| `web/src/EventBanner.jsx` | `kind`로 표식을 고른다 |

### mono `docs/`

| 파일 | 하는 일 |
| --- | --- |
| `docs/contracts/certainty-cases.json` | 새로 만든다. API 테스트와 웹 테스트가 같이 읽는 판정표 |

### ops (`beggars-ops`)

| 파일 | 하는 일 |
| --- | --- |
| `archive/banners-2026-09-22.yml` | 새로 만든다. 변환 전 원본 통째 보관 |
| `tools/convert_banners.py` | 새로 만든다. 옛 모양을 새 모양으로. `--dry-run`이 기본 |
| `tools/test_convert.py` | 새로 만든다. 변환기 자체 점검 |
| `ops_apply.py` | 스키마를 새 칸으로 바꾸고 묶음 검사와 혼용 검사를 더한다 |
| `web/index.html` | 묶기와 풀기 단추가 `group` 칸을 쓰게 한다 |

---

# 1단계. API가 두 모양을 읽는다

배너 파일을 안 건드린다. 되돌리기는 배포 롤백 하나다.

### Task 1: 확실성과 종류 열거값

**Files:**
- Create: `api/src/main/java/com/discounttracker/offer/Certainty.java`
- Create: `api/src/main/java/com/discounttracker/offer/AmountKind.java`
- Create: `api/src/test/java/com/discounttracker/offer/CertaintyTest.java`

**Interfaces:**
- Consumes: 없다.
- Produces: `Certainty.EXACT|CAPPED|RANDOM|MENU_ONLY|PERCENT`, `String Certainty.key()`, `static Certainty Certainty.fromQualifier(String qualifier)`. `AmountKind.DISCOUNT|CASHBACK|POINTS`, `String AmountKind.key()`, `static AmountKind AmountKind.from(String raw)`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/offer/CertaintyTest.java`

```java
package com.discounttracker.offer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** 옛 qualifier에서 certainty로 가는 대응이 빠짐없이 채워지는가. */
class CertaintyTest {

    @Test
    void everyLedgerQualifierMapsToExactlyOneCertainty() {
        assertEquals(Certainty.CAPPED, Certainty.fromQualifier("최대"));
        assertEquals(Certainty.RANDOM, Certainty.fromQualifier("랜덤"));
        assertEquals(Certainty.MENU_ONLY, Certainty.fromQualifier("특정메뉴"));
        assertEquals(Certainty.EXACT, Certainty.fromQualifier("최적"));
        assertEquals(Certainty.EXACT, Certainty.fromQualifier("최소"));
        assertEquals(Certainty.EXACT, Certainty.fromQualifier("행사"));
        assertEquals(Certainty.EXACT, Certainty.fromQualifier(null));
    }

    @Test
    void unknownQualifierIsExactRatherThanNull() {
        // 모르는 값에 null을 돌려주면 부르는 쪽마다 분기가 생긴다. 원장이 허용하는 값은
        // schema.py의 ALLOWED_QUALIFIERS 다섯이고 그 밖은 들어올 일이 없다.
        assertEquals(Certainty.EXACT, Certainty.fromQualifier("듣도보도못한값"));
    }

    @Test
    void keysAreTheJsonSpelling() {
        assertEquals("exact", Certainty.EXACT.key());
        assertEquals("menuOnly", Certainty.MENU_ONLY.key());
        assertEquals("percent", Certainty.PERCENT.key());
        assertEquals("discount", AmountKind.DISCOUNT.key());
        assertEquals("cashback", AmountKind.CASHBACK.key());
        assertEquals("points", AmountKind.POINTS.key());
    }

    @Test
    void amountKindDefaultsToDiscount() {
        // 원장에서 온 오퍼는 전부 할인이다. 수집기가 kind를 적은 적이 없다.
        assertEquals(AmountKind.DISCOUNT, AmountKind.from(null));
        assertEquals(AmountKind.DISCOUNT, AmountKind.from(""));
        assertEquals(AmountKind.CASHBACK, AmountKind.from("cashback"));
        assertEquals(AmountKind.POINTS, AmountKind.from("points"));
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.offer.CertaintyTest`
Expected: 컴파일 실패. `cannot find symbol: class Certainty`

- [ ] **Step 3: 최소 구현을 쓴다**

`api/src/main/java/com/discounttracker/offer/Certainty.java`

```java
package com.discounttracker.offer;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 이 금액을 액면대로 견줄 수 있나.
 *
 * <p>{@code qualifier} 한 칸이 겸하던 세 질문 중 하나다. 나머지 둘은 {@code tierMode}
 * (겹침)와 {@code fromBanner}(출처)가 이미 답하고 있다.
 *
 * <p>원장(덧붙이기만 하는 {@code data/log.jsonl})은 안 고친다. 옛 행의 {@code qualifier}에서
 * 읽을 때 끌어낸다 - 대응이 빠짐없이 채워져서 잃는 값이 없다.
 */
public enum Certainty {

    /** 적힌 값을 그대로 받는다. */
    EXACT("exact"),
    /** 최소주문금액을 채워야 나오는 상한액. 화면 배지는 "불확정"이다. */
    CAPPED("capped"),
    /** 뽑기. 받는 사람마다 값이 다르다. */
    RANDOM("random"),
    /** 메뉴 하나에만 쓴다. */
    MENU_ONLY("menuOnly"),
    /** 정률이라 주문 금액을 모르면 얼마인지 안 정해진다. */
    PERCENT("percent");

    private final String key;

    Certainty(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }

    /**
     * 원장 {@code qualifier}에서 끌어낸다. 모르는 값은 {@link #EXACT}다.
     *
     * <p>"최적"과 "최소"는 겹침 축({@code tierMode})이 이미 답하는 사실이라 확실성으로는
     * 그냥 확정이다. "행사"는 출처 축({@code fromBanner})이 답한다.
     */
    public static Certainty fromQualifier(String qualifier) {
        if (qualifier == null) return EXACT;
        return switch (qualifier) {
            case "최대" -> CAPPED;
            case "랜덤" -> RANDOM;
            case "특정메뉴" -> MENU_ONLY;
            default -> EXACT;
        };
    }
}
```

`api/src/main/java/com/discounttracker/offer/AmountKind.java`

```java
package com.discounttracker.offer;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 무엇을 주는가. 가르는 기준은 "받은 값을 어디서 쓸 수 있나" 하나다.
 *
 * <p>원장에서 온 오퍼는 전부 {@link #DISCOUNT}다. 수집기가 이 값을 적은 적이 없다.
 * 배너만 다른 값을 만든다.
 */
public enum AmountKind {

    /** 결제할 금액이 지금 깎인다. */
    DISCOUNT("discount"),
    /** 결제 수단이 나중에 돌려준다. 그 수단이 닿는 곳이면 어디서든 쓴다. */
    CASHBACK("cashback"),
    /** 그 브랜드나 그 앱 안에서만 쓰는 적립금. */
    POINTS("points");

    private final String key;

    AmountKind(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }

    /** 배너 파일의 문자열에서. 비었거나 모르면 {@link #DISCOUNT}다. */
    public static AmountKind from(String raw) {
        if (raw == null || raw.isBlank()) return DISCOUNT;
        for (AmountKind k : values()) {
            if (k.key.equals(raw.trim())) return k;
        }
        return DISCOUNT;
    }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.offer.CertaintyTest`
Expected: PASS, 4건

- [ ] **Step 5: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/offer/Certainty.java api/src/main/java/com/discounttracker/offer/AmountKind.java api/src/test/java/com/discounttracker/offer/CertaintyTest.java
git commit -m "feat(api): 확실성과 종류 축을 만든다"
```

---

### Task 2: 비교 규칙을 판정표 한 곳으로 모은다

웹과 API가 같은 판정표를 본다. 표는 `docs/contracts/certainty-cases.json` 한 파일이고 양쪽 테스트가 읽는다.

**Files:**
- Create: `docs/contracts/certainty-cases.json`
- Create: `api/src/main/java/com/discounttracker/offer/OfferComparison.java`
- Create: `api/src/test/java/com/discounttracker/offer/OfferComparisonTest.java`

**Interfaces:**
- Consumes: `Certainty`, `AmountKind` (Task 1).
- Produces: `static boolean OfferComparison.isBestCandidate(Certainty c, AmountKind k, boolean soldOut)`, `static Integer OfferComparison.sortingAmount(Certainty c, Integer amount)`, `static final int OfferComparison.MENU_LIMITED_SORTING_AMOUNT = 4999`.

- [ ] **Step 1: 판정표를 만든다**

`docs/contracts/certainty-cases.json`

```json
{
  "note": "최고 후보 판정과 정렬 기여액. api의 OfferComparisonTest와 web의 filters.test.js가 같이 읽는다. 한쪽만 고치면 API가 준 순서와 화면이 다시 세운 순서가 어긋난다(ADR-016).",
  "cases": [
    {"certainty": "exact",    "kind": "discount", "soldOut": false, "amount": 5000,  "best": true,  "sorting": 5000},
    {"certainty": "exact",    "kind": "discount", "soldOut": true,  "amount": 5000,  "best": false, "sorting": 5000},
    {"certainty": "exact",    "kind": "cashback", "soldOut": false, "amount": 5000,  "best": false, "sorting": 5000},
    {"certainty": "exact",    "kind": "points",   "soldOut": false, "amount": 5000,  "best": false, "sorting": 5000},
    {"certainty": "capped",   "kind": "discount", "soldOut": false, "amount": 8000,  "best": false, "sorting": null},
    {"certainty": "random",   "kind": "discount", "soldOut": false, "amount": 7000,  "best": false, "sorting": null},
    {"certainty": "percent",  "kind": "discount", "soldOut": false, "amount": null,  "best": false, "sorting": null},
    {"certainty": "menuOnly", "kind": "discount", "soldOut": false, "amount": 14000, "best": false, "sorting": 4999}
  ]
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/offer/OfferComparisonTest.java`

```java
package com.discounttracker.offer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 판정표는 docs/contracts/certainty-cases.json 한 파일이고 web/src/filters.test.js도 같은
 * 파일을 읽는다. 규칙을 두 벌 적지 않는다(ADR-016).
 */
class OfferComparisonTest {

    /** gradle은 api/를 작업 디렉터리로 돈다. 표는 저장소 뿌리의 docs/ 아래다. */
    private static final Path CASES = Path.of("..", "docs", "contracts", "certainty-cases.json");

    @Test
    void everyContractCaseHolds() throws Exception {
        JsonNode root = new ObjectMapper().readTree(CASES.toFile());
        JsonNode cases = root.get("cases");
        assertTrue(cases.size() >= 8, "판정표가 비었거나 줄었다");
        for (JsonNode c : cases) {
            Certainty certainty = Certainty.valueOf(toEnumName(c.get("certainty").asText()));
            AmountKind kind = AmountKind.from(c.get("kind").asText());
            boolean soldOut = c.get("soldOut").asBoolean();
            Integer amount = c.get("amount").isNull() ? null : c.get("amount").asInt();
            String where = c.toString();

            assertEquals(c.get("best").asBoolean(),
                    OfferComparison.isBestCandidate(certainty, kind, soldOut), where);
            Integer wantSorting = c.get("sorting").isNull() ? null : c.get("sorting").asInt();
            assertEquals(wantSorting, OfferComparison.sortingAmount(certainty, amount), where);
        }
    }

    /** "menuOnly" -> MENU_ONLY. 표는 JSON 표기라 열거 상수 이름과 다르다. */
    private static String toEnumName(String key) {
        return key.replaceAll("([a-z])([A-Z])", "$1_$2").toUpperCase(Locale.ROOT);
    }

    @Test
    void menuOnlyKeepsItsBrandInTheSortingButNeverBeatsAPlainFiveThousand() {
        // 정렬에서 통째로 빼면 그 쿠폰밖에 없는 브랜드가 근거를 잃는다. 4,999원은
        // 일반 할인 5,000원을 절대 못 넘고 그보다 작은 일반 할인보다는 위에 선다.
        assertEquals(4999, OfferComparison.sortingAmount(Certainty.MENU_ONLY, 14000));
        assertEquals(4999, OfferComparison.MENU_LIMITED_SORTING_AMOUNT);
    }
}
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.offer.OfferComparisonTest`
Expected: 컴파일 실패. `cannot find symbol: class OfferComparison`

- [ ] **Step 4: 최소 구현을 쓴다**

`api/src/main/java/com/discounttracker/offer/OfferComparison.java`

```java
package com.discounttracker.offer;

/**
 * 오퍼를 견주는 두 질문의 유일한 답.
 *
 * <p>질문이 둘이라는 것이 요점이다. 한때 "한 규칙"으로 합치려 했는데 합치면 안 된다.
 *
 * <ul>
 *   <li>최고 할인 후보인가: 확정이고 할인이고 안 나갔나</li>
 *   <li>카드 정렬에 얼마로 기여하나: 액면, 눌린 값, 또는 제외</li>
 * </ul>
 *
 * <p>특정 메뉴 한정 쿠폰이 둘을 가르는 사례다. 최고 후보에서는 빠지지만 정렬에서는
 * 4,999원으로 남는다 - 통째로 빼면 그 쿠폰밖에 없는 브랜드가 근거를 잃는다.
 *
 * <p>웹의 {@code filters.js}가 같은 규칙을 들고 있다. 판정표
 * {@code docs/contracts/certainty-cases.json}을 양쪽 테스트가 같이 읽어 어긋남을 막는다(ADR-016).
 */
public final class OfferComparison {

    private OfferComparison() {
    }

    /**
     * 특정 메뉴 한정 쿠폰이 정렬에서 갖는 값.
     *
     * <p>5,000원 바로 아래다. 일반 할인 5,000원짜리를 절대 못 넘고 그보다 작은 일반
     * 할인보다는 위에 선다.
     */
    public static final int MENU_LIMITED_SORTING_AMOUNT = 4999;

    /** 카드의 "최고 할인"으로 세울 수 있는 값인가. */
    public static boolean isBestCandidate(Certainty certainty, AmountKind kind, boolean soldOut) {
        return certainty == Certainty.EXACT && kind == AmountKind.DISCOUNT && !soldOut;
    }

    /** 카드 정렬에 기여하는 금액. 견줄 수 없으면 null이라 아예 안 들어간다. */
    public static Integer sortingAmount(Certainty certainty, Integer amount) {
        return switch (certainty) {
            case MENU_ONLY -> MENU_LIMITED_SORTING_AMOUNT;
            case CAPPED, RANDOM, PERCENT -> null;
            case EXACT -> amount;
        };
    }
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.offer.OfferComparisonTest`
Expected: PASS, 2건

- [ ] **Step 6: 커밋한다**

```bash
git add docs/contracts/certainty-cases.json api/src/main/java/com/discounttracker/offer/OfferComparison.java api/src/test/java/com/discounttracker/offer/OfferComparisonTest.java
git commit -m "feat(api): 비교 규칙을 판정표 한 곳으로 모은다"
```

---

### Task 3: 배너 금액 한 덩이

**Files:**
- Create: `api/src/main/java/com/discounttracker/banner/BannerAmount.java`
- Create: `api/src/test/java/com/discounttracker/banner/BannerAmountTest.java`

**Interfaces:**
- Consumes: `Certainty`, `AmountKind` (Task 1).
- Produces: `record BannerAmount(Integer wonMin, Integer wonMax, Integer percent, boolean random, AmountKind kind)`, `static BannerAmount BannerAmount.of(Object raw)`, `Integer BannerAmount.headline()`, `boolean BannerAmount.isRange()`, `Certainty BannerAmount.certainty()`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/banner/BannerAmountTest.java`

```java
package com.discounttracker.banner;

import com.discounttracker.offer.AmountKind;
import com.discounttracker.offer.Certainty;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** yml의 amount 한 덩이를 읽는다. 모양이 하나다(설계 "amount가 값의 유형을 갖는다"). */
class BannerAmountTest {

    @Test
    void plainWonIsExact() {
        BannerAmount a = BannerAmount.of(Map.of("won", 8000));
        assertEquals(8000, a.wonMin());
        assertEquals(8000, a.wonMax());
        assertFalse(a.isRange());
        assertEquals(Certainty.EXACT, a.certainty());
        assertEquals(AmountKind.DISCOUNT, a.kind());
        assertEquals(8000, a.headline());
    }

    @Test
    void openLowerBoundIsCapped() {
        // 최소를 모르는 범위. "최대 8,000원"으로 나간다.
        BannerAmount a = BannerAmount.of(Map.of("won", Arrays.asList(null, 8000)));
        assertNull(a.wonMin());
        assertEquals(8000, a.wonMax());
        assertTrue(a.isRange());
        assertEquals(Certainty.CAPPED, a.certainty());
        assertEquals(8000, a.headline());
    }

    @Test
    void randomBeatsCapped() {
        // 뽑기 배너는 대개 "최대 8,000원"으로도 적힌다. 랜덤이 먼저다.
        BannerAmount a = BannerAmount.of(Map.of("won", List.of(1000, 8000), "random", true));
        assertEquals(Certainty.RANDOM, a.certainty());
        assertEquals(8000, a.headline());
    }

    @Test
    void percentHasNoWonAmount() {
        BannerAmount a = BannerAmount.of(Map.of("percent", 30));
        assertEquals(30, a.percent());
        assertNull(a.headline());
        assertEquals(Certainty.PERCENT, a.certainty());
    }

    @Test
    void cashbackIsAKindNotALimit() {
        // 2026-09-21 백억커피 네이버페이 50% 적립. limit이 아니라 kind다.
        BannerAmount a = BannerAmount.of(Map.of("percent", 50, "kind", "cashback"));
        assertEquals(AmountKind.CASHBACK, a.kind());
        assertEquals(Certainty.PERCENT, a.certainty());
    }

    @Test
    void missingOrMalformedReturnsNull() {
        assertNull(BannerAmount.of(null));
        assertNull(BannerAmount.of("8,000원"));
        assertNull(BannerAmount.of(Map.of("kind", "cashback")));
    }

    @Test
    void wonAndPercentTogetherIsRejected() {
        // 하나만 쓴다. 둘 다 적으면 어느 쪽이 화면에 나갈지 파일만 봐서는 모른다.
        assertThrows(IllegalArgumentException.class,
                () -> BannerAmount.of(Map.of("won", 8000, "percent", 30)));
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.banner.BannerAmountTest`
Expected: 컴파일 실패. `cannot find symbol: class BannerAmount`

- [ ] **Step 3: 최소 구현을 쓴다**

`api/src/main/java/com/discounttracker/banner/BannerAmount.java`

```java
package com.discounttracker.banner;

import com.discounttracker.offer.AmountKind;
import com.discounttracker.offer.Certainty;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 배너가 주는 값. 모양이 하나다.
 *
 * <pre>
 * amount: {won: 8000}                        8,000원 할인
 * amount: {won: [null, 8000]}                최대 8,000원
 * amount: {won: [1000, 8000], random: true}  1,000~8,000원 랜덤
 * amount: {percent: 30}                      30% 할인
 * amount: {percent: 50, kind: cashback}      50% 캐시백
 * </pre>
 *
 * <p>{@code won}과 {@code percent}는 하나만 쓴다. 옛 모양의 문자열 {@code amount}와
 * {@code amountRange}를 이 한 칸이 대신한다.
 *
 * @param wonMin 정액의 하한. 범위이고 하한을 모르면 null
 * @param wonMax 정액의 상한. 정액 하나면 wonMin과 같다
 * @param percent 정률. won과 같이 못 쓴다
 * @param random 뽑기인가. 값이 사람마다 다르다
 * @param kind 무엇을 주는가
 */
public record BannerAmount(Integer wonMin, Integer wonMax, Integer percent,
                           boolean random, AmountKind kind) {

    public BannerAmount {
        if (wonMax != null && percent != null) {
            throw new IllegalArgumentException("amount는 won과 percent 중 하나만 쓴다");
        }
    }

    /**
     * yml의 {@code amount:} 한 덩이에서. 덩이가 아니거나 금액이 없으면 null이다.
     *
     * @throws IllegalArgumentException won과 percent를 같이 적었을 때
     */
    @SuppressWarnings("unchecked")
    public static BannerAmount of(Object raw) {
        if (!(raw instanceof Map<?, ?> m)) return null;
        Map<String, Object> map = (Map<String, Object>) m;
        Integer percent = intOrNull(map.get("percent"));
        Integer lo = null;
        Integer hi = null;
        Object won = map.get("won");
        if (won instanceof List<?> pair && pair.size() == 2) {
            lo = intOrNull(pair.get(0));
            hi = intOrNull(pair.get(1));
        } else if (won != null) {
            lo = intOrNull(won);
            hi = lo;
        }
        if (hi == null && percent == null) return null;
        boolean random = Boolean.TRUE.equals(map.get("random"));
        AmountKind kind = AmountKind.from(map.get("kind") == null ? null : String.valueOf(map.get("kind")));
        return new BannerAmount(lo, hi, percent, random, kind);
    }

    /** 범위인가. 하한이 없거나 상한과 다르면 범위다. */
    public boolean isRange() {
        return percent == null && !Objects.equals(wonMin, wonMax);
    }

    /**
     * 오퍼로 세울 때 쓰는 대표 정액. 정률이면 null이다.
     *
     * <p>범위면 상한이다 - 지금 "최대 8,000원" 배너가 8,000원으로 서고 표식이 그 값을
     * 액면대로 믿지 말라고 말한다.
     */
    public Integer headline() {
        return percent != null ? null : wonMax;
    }

    /** 이 금액을 액면대로 견줄 수 있나. 랜덤이 범위보다 먼저다. */
    public Certainty certainty() {
        if (percent != null) return Certainty.PERCENT;
        if (random) return Certainty.RANDOM;
        return isRange() ? Certainty.CAPPED : Certainty.EXACT;
    }

    private static Integer intOrNull(Object v) {
        if (v instanceof Number n) return n.intValue();
        if (v == null) return null;
        try {
            return Integer.valueOf(String.valueOf(v).replace(",", "").trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.banner.BannerAmountTest`
Expected: PASS, 7건

- [ ] **Step 5: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/banner/BannerAmount.java api/src/test/java/com/discounttracker/banner/BannerAmountTest.java
git commit -m "feat(api): 배너 금액을 한 덩이로 읽는다"
```
---

### Task 4: 배너가 새 칸을 갖는다

`Banner` record에 새 칸을 더하고 시각으로 옮긴다. 옛 칸(`startsOn`, `endsOn`)은 저장하지 않고 `startsAt`에서 끌어내는 메서드로 남긴다 - 부르는 쪽(`activeOn`, `banner.endsOn().toString()`)이 그대로 선다.

**Files:**
- Modify: `api/src/main/java/com/discounttracker/banner/Banner.java`
- Create: `api/src/test/java/com/discounttracker/banner/BannerFieldsTest.java`

**Interfaces:**
- Consumes: `BannerAmount` (Task 3).
- Produces: `Banner` record에 `String group`, `String via`, `BannerAmount amountSpec`, `LocalDateTime startsAt`, `LocalDateTime endsAt`, `Boolean targeted`, `String firstCome`, `Boolean untilSoldOut`이 생긴다. `LocalDate Banner.startsOn()`, `LocalDate Banner.endsOn()`, `boolean Banner.activeAt(LocalDateTime now)`, `boolean Banner.isTargeted()`, `boolean Banner.untilSoldOutFlag()`. Builder에 `group(String)`, `via(String)`, `amountSpec(BannerAmount)`, `startsAt(LocalDateTime)`, `endsAt(LocalDateTime)`, `targeted(Boolean)`, `firstCome(String)`, `untilSoldOut(Boolean)`이 생긴다. `startsOn(LocalDate)`과 `endsOn(LocalDate)` Builder 메서드는 각각 그날 00:00과 23:59로 채우는 편의 메서드로 남는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/banner/BannerFieldsTest.java`

```java
package com.discounttracker.banner;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** 날짜 대신 시각. 그날 포함인지를 값 자체가 말한다(설계 "날짜 대신 시각"). */
class BannerFieldsTest {

    private static Banner at(LocalDateTime from, LocalDateTime to) {
        return Banner.of("dunkin-20260922", "https://example.test/a")
                .brand("던킨").platform("ddangyo")
                .amountSpec(BannerAmount.of(Map.of("won", 7000)))
                .startsAt(from).endsAt(to).build();
    }

    @Test
    void seventeenOclockOpenStartsAtSeventeenNotMidnight() {
        Banner b = at(LocalDateTime.of(2026, 9, 22, 17, 0), LocalDateTime.of(2026, 9, 22, 23, 59));
        assertFalse(b.activeAt(LocalDateTime.of(2026, 9, 22, 16, 59)));
        assertTrue(b.activeAt(LocalDateTime.of(2026, 9, 22, 17, 0)));
        assertTrue(b.activeAt(LocalDateTime.of(2026, 9, 22, 23, 59)));
        assertFalse(b.activeAt(LocalDateTime.of(2026, 9, 23, 0, 0)));
    }

    @Test
    void oldCallersStillReadDates() {
        Banner b = at(LocalDateTime.of(2026, 9, 22, 17, 0), LocalDateTime.of(2026, 9, 30, 23, 59));
        assertEquals(LocalDate.of(2026, 9, 22), b.startsOn());
        assertEquals(LocalDate.of(2026, 9, 30), b.endsOn());
    }

    @Test
    void dateBuilderFillsTheDayBoundaries() {
        // 변환기가 endsOn: D를 endsAt: D T23:59로 옮긴다. 빌더도 같은 규칙이다.
        Banner b = Banner.of("x", "https://example.test/b")
                .startsOn(LocalDate.of(2026, 9, 22)).endsOn(LocalDate.of(2026, 9, 22)).build();
        assertEquals(LocalDateTime.of(2026, 9, 22, 0, 0), b.startsAt());
        assertEquals(LocalDateTime.of(2026, 9, 22, 23, 59), b.endsAt());
    }

    @Test
    void newFieldsRoundTripThroughToBuilder() {
        Banner b = Banner.of("y", "https://example.test/c")
                .brand("백억커피").platform("own").via("naverpay").group("naverpay-0921")
                .amountSpec(BannerAmount.of(Map.of("percent", 50, "kind", "cashback")))
                .targeted(true).firstCome("issue").untilSoldOut(true)
                .startsOn(LocalDate.of(2026, 9, 21)).endsOn(LocalDate.of(2026, 9, 21))
                .build();
        Banner copy = b.toBuilder().build();
        assertEquals("naverpay-0921", copy.group());
        assertEquals("naverpay", copy.via());
        assertEquals("issue", copy.firstCome());
        assertTrue(copy.isTargeted());
        assertTrue(copy.untilSoldOutFlag());
        assertEquals(50, copy.amountSpec().percent());
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.banner.BannerFieldsTest`
Expected: 컴파일 실패. `cannot find symbol: method startsAt(java.time.LocalDateTime)`

- [ ] **Step 3: 최소 구현을 쓴다**

`Banner.java`에서 record 구성 요소 `LocalDate startsOn`과 `LocalDate endsOn`을 지우고 아래로 바꾼다. 나머지 구성 요소는 순서 그대로 둔다.

```java
public record Banner(
        String id,
        String brand,
        String platform,
        String url,
        String amount,
        String period,
        String extra,
        Integer minOrder,
        String color,
        java.time.LocalDateTime startsAt,
        java.time.LocalDateTime endsAt,
        Boolean soldOut,
        LocalDate soldOutOn,
        int priority,
        List<String> brands,
        BannerSpec spec,
        @JsonProperty("notify") Boolean notifyFlag,
        Boolean notifyImmediately,
        List<String> brandLabels,
        // 2026-09-22 재설계. 같은 값을 적은 배너끼리 한 장으로 그린다.
        String group,
        // 제휴 결제 수단(naverpay 등). 아이콘만 바꾼다. 필터에는 안 들어간다.
        String via,
        // 무엇을 얼마나. 문자열 amount와 spec.amountRange를 대신한다.
        BannerAmount amountSpec,
        // 개인 지정 쿠폰인가. 자격이지 수량 제한이 아니다.
        Boolean targeted,
        // 선착순 기준. issue(발급), use(사용), null
        String firstCome,
        // 소진되면 끝인가.
        Boolean untilSoldOut) {
```

같은 파일에 아래 메서드를 더한다.

```java
    /** 배너를 보여 줄 기간 안인가. 시각까지 본다 - 17시 오픈 행사가 17시에 뜬다. */
    public boolean activeAt(java.time.LocalDateTime now) {
        return !now.isBefore(startsAt) && !now.isAfter(endsAt);
    }

    /** 시작 날짜. 시각을 쓰기 전 코드가 부르던 이름 그대로다. */
    public LocalDate startsOn() {
        return startsAt.toLocalDate();
    }

    /** 종료 날짜. 오퍼의 expiresAt이 이 값을 쓴다. */
    public LocalDate endsOn() {
        return endsAt.toLocalDate();
    }

    public boolean isTargeted() {
        return Boolean.TRUE.equals(targeted);
    }

    public boolean untilSoldOutFlag() {
        return Boolean.TRUE.equals(untilSoldOut);
    }
```

`activeOn(LocalDate day)`는 지운다. 부르는 곳은 `BannerCatalog.active()` 하나이고 Task 6에서 `activeAt`으로 바꾼다.

`Builder`에 아래를 더한다. 기존 `startsOn`, `endsOn` 메서드는 시각을 채우는 편의 메서드로 바꾼다.

```java
        private java.time.LocalDateTime startsAt;
        private java.time.LocalDateTime endsAt;
        private String group;
        private String via;
        private BannerAmount amountSpec;
        private Boolean targeted;
        private String firstCome;
        private Boolean untilSoldOut;

        public Builder startsAt(java.time.LocalDateTime v) { this.startsAt = v; return this; }
        public Builder endsAt(java.time.LocalDateTime v) { this.endsAt = v; return this; }
        /** 날짜만 아는 경우. 그날 00:00이다. 변환기가 쓰는 규칙과 같다. */
        public Builder startsOn(LocalDate v) { this.startsAt = v == null ? null : v.atStartOfDay(); return this; }
        /** 날짜만 아는 경우. 그날 23:59다 - 그날 포함이라는 뜻이었다. */
        public Builder endsOn(LocalDate v) { this.endsAt = v == null ? null : v.atTime(23, 59); return this; }
        public Builder group(String v) { this.group = v; return this; }
        public Builder via(String v) { this.via = v; return this; }
        public Builder amountSpec(BannerAmount v) { this.amountSpec = v; return this; }
        public Builder targeted(Boolean v) { this.targeted = v; return this; }
        public Builder firstCome(String v) { this.firstCome = v; return this; }
        public Builder untilSoldOut(Boolean v) { this.untilSoldOut = v; return this; }
```

`Builder.build()`와 `toBuilder()`를 새 칸까지 넘기게 고친다.

```java
        public Banner build() {
            return new Banner(id, brand, platform, url, amount, period, extra, minOrder, color,
                    startsAt, endsAt, soldOut, soldOutOn, priority, brands, spec,
                    notify, notifyImmediately, brandLabels,
                    group, via, amountSpec, targeted, firstCome, untilSoldOut);
        }
```

```java
    public Builder toBuilder() {
        return new Builder(id, url).brand(brand).platform(platform).amount(amount)
                .period(period).extra(extra).minOrder(minOrder).color(color)
                .startsAt(startsAt).endsAt(endsAt).soldOut(soldOut).soldOutOn(soldOutOn)
                .priority(priority).brands(brands).spec(spec)
                .notify(notifyFlag).notifyImmediately(notifyImmediately).brandLabels(brandLabels)
                .group(group).via(via).amountSpec(amountSpec)
                .targeted(targeted).firstCome(firstCome).untilSoldOut(untilSoldOut);
    }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.banner.BannerFieldsTest`
Expected: PASS, 4건

- [ ] **Step 5: 저장소 전체 테스트가 여전히 도는지 본다**

Run: `cd api && ./gradlew test`
Expected: PASS. `activeOn`을 지웠으므로 `BannerCatalog`가 컴파일 오류를 낸다면 그 한 줄만 `activeAt(java.time.LocalDate.now(clock).atStartOfDay())`로 임시로 맞춘다. Task 6이 제대로 고친다.

- [ ] **Step 6: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/banner/Banner.java api/src/test/java/com/discounttracker/banner/BannerFieldsTest.java
git commit -m "feat(api): 배너를 날짜에서 시각으로 옮기고 새 칸을 더한다"
```

---

### Task 5: 새 칸에서 문구를 만든다

**Files:**
- Modify: `api/src/main/java/com/discounttracker/banner/BannerSpec.java`
- Modify: `api/src/main/java/com/discounttracker/banner/BannerText.java`
- Modify: `api/src/test/java/com/discounttracker/banner/BannerTextTest.java`

**Interfaces:**
- Consumes: `BannerAmount` (Task 3), `Banner` (Task 4).
- Produces: `BannerSpec(String opensAt, String channel, String membership, String event, String note)` 다섯 칸짜리 record. `static String BannerText.amount(BannerAmount a)`, `static String BannerText.period(Banner b)`, `static String BannerText.extra(Banner b)`, `static String BannerText.conditions(Banner b)`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/banner/BannerTextTest.java`를 통째로 아래로 바꾼다.

```java
package com.discounttracker.banner;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** 새 칸에서 만든 문구가 사람이 손으로 적던 문구와 글자까지 같은지. */
class BannerTextTest {

    private static Banner.Builder base() {
        return Banner.of("t", "https://example.test/x").brand("던킨").platform("ddangyo")
                .startsAt(LocalDateTime.of(2026, 9, 22, 0, 0))
                .endsAt(LocalDateTime.of(2026, 9, 22, 23, 59));
    }

    @Test
    void amountReadsLikeTheHandWrittenBanner() {
        assertEquals("7,000원", BannerText.amount(BannerAmount.of(Map.of("won", 7000))));
        assertEquals("최대 8,000원",
                BannerText.amount(BannerAmount.of(Map.of("won", Arrays.asList(null, 8000)))));
        assertEquals("1,000~8,000원",
                BannerText.amount(BannerAmount.of(Map.of("won", Arrays.asList(1000, 8000)))));
        assertEquals("30% 할인", BannerText.amount(BannerAmount.of(Map.of("percent", 30))));
        assertEquals("50% 적립",
                BannerText.amount(BannerAmount.of(Map.of("percent", 50, "kind", "cashback"))));
    }

    @Test
    void oneDayEventSaysTheDay() {
        Banner b = base().amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("9월 22일 하루", BannerText.period(b));
    }

    @Test
    void startAtSeventeenSaysSeventeen() {
        // 17시 오픈은 startsAt 한 칸으로 끝난다. opensAt은 매일 반복하는 행사에만 쓴다.
        Banner b = base().startsAt(LocalDateTime.of(2026, 9, 22, 17, 0))
                .amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("오후 5시 오픈", BannerText.period(b));
    }

    @Test
    void repeatingOpenTimeSaysEveryDay() {
        Banner b = base().endsAt(LocalDateTime.of(2026, 9, 30, 23, 59))
                .spec(new BannerSpec("11:00", null, null, null, null))
                .amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("매일 오전 11시 오픈", BannerText.period(b));
    }

    @Test
    void extraGathersMinOrderAndLimitsAndNote() {
        Banner b = base().minOrder(15000).firstCome("issue").untilSoldOut(true)
                .spec(new BannerSpec(null, "배달", null, "더블 땡데이", "일부 매장 제외"))
                .amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("더블 땡데이 / 15,000원↑, 발급 선착순, 소진 시 종료, 배달 한정, 일부 매장 제외",
                BannerText.extra(b));
    }

    @Test
    void conditionsDropTheMinOrderBecauseTheTierRowAlreadyShowsIt() {
        // 문턱은 오퍼 구간의 minOrder로 따로 뜬다. 조건 줄에 또 적으면 두 번 보인다.
        Banner b = base().minOrder(15000).firstCome("issue")
                .spec(new BannerSpec(null, "배달", null, "더블 땡데이", null))
                .amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("더블 땡데이 / 발급 선착순, 배달 한정", BannerText.conditions(b));
    }

    @Test
    void targetedSaysLimited() {
        // 아무나 받는 것이 아니라는 사실이 조건 줄에 남아야 한다.
        Banner b = base().targeted(true).amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("타겟딜, 한정", BannerText.conditions(b));
    }

    @Test
    void emptyBannerHasNoExtraLine() {
        Banner b = base().amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertNull(BannerText.extra(b));
        assertNull(BannerText.conditions(b));
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.banner.BannerTextTest`
Expected: 컴파일 실패. `constructor BannerSpec cannot be applied to given types`

- [ ] **Step 3: 최소 구현을 쓴다**

`api/src/main/java/com/discounttracker/banner/BannerSpec.java`를 통째로 바꾼다.

```java
package com.discounttracker.banner;

/**
 * 배너에서 문구로만 쓰이는 칸. 금액과 기간과 한정은 {@link Banner} 자신이 갖는다.
 *
 * <p>2026-09-22 재설계로 {@code items}, {@code amountRange}, {@code limit}, {@code usage}가
 * 빠졌다. 묶음은 {@code group}이, 금액은 {@link BannerAmount}가, 선착순은
 * {@code firstCome}과 {@code untilSoldOut}이 가져갔다.
 *
 * @param opensAt    매일 반복하는 오픈 시각 "HH:MM". 하루짜리 행사의 오픈은 startsAt이 갖는다
 * @param channel    배달, 포장
 * @param membership 플랫폼 멤버십 키(예: coupangEats)
 * @param event      짧은 행사 제목(더블 땡데이, 위클리 슈퍼딜)
 * @param note       위 칸 어디에도 안 담기는 특이한 제약 한 줄
 */
public record BannerSpec(String opensAt, String channel, String membership,
                         String event, String note) {

    public boolean isEmpty() {
        return opensAt == null && channel == null && membership == null
                && event == null && note == null;
    }
}
```

`api/src/main/java/com/discounttracker/banner/BannerText.java`를 통째로 바꾼다.

```java
package com.discounttracker.banner;

import com.discounttracker.offer.AmountKind;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 구조 칸에서 화면 문구를 만든다. 사람이 문장을 직접 적는 길은 막혔다.
 *
 * <p>문구를 여기서 만드는 이유는 하나다. 파싱을 없앤다. 수집기와 웹이 {@code extra}를
 * 읽어 브랜드와 금액을 되짚던 자리가 2026-09-18 하루에 세 번 틀렸다.
 */
final class BannerText {

    private BannerText() {
    }

    /** 금액 문구. "7,000원", "최대 8,000원", "1,000~8,000원", "30% 할인", "50% 적립". */
    static String amount(BannerAmount a) {
        if (a == null) return null;
        if (a.percent() != null) {
            return a.percent() + "% " + (a.kind() == AmountKind.DISCOUNT ? "할인" : "적립");
        }
        if (a.wonMax() == null) return null;
        if (!a.isRange()) return won(a.wonMax()) + "원";
        return a.wonMin() == null ? "최대 " + won(a.wonMax()) + "원"
                : won(a.wonMin()) + "~" + won(a.wonMax()) + "원";
    }

    /**
     * 기간 문구.
     *
     * <p>순서가 있다. 매일 반복하는 오픈 시각이 있으면 그것이 먼저고, 없으면 시작 시각이
     * 자정이 아닐 때 그 시각을 말하고, 하루짜리면 날짜를, 아니면 종료일을 말한다.
     */
    static String period(Banner b) {
        LocalDateTime from = b.startsAt();
        LocalDateTime to = b.endsAt();
        boolean oneDay = from.toLocalDate().equals(to.toLocalDate());
        String opensAt = b.spec() == null ? null : b.spec().opensAt();
        if (opensAt != null) {
            String at = clock(opensAt) + " 오픈";
            return oneDay ? at : "매일 " + at;
        }
        if (from.getHour() != 0 || from.getMinute() != 0) {
            return clock(String.format("%02d:%02d", from.getHour(), from.getMinute())) + " 오픈";
        }
        if (oneDay) return from.getMonthValue() + "월 " + from.getDayOfMonth() + "일 하루";
        return "~" + to.getMonthValue() + "/" + to.getDayOfMonth();
    }

    /** 부가 문구. "[행사] / [최소주문↑], [한정들], [채널], [비고]". */
    static String extra(Banner b) {
        return join(b, true);
    }

    /**
     * 오퍼 상세의 조건 줄. {@link #extra}에서 최소주문금액만 뺀다.
     *
     * <p>그 숫자는 이미 구간의 minOrder로 따로 뜬다. 둘 다 적으면 같은 문턱이 두 번
     * 보인다(2026-09-03 네네치킨 요기요 실측).
     */
    static String conditions(Banner b) {
        return join(b, false);
    }

    private static String join(Banner b, boolean withMinOrder) {
        BannerSpec s = b.spec();
        List<String> tail = new ArrayList<>();
        if (withMinOrder && b.minOrder() != null) tail.add(won(b.minOrder()) + "원↑");
        if (b.isTargeted()) tail.add("타겟딜");
        if ("issue".equals(b.firstCome())) tail.add("발급 선착순");
        if ("use".equals(b.firstCome())) tail.add("사용(발급X) 선착순");
        if (b.amountSpec() != null && b.amountSpec().certainty() == com.discounttracker.offer.Certainty.RANDOM) {
            tail.add("랜덤쿠폰");
        }
        if (b.untilSoldOutFlag()) tail.add("소진 시 종료");
        if (s != null && s.channel() != null) tail.add(s.channel() + " 한정");
        if (s != null && s.note() != null) tail.add(s.note());
        // 타겟딜은 아무나 받는 것이 아니다. 그 사실이 조건 줄에 남아야 한다.
        if (!withMinOrder && b.isTargeted()) tail.add("한정");
        String body = String.join(", ", tail);
        String head = s == null ? null : s.event();
        if (head != null && !body.isEmpty()) return head + " / " + body;
        if (head != null) return head;
        return body.isEmpty() ? null : body;
    }

    /** "11:00" -> "오전 11시", "17:00" -> "오후 5시", "17:30" -> "오후 5시 30분". */
    static String clock(String hhmm) {
        if (hhmm == null || !hhmm.matches("\\d{1,2}:\\d{2}")) return hhmm;
        String[] p = hhmm.split(":");
        int h = Integer.parseInt(p[0]);
        int m = Integer.parseInt(p[1]);
        String ampm = h < 12 ? "오전" : "오후";
        int shown = h == 0 ? 12 : h > 12 ? h - 12 : h;
        return ampm + " " + shown + "시" + (m != 0 ? " " + m + "분" : "");
    }

    private static String won(int n) {
        return String.format("%,d", n);
    }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.banner.BannerTextTest`
Expected: PASS, 8건

- [ ] **Step 5: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/banner/BannerSpec.java api/src/main/java/com/discounttracker/banner/BannerText.java api/src/test/java/com/discounttracker/banner/BannerTextTest.java
git commit -m "feat(api): 새 칸에서 배너 문구를 만든다"
```
---

### Task 6: 파일에서 두 모양을 읽고 묶음을 접는다

**Files:**
- Modify: `api/src/main/java/com/discounttracker/banner/BannerCatalog.java`
- Create: `api/src/test/java/com/discounttracker/banner/BannerGroupTest.java`

**Interfaces:**
- Consumes: `Banner`, `BannerAmount`, `BannerSpec`, `BannerText` (Task 3, 4, 5).
- Produces: `List<Banner> BannerCatalog.active()`가 묶음을 접어 한 장으로 돌려준다. `List<Banner> BannerCatalog.activeMembers()`가 안 접은 구성원 전부를 돌려준다. `List<String> BannerCatalog.mixedShape()`가 옛 칸과 새 칸을 같이 적은 배너의 id를 돌려준다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/banner/BannerGroupTest.java`

```java
package com.discounttracker.banner;

import com.discounttracker.brand.BrandCatalog;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** group으로 묶으면 화면에는 한 장, 오퍼로는 구성원마다 하나. */
class BannerGroupTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private static BannerCatalog catalog(String yml) {
        Clock clock = Clock.fixed(Instant.parse("2026-09-22T12:00:00Z"), SEOUL);
        return new BannerCatalog(new ByteArrayResource(yml.getBytes(StandardCharsets.UTF_8)),
                clock, new BrandCatalog());
    }

    private static final String TWO_IN_A_GROUP = """
            banners:
              - id: dunkin-20260922
                group: ddangyo-doubleday-0922
                brand: 던킨
                platform: ddangyo
                url: "https://example.test/dunkin"
                amount: {won: 7000}
                minOrder: 15000
                startsAt: 2026-09-22T00:00
                endsAt: 2026-09-22T23:59
                priority: 5
              - id: albolo-20260922
                group: ddangyo-doubleday-0922
                brand: 피자알볼로
                platform: ddangyo
                url: "https://example.test/albolo"
                amount: {won: 8000}
                minOrder: 18000
                startsAt: 2026-09-22T00:00
                endsAt: 2026-09-22T23:59
                priority: 2
            """;

    @Test
    void groupDrawsAsOneCard() {
        List<Banner> active = catalog(TWO_IN_A_GROUP).active();
        assertEquals(1, active.size(), "묶음은 한 장이다");
        assertEquals(List.of("피자알볼로", "던킨"), active.get(0).brands(),
                "priority가 작은 구성원이 대표이고 그 순서로 늘어선다");
    }

    @Test
    void groupPriorityIsTheSmallestMemberPriority() {
        // 사람에게 두 줄에 같은 숫자를 적게 하지 않는다. 한 줄만 고치는 실수가 나고
        // 그 실수는 화면을 봐도 안 보인다.
        assertEquals(2, catalog(TWO_IN_A_GROUP).active().get(0).priority());
    }

    @Test
    void everyMemberStillBecomesItsOwnOffer() {
        List<Banner> members = catalog(TWO_IN_A_GROUP).activeMembers();
        assertEquals(2, members.size());
        assertEquals(List.of("피자알볼로", "던킨"), members.stream().map(Banner::brand).toList());
        assertEquals(18000, members.get(0).minOrder());
        assertEquals(15000, members.get(1).minOrder());
    }

    @Test
    void oldShapeStillLoads() {
        // 1단계에서는 파일을 안 건드린다. 옛 모양이 그대로 떠야 한다.
        BannerCatalog c = catalog("""
                banners:
                  - id: kyochon-20260922
                    brand: 교촌치킨
                    platform: baemin
                    url: "https://example.test/k"
                    amount: "12,000원"
                    period: 9월 22일 하루
                    extra: "20,000원↑, 선착순 300명"
                    minOrder: 20000
                    startsOn: 2026-09-22
                    endsOn: 2026-09-22
                """);
        assertEquals(1, c.active().size());
        assertEquals("12,000원", c.active().get(0).amount());
        assertEquals("9월 22일 하루", c.active().get(0).period());
    }

    @Test
    void mixingBothShapesIsReportedRatherThanGuessed() {
        // 드리프트 2. 둘 다 있으면 어느 쪽이 이기는지 파일만 봐서는 모른다.
        BannerCatalog c = catalog("""
                banners:
                  - id: mixed-20260922
                    brand: 교촌치킨
                    platform: baemin
                    url: "https://example.test/m"
                    amount: "12,000원"
                    startsOn: 2026-09-22
                    startsAt: 2026-09-22T17:00
                    endsOn: 2026-09-22
                """);
        assertEquals(List.of("mixed-20260922"), c.mixedShape());
    }

    @Test
    void seventeenOclockBannerIsHiddenBeforeItOpens() {
        // 고정 시계는 2026-09-22 21:00 KST(12:00Z)다. 22시 오픈 배너는 아직 안 뜬다.
        BannerCatalog c = catalog("""
                banners:
                  - id: late-20260922
                    brand: 교촌치킨
                    platform: baemin
                    url: "https://example.test/l"
                    amount: {won: 5000}
                    startsAt: 2026-09-22T22:00
                    endsAt: 2026-09-22T23:59
                """);
        assertEquals(List.of(), c.active());
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.banner.BannerGroupTest`
Expected: 컴파일 실패. `cannot find symbol: method activeMembers()`

- [ ] **Step 3: 최소 구현을 쓴다**

`BannerCatalog.java`의 `toBanner`에 새 칸 읽기를 더한다. `spec(attrs)`는 다섯 칸짜리로 줄인다.

```java
    /** yml의 문구 칸을 읽는다. 하나도 없으면 null. */
    private static BannerSpec spec(Map<String, Object> attrs) {
        BannerSpec spec = new BannerSpec(text(attrs.get("opensAt")), text(attrs.get("channel")),
                text(attrs.get("membership")), text(attrs.get("event")), text(attrs.get("note")));
        return spec.isEmpty() ? null : spec;
    }

    /** 옛 날짜 칸과 새 시각 칸을 다 받는다. 날짜만 있으면 하루의 시작과 끝으로 채운다. */
    private static java.time.LocalDateTime moment(Object at, Object on, boolean endOfDay) {
        String s = text(at);
        if (s != null) {
            try {
                return java.time.LocalDateTime.parse(s.replace(" ", "T"));
            } catch (java.time.format.DateTimeParseException e) {
                return null;
            }
        }
        LocalDate d = date(on);
        if (d == null) return null;
        return endOfDay ? d.atTime(23, 59) : d.atStartOfDay();
    }

    /** 옛 칸과 새 칸을 같이 적었나. 어느 쪽이 이기는지 파일만 봐서는 모른다(드리프트 2). */
    private static boolean mixedShape(Map<String, Object> attrs) {
        boolean dates = attrs.get("startsOn") != null || attrs.get("endsOn") != null;
        boolean moments = attrs.get("startsAt") != null || attrs.get("endsAt") != null;
        boolean sentences = attrs.get("amount") instanceof String
                || attrs.get("period") != null || attrs.get("extra") != null;
        boolean structured = attrs.get("amount") instanceof Map<?, ?>;
        return (dates && moments) || (sentences && structured);
    }
```

`toBanner`의 본문에서 날짜와 금액을 아래로 바꾼다.

```java
        java.time.LocalDateTime startsAt = moment(attrs.get("startsAt"), attrs.get("startsOn"), false);
        java.time.LocalDateTime endsAt = moment(attrs.get("endsAt"), attrs.get("endsOn"), true);
        BannerAmount amountSpec;
        try {
            amountSpec = BannerAmount.of(attrs.get("amount"));
        } catch (IllegalArgumentException e) {
            return null;
        }
        String amount = attrs.get("amount") instanceof String s ? s : null;
        String period = text(attrs.get("period"));
        if (id == null || url == null || startsAt == null || endsAt == null) return null;
```

빌더 호출에 새 칸을 더한다. 문장 칸이 비면 구조 칸에서 만든다.

```java
        Banner banner = Banner.of(id, url)
                .brand(brand == null ? null : brands.canonical(brand))
                .platform(platform)
                .minOrder(number(attrs.get("minOrder")))
                .color(text(attrs.get("color")))
                .startsAt(startsAt)
                .endsAt(endsAt)
                .soldOut(flag(attrs.get("soldOut")))
                .soldOutOn(date(attrs.get("soldOutOn")))
                .priority(priority instanceof Number n ? n.intValue() : Banner.DEFAULT_PRIORITY)
                .spec(spec)
                .notify(flag(attrs.get("notify")))
                .notifyImmediately(flag(attrs.get("notifyImmediately")))
                .group(text(attrs.get("group")))
                .via(text(attrs.get("via")))
                .amountSpec(amountSpec)
                .targeted(flag(attrs.get("targeted")))
                .firstCome(text(attrs.get("firstCome")))
                .untilSoldOut(flag(attrs.get("untilSoldOut")))
                .amount(amount)
                .period(period)
                .extra(text(attrs.get("extra")))
                .build();
        // 문장 칸이 비면 구조 칸에서 만든다. 적혀 있으면 그 문장이 이긴다(이행 기간 규칙).
        return banner.toBuilder()
                .amount(amount != null ? amount : BannerText.amount(amountSpec))
                .period(period != null ? period : BannerText.period(banner))
                .extra(banner.extra() != null ? banner.extra() : BannerText.extra(banner))
                .build();
```

`read()`가 `mixed` 목록을 채우게 한다. 필드와 접근자를 더한다.

```java
    /** 옛 칸과 새 칸을 같이 적은 배너의 id. reload 응답에 실어 사람이 바로 안다. */
    private volatile List<String> mixed = List.of();

    public List<String> mixedShape() {
        return mixed;
    }
```

`read()`의 반복문 안에서 `if (mixedShape((Map<String, Object>) map)) mixedIds.add(...)`로 모아 `mixed = List.copyOf(mixedIds)`로 넣는다.

`active()`를 아래로 바꾸고 `activeMembers()`를 더한다.

```java
    /**
     * 오늘 이 시각에 띄울 배너. 묶음은 한 장으로 접는다.
     *
     * <p>묶음의 순서는 구성원 중 가장 작은 priority다. 사람에게 여러 줄에 같은 숫자를
     * 적게 하지 않는다 - 한 줄만 고치는 실수가 나고 그 실수는 화면을 봐도 안 보인다.
     */
    public List<Banner> active() {
        List<Banner> members = activeMembers();
        List<Banner> out = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (Banner b : members) {
            if (b.group() == null) {
                out.add(b);
                continue;
            }
            if (!seen.add(b.group())) continue;
            List<Banner> mates = members.stream().filter(m -> b.group().equals(m.group())).toList();
            List<String> names = mates.stream().map(Banner::brand).filter(java.util.Objects::nonNull).toList();
            out.add(b.toBuilder()
                    .brands(names)
                    .brandLabels(names.stream().map(n -> brands.find(n).display()).toList())
                    .build());
        }
        return List.copyOf(out);
    }

    /** 묶음을 안 접은 구성원 전부. 오퍼는 브랜드마다 하나씩 서므로 이쪽을 쓴다. */
    public List<Banner> activeMembers() {
        java.time.LocalDateTime now = java.time.LocalDateTime.now(clock);
        java.util.Map<String, Integer> groupPriority = new java.util.HashMap<>();
        List<Banner> live = all.stream().filter(b -> b.activeAt(now)).toList();
        for (Banner b : live) {
            if (b.group() != null) {
                groupPriority.merge(b.group(), b.priority(), Math::min);
            }
        }
        return live.stream()
                .map(b -> b.group() == null ? b
                        : b.toBuilder().priority(groupPriority.get(b.group())).build())
                .sorted(Comparator.comparingInt(Banner::priority).thenComparing(Banner::endsAt)
                        .thenComparing(Banner::id))
                .map(b -> b.resolvedFor(now.toLocalDate()))
                .toList();
    }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.banner.BannerGroupTest`
Expected: PASS, 6건

- [ ] **Step 5: 기존 배너 테스트를 맞춘다**

Run: `cd api && ./gradlew test`
Expected: `BannerCatalogTest`가 `items`와 `amountRange`를 쓰는 곳에서 깨진다. 그 사례들을 새 모양(`amount: {won: ...}`, `group:`)으로 고친다. 옛 모양 사례는 그대로 두어 두 모양을 다 덮는다.

- [ ] **Step 6: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/banner/BannerCatalog.java api/src/test/java/com/discounttracker/banner/
git commit -m "feat(api): 두 모양을 읽고 묶음을 한 장으로 접는다"
```

---

### Task 7: 오퍼가 확실성과 종류를 싣는다

**Files:**
- Modify: `api/src/main/java/com/discounttracker/offer/Offer.java`
- Create: `api/src/test/java/com/discounttracker/offer/OfferCertaintyTest.java`

**Interfaces:**
- Consumes: `Certainty`, `AmountKind` (Task 1).
- Produces: `Offer` record에 `Certainty certainty`, `AmountKind kind`가 생긴다. `fromBanner`의 `@JsonIgnore`가 빠진다. `static Offer Offer.from(OfferRecord r, LocalDate today)`는 그대로이고 `qualifier`에서 `certainty`를 끌어낸다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/offer/OfferCertaintyTest.java`

```java
package com.discounttracker.offer;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/** 원장 qualifier에서 certainty를 끌어낸다. 원장은 안 고친다. */
class OfferCertaintyTest {

    private static OfferRecord record(String qualifier) {
        return new OfferRecord("baemin", "교촌치킨", 5000, qualifier, false, null, null, null,
                "2026-09-22T12:00:00+09:00", null, 20000, null, null, null, null, null, null,
                null, false);
    }

    @Test
    void ledgerQualifierBecomesCertainty() {
        LocalDate today = LocalDate.of(2026, 9, 22);
        assertEquals(Certainty.CAPPED, Offer.from(record("최대"), today).certainty());
        assertEquals(Certainty.RANDOM, Offer.from(record("랜덤"), today).certainty());
        assertEquals(Certainty.MENU_ONLY, Offer.from(record("특정메뉴"), today).certainty());
        assertEquals(Certainty.EXACT, Offer.from(record("최적"), today).certainty());
        assertEquals(Certainty.EXACT, Offer.from(record(null), today).certainty());
    }

    @Test
    void ledgerOffersAreAlwaysDiscount() {
        // 수집기가 kind를 적은 적이 없다. 배달앱에서 캐시백을 실제로 관측하면 그때 원장에
        // 선택 칸을 더한다. 옛 줄은 안 건드린다.
        assertEquals(AmountKind.DISCOUNT, Offer.from(record("최대"), LocalDate.of(2026, 9, 22)).kind());
    }

    @Test
    void responseCarriesBothQualifierAndCertaintyDuringTheTransition() throws Exception {
        // 드리프트 5. API와 웹이 따로 배포된다. 웹이 certainty를 아직 못 읽어도 qualifier로 선다.
        String json = new ObjectMapper()
                .writeValueAsString(Offer.from(record("최대"), LocalDate.of(2026, 9, 22)));
        assertTrue(json.contains("\"qualifier\":\"최대\""), json);
        assertTrue(json.contains("\"certainty\":\"capped\""), json);
        assertTrue(json.contains("\"kind\":\"discount\""), json);
        assertTrue(json.contains("\"fromBanner\":false"), json);
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.offer.OfferCertaintyTest`
Expected: 컴파일 실패. `cannot find symbol: method certainty()`

- [ ] **Step 3: 최소 구현을 쓴다**

`Offer.java`의 record 선언 끝에 두 칸을 더하고 `fromBanner`의 `@JsonIgnore`를 뗀다.

```java
public record Offer(String platform, Integer amount, String qualifier,
                    @JsonIgnore OfferStatus status,
                    String rawText, @JsonIgnore String screenshotPath, String capturedAt,
                    Integer minOrderAmount, String tierMode, List<DiscountTier> tiers, String conditions,
                    String expiresAt, String badge, boolean soldOut,
                    String link,
                    @JsonIgnore Membership membership,
                    // 배너에서 세운 오퍼인가. 출처 축이다 - qualifier의 "행사"가 같은 사실의
                    // 중복이었다. 웹이 읽어야 해서 이행 기간에 응답에 싣는다.
                    boolean fromBanner,
                    // 이 금액을 액면대로 견줄 수 있나. 원장 qualifier에서 끌어낸다.
                    Certainty certainty,
                    // 무엇을 주는가. 원장에서 온 오퍼는 전부 discount다.
                    AmountKind kind) {
```

`from`을 고친다.

```java
    public static Offer from(OfferRecord r, LocalDate today) {
        return new Offer(r.platform(), r.amountAsOf(today), r.qualifier(),
                r.status(), r.rawText(), r.screenshotPath(), r.capturedAt(),
                r.minOrderAmount(), r.tierMode(), r.liveTiers(today), r.conditions(), r.expiresAt(), r.badge(),
                Boolean.TRUE.equals(r.soldOut()), r.link(), r.membershipTier(),
                BANNER_OFFER_TYPE.equals(r.offerType()),
                Certainty.fromQualifier(r.qualifier()), AmountKind.DISCOUNT);
    }
```

`withDetailFrom`과 `convergedWith`가 만드는 `new Offer(...)` 두 곳에도 `certainty, kind`를 그대로 넘긴다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.offer.OfferCertaintyTest`
Expected: PASS, 3건

- [ ] **Step 5: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/offer/Offer.java api/src/test/java/com/discounttracker/offer/OfferCertaintyTest.java
git commit -m "feat(api): 오퍼가 확실성과 종류와 출처를 싣는다"
```
---

### Task 8: 배너에서 오퍼를 만드는 길이 문장을 안 읽는다

**Files:**
- Modify: `api/src/main/java/com/discounttracker/comparison/BrandComparisonService.java`
- Create: `api/src/test/java/com/discounttracker/comparison/BannerOfferCertaintyTest.java`

**Interfaces:**
- Consumes: `BannerCatalog.activeMembers()` (Task 6), `BannerAmount.certainty()` (Task 3), `OfferComparison` (Task 2), `Offer.certainty()` (Task 7).
- Produces: `BrandComparisonService.compare()`가 자사 배너도 오퍼로 세운다. `bannerQualifier`, `isRandom`, `isTargeted`, `bannerConditions`, `confirmedSortingAmount`가 사라지고 `OfferComparison.sortingAmount`가 대신한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/comparison/BannerOfferCertaintyTest.java`

```java
package com.discounttracker.comparison;

import com.discounttracker.banner.BannerCatalog;
import com.discounttracker.brand.BrandCatalog;
import com.discounttracker.offer.Certainty;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.OfferRepository;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** 배너 칸에서 바로 표식이 나온다. 서버가 만든 문장을 서버가 다시 읽지 않는다. */
class BannerOfferCertaintyTest {

    private static final Clock CLOCK =
            Clock.fixed(Instant.parse("2026-09-22T03:00:00Z"), ZoneId.of("Asia/Seoul"));

    private static BrandComparisonService service(String yml) {
        BannerCatalog banners = new BannerCatalog(
                new ByteArrayResource(yml.getBytes(StandardCharsets.UTF_8)), CLOCK, new BrandCatalog());
        return new BrandComparisonService(new OfferRepository(), new BrandCatalog(), banners, CLOCK, "");
    }

    private static Offer only(BrandComparisonService s) {
        List<BrandComparison> cards = s.compare();
        assertEquals(1, cards.size(), "카드 하나여야 한다");
        assertEquals(1, cards.get(0).offers().size(), "오퍼 하나여야 한다");
        return cards.get(0).offers().get(0);
    }

    @Test
    void openRangeBecomesCappedWithoutReadingTheSentence() {
        Offer o = only(service("""
                banners:
                  - id: bhc-20260922
                    brand: bhc
                    platform: coupangeats
                    url: "https://example.test/b"
                    amount: {won: [null, 8000]}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """));
        assertEquals(Certainty.CAPPED, o.certainty());
        assertEquals(8000, o.amount());
    }

    @Test
    void randomBeatsCapped() {
        Offer o = only(service("""
                banners:
                  - id: bhc-random-20260922
                    brand: bhc
                    platform: coupangeats
                    url: "https://example.test/r"
                    amount: {won: [null, 7000], random: true}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """));
        assertEquals(Certainty.RANDOM, o.certainty());
    }

    @Test
    void targetedIsCappedBecauseHalfTheVisitorsSeeSomethingElse() {
        // 2026-09-12 실측: bhc와 홍콩반점 8,000원이 계정에 따라 번갈아 떴다.
        Offer o = only(service("""
                banners:
                  - id: bhc-target-20260922
                    brand: bhc
                    platform: coupangeats
                    url: "https://example.test/t"
                    amount: {won: 8000}
                    targeted: true
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """));
        assertEquals(Certainty.CAPPED, o.certainty());
    }

    @Test
    void ownBannerNowStandsAsAnOffer() {
        // 브랜드 자체 앱이나 사이트의 행사도 그 브랜드를 보는 사람에게는 고를 수 있는 값이다.
        Offer o = only(service("""
                banners:
                  - id: baekeok-20260922
                    brand: 백억커피
                    platform: own
                    via: naverpay
                    url: "https://example.test/o"
                    amount: {percent: 50, kind: cashback}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """));
        assertEquals("own", o.platform());
        assertEquals(Certainty.PERCENT, o.certainty());
        assertEquals("https://example.test/o", o.link());
    }

    @Test
    void groupMembersEachGetTheirOwnOffer() {
        // 오퍼는 묶지 않는다. 묶음에 브랜드가 둘이면 브랜드 카드 둘에 오퍼가 하나씩 선다.
        List<BrandComparison> cards = service("""
                banners:
                  - id: dunkin-20260922
                    group: g1
                    brand: 던킨
                    platform: ddangyo
                    url: "https://example.test/d"
                    amount: {won: 7000}
                    minOrder: 15000
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                  - id: albolo-20260922
                    group: g1
                    brand: 피자알볼로
                    platform: ddangyo
                    url: "https://example.test/a"
                    amount: {won: 8000}
                    minOrder: 18000
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """).compare();
        assertEquals(2, cards.size());
        assertEquals(List.of(8000, 7000),
                cards.stream().map(c -> c.offers().get(0).amount()).toList());
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.comparison.BannerOfferCertaintyTest`
Expected: FAIL. 자사 배너 사례에서 `카드 하나여야 한다 ==> expected: <1> but was: <0>`

- [ ] **Step 3: 최소 구현을 쓴다**

`BrandComparisonService.bannerRecords()`를 아래로 바꾼다.

```java
    /**
     * 오늘 띄우는 배너 중 오퍼로 세울 수 있는 것.
     *
     * <p>브랜드가 없는 배너(앱 전체 행사)는 붙을 카드가 없어서 뺀다. 정률 배너는 금액이
     * 없어 대표값을 못 세우므로 역시 뺀다. 자사 배너는 2026-09-22부터 넣는다 - 브랜드
     * 자체 앱이나 사이트의 행사도 그 브랜드를 보는 사람에게는 고를 수 있는 값이다.
     *
     * <p>묶음은 접지 않는다. 브랜드마다 오퍼가 하나씩 선다.
     */
    private List<OfferRecord> bannerRecords() {
        String today = java.time.OffsetDateTime.now(clock).toString();
        List<OfferRecord> records = new ArrayList<>();
        for (Banner banner : banners.activeMembers()) {
            if (banner.brand() == null) continue;
            Integer amount = banner.amountSpec() == null ? null : banner.amountSpec().headline();
            if (amount == null) continue;
            records.add(new OfferRecord(
                    banner.platform(),
                    banner.brand(),
                    amount,
                    // 표식은 칸에서 나온다. 타겟딜은 계정에 따라 갈리므로 상한과 같은 성질이다.
                    qualifierOf(banner),
                    false,
                    "banner",
                    null,
                    banner.amount(),
                    today,
                    null,
                    banner.minOrder(),
                    null,
                    null,
                    BannerText.conditions(banner),
                    banner.endsOn().toString(),
                    banner.period(),
                    banner.url(),
                    banner.spec() == null ? null : banner.spec().membership(),
                    banner.soldOut()));
        }
        return records;
    }

    /**
     * 이행 기간에만 남는 다리. 원장 표기를 배너 칸에서 만든다.
     *
     * <p>{@code OfferRecord}가 아직 {@code qualifier}만 들고 있어서, 배너 칸에서 정한
     * 확실성을 원장 표기로 한 번 돌려 적는다. 6단계에서 {@code OfferRecord}가 확실성을
     * 직접 갖게 되면 이 메서드가 사라진다.
     */
    private static String qualifierOf(Banner banner) {
        com.discounttracker.offer.Certainty c = banner.isTargeted()
                ? com.discounttracker.offer.Certainty.CAPPED
                : banner.amountSpec().certainty();
        return switch (c) {
            case CAPPED, PERCENT -> "최대";
            case RANDOM -> "랜덤";
            case MENU_ONLY -> "특정메뉴";
            case EXACT -> null;
        };
    }
```

`bannerQualifier`, `isRandom`, `isTargeted`, `bannerConditions`와 상수 `BANNER_QUALIFIER`, `CUMULATIVE_QUALIFIER`, `TARGETED_MARK`, `LIMITED_MARK`, `MENU_LIMITED_SORTING_AMOUNT`를 지운다. `import com.discounttracker.banner.BannerText;`를 더하고 `BannerText`를 `public`으로 연다(지금 package-private다).

`confirmedSortingAmount(Offer)`를 지우고 부르던 자리를 바꾼다.

```java
                Integer forSorting = confirmed
                        ? com.discounttracker.offer.OfferComparison.sortingAmount(offer.certainty(), offer.amount())
                        : offer.amount();
```

랜덤 오퍼를 다른 자리에 두던 줄도 확실성으로 바꾼다.

```java
            String slot = offer.certainty() == com.discounttracker.offer.Certainty.RANDOM
                    ? record.platform() + "#random" : record.platform();
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.comparison.BannerOfferCertaintyTest`
Expected: PASS, 5건

- [ ] **Step 5: 저장소 전체를 돌린다**

Run: `cd api && ./gradlew test`
Expected: PASS. `BrandComparisonServiceTest`와 `TargetedBannerTest`가 옛 배너 모양을 쓰면 새 모양으로 고친다. 자사 배너가 이제 오퍼로 서므로 "자사는 오퍼에 안 선다"를 확인하던 사례가 있으면 그 기대값을 뒤집는다.

- [ ] **Step 6: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/ api/src/test/java/com/discounttracker/comparison/
git commit -m "feat(api): 배너 표식을 칸에서 만들고 자사 행사도 오퍼로 올린다"
```

---

# 2단계. 보관과 변환

파일을 건드리는 첫 단계다. 순서가 곧 되돌리기다.

### Task 9: 변환 전 원본을 보관한다

**Files:**
- Create: `beggars-ops/archive/banners-2026-09-22.yml`
- Create: `beggars-ops/archive/README.md`

**Interfaces:**
- Consumes: 없다.
- Produces: 없다. 사람이 읽는 기록이다.

보관하는 이유는 둘이다. 첫째, 서버가 적용할 때마다 남기는 `banners.yml.bak-<시각>`은 서버 디스크에만 있어서 디스크를 잃으면 같이 잃는다. 둘째, 지난 배너의 문장 칸은 "그때 화면에 무엇이 나갔나"라는 기록이고 나중에 관계형 데이터베이스로 옮길 때 원본이 필요하다. 변환도 삭제도 아닌 보관이다.

- [ ] **Step 1: 서버에서 지금 파일을 가져온다**

```bash
scp ubuntu@bebeggars.duckdns.org:/home/ubuntu/delivery-discount-api/data/banners.yml \
    "C:/Users/Jaewun/_dev/beggars-ops/archive/banners-2026-09-22.yml"
```

- [ ] **Step 2: 건수를 세어 적는다**

```bash
cd "C:/Users/Jaewun/_dev/beggars-ops" && \
python -c "import yaml,io; d=yaml.safe_load(io.open('archive/banners-2026-09-22.yml',encoding='utf-8')); print(len(d['banners']))"
```
Expected: 배너 건수가 찍힌다. 그 숫자를 아래 README에 적는다.

- [ ] **Step 3: 왜 남기는지 적는다**

`beggars-ops/archive/README.md`

```markdown
# 배너 파일 보관

서버의 `banners.yml`을 바꾸기 전 사본을 여기 남긴다.

`apply_proposal()`이 적용할 때마다 남기는 `banners.yml.bak-<시각>`과 다르다. 그쪽은
서버 디스크에만 있어서 디스크를 잃으면 같이 잃는다.

| 파일 | 시점 | 배너 수 | 왜 |
| --- | --- | --- | --- |
| `banners-2026-09-22.yml` | 배너 모델 재설계 변환 직전 | (2단계에서 센 값) | 지난 배너의 문장 칸이 "그때 화면에 무엇이 나갔나"라는 기록이다. 관계형 데이터베이스로 옮길 때 원본이 필요하다 |

지난 배너를 변환하지도 지우지도 않고 보관만 하는 것이 2026-09-22 결정이다. 설계 31의
결정 4번("지난 배너는 문장 칸 그대로 둔다")을 뒤집되 기록은 잃지 않는다.
```

- [ ] **Step 4: 커밋한다**

```bash
cd "C:/Users/Jaewun/_dev/beggars-ops"
git add archive/
git commit -m "chore: 배너 모델 변환 전 banners.yml 보관"
```

---

### Task 10: 변환기

기본이 `--dry-run`이다. 아무것도 안 쓴다.

**Files:**
- Create: `beggars-ops/tools/convert_banners.py`
- Create: `beggars-ops/tools/test_convert.py`

**Interfaces:**
- Consumes: `banner_ops.load_yml(text) -> (head, banners)`, `banner_ops.dump_yml(head, banners) -> text`.
- Produces: `convert_banner(old: dict) -> dict`, `convert_all(banners: list[dict]) -> tuple[list[dict], list[str]]`. 두 번째 값은 사람이 봐야 하는 배너의 id다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`beggars-ops/tools/test_convert.py`

```python
"""변환기 자체 점검. 서버에는 pytest가 없어 표준 라이브러리 assert로 돈다.

    python tools/test_convert.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from convert_banners import convert_banner, convert_all      # noqa: E402


def test_dates_become_moments():
    out = convert_banner({"id": "a", "startsOn": "2026-09-22", "endsOn": "2026-09-22",
                          "amount": "7,000원"})
    assert out["startsAt"] == "2026-09-22T00:00", out
    # endsOn: D는 "그날 포함"이라는 뜻이었다. 그날 23:59다.
    assert out["endsAt"] == "2026-09-22T23:59", out
    assert "startsOn" not in out and "endsOn" not in out


def test_plain_amount_becomes_won():
    out = convert_banner({"id": "a", "amount": "7,000원",
                          "startsOn": "2026-09-22", "endsOn": "2026-09-22"})
    assert out["amount"] == {"won": 7000}, out


def test_max_amount_becomes_open_range():
    out = convert_banner({"id": "a", "amount": "최대 8,000원",
                          "startsOn": "2026-09-22", "endsOn": "2026-09-22"})
    assert out["amount"] == {"won": [None, 8000]}, out


def test_percent_amount():
    out = convert_banner({"id": "a", "amount": "최대 30%",
                          "startsOn": "2026-09-22", "endsOn": "2026-09-22"})
    assert out["amount"] == {"percent": 30}, out


def test_limit_cashback_moves_into_amount_kind():
    # limit은 선착순이냐 랜덤이냐를 말하는 축이다. 적립이 들어갈 자리가 아니었다.
    out = convert_banner({"id": "a", "amount": "50%", "limit": "cashback",
                          "startsOn": "2026-09-21", "endsOn": "2026-09-21"})
    assert out["amount"] == {"percent": 50, "kind": "cashback"}, out
    assert "limit" not in out


def test_limit_first_come_becomes_first_come_field():
    out = convert_banner({"id": "a", "amount": "5,000원", "limit": "first_come", "usage": "issue",
                          "startsOn": "2026-09-22", "endsOn": "2026-09-22"})
    assert out["firstCome"] == "issue", out
    assert "limit" not in out and "usage" not in out


def test_targeted_moves_out_of_limit():
    out = convert_banner({"id": "a", "amount": "8,000원", "limit": "targeted",
                          "startsOn": "2026-09-22", "endsOn": "2026-09-22"})
    assert out["targeted"] is True, out


def test_random_moves_into_amount():
    out = convert_banner({"id": "a", "amountRange": [None, 7000], "limit": "random",
                          "startsOn": "2026-09-22", "endsOn": "2026-09-22"})
    assert out["amount"] == {"won": [None, 7000], "random": True}, out
    assert "amountRange" not in out


def test_items_split_into_one_banner_per_brand_sharing_a_group():
    old = {"id": "ce-open-20260922", "platform": "coupangeats", "url": "https://x.test/1",
           "startsOn": "2026-09-22", "endsOn": "2026-09-22", "priority": 3,
           "items": [{"brand": "던킨", "amount": 7000, "minOrder": 15000},
                     {"brand": "피자알볼로", "amount": 8000, "minOrder": 18000}]}
    out, review = convert_all([old])
    assert len(out) == 2, out
    assert {b["id"] for b in out} == {"ce-open-20260922-던킨", "ce-open-20260922-피자알볼로"}
    assert {b["group"] for b in out} == {"ce-open-20260922"}
    assert out[0]["amount"] == {"won": 7000} and out[0]["minOrder"] == 15000
    assert out[1]["amount"] == {"won": 8000} and out[1]["minOrder"] == 18000
    # 묶음은 priority와 알림을 같이 가져간다. 값이 하나여야 하는 것이 어긋나면 안 된다.
    assert all(b["priority"] == 3 for b in out)


def test_unreadable_amount_is_flagged_for_a_human():
    out, review = convert_all([{"id": "weird", "amount": "1+1 증정",
                                "startsOn": "2026-09-22", "endsOn": "2026-09-22"}])
    assert "weird" in review, review
    # 사람이 볼 때까지 원본을 그대로 둔다. 지어내지 않는다.
    assert out[0]["amount"] == "1+1 증정"


def test_sentence_fields_are_dropped_when_the_structure_can_make_them():
    out = convert_banner({"id": "a", "amount": "7,000원", "period": "9월 22일 하루",
                          "extra": "15,000원↑", "minOrder": 15000,
                          "startsOn": "2026-09-22", "endsOn": "2026-09-22"})
    assert "period" not in out and "extra" not in out


def run():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print("ok", fn.__name__)
    print(f"{len(fns)}건 통과")


if __name__ == "__main__":
    run()
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd "C:/Users/Jaewun/_dev/beggars-ops" && python tools/test_convert.py`
Expected: `ModuleNotFoundError: No module named 'convert_banners'`

- [ ] **Step 3: 최소 구현을 쓴다**

`beggars-ops/tools/convert_banners.py`

```python
#!/usr/bin/env python3
"""배너 파일을 옛 모양에서 새 모양으로 옮긴다. 기본은 아무것도 안 쓰는 --dry-run이다.

설계: mono/docs/superpowers/specs/2026-09-22-banner-model-design.md

    python tools/convert_banners.py --file /path/to/banners.yml            # 표만 찍는다
    python tools/convert_banners.py --file /path/to/banners.yml --apply    # 실제로 쓴다

--apply는 쓰기 전에 같은 자리에 .bak-<시각>을 남긴다. 변환 직전 원본은 별도로
archive/banners-<날짜>.yml에 커밋해 둔다(디스크를 잃어도 남게).
"""
from __future__ import annotations

import argparse
import datetime
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from banner_ops import load_yml, dump_yml                      # noqa: E402

# 사람이 적던 금액 문구. 맨 앞 값만 본다.
WON = re.compile(r"([0-9][0-9,]*)\s*(천)?원")
PERCENT = re.compile(r"([0-9]{1,3})\s*%")

# 새 모양으로 옮기면서 없어지는 칸.
DROPPED = ("amountRange", "limit", "usage", "items", "brands", "brandLabels",
           "period", "extra", "startsOn", "endsOn")


def _digits(raw: str) -> int | None:
    try:
        return int(str(raw).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def parse_amount(old: dict) -> dict | None:
    """문자열 amount와 amountRange를 새 amount 덩이로. 못 읽으면 None."""
    kind = "cashback" if old.get("limit") == "cashback" else None
    random = old.get("limit") == "random"

    rng = old.get("amountRange")
    if isinstance(rng, list) and len(rng) == 2:
        out = {"won": [_digits(rng[0]) if rng[0] is not None else None, _digits(rng[1])]}
        if random:
            out["random"] = True
        if kind:
            out["kind"] = kind
        return out

    text = old.get("amount")
    if isinstance(text, dict):
        return text                                    # 이미 새 모양이다
    if not isinstance(text, str):
        return None

    pct = PERCENT.search(text)
    won = WON.search(text)
    if pct and not won:
        out = {"percent": int(pct.group(1))}
        if kind:
            out["kind"] = kind
        return out
    if not won:
        return None
    value = _digits(won.group(1))
    if value is None:
        return None
    if won.group(2):                                   # "7천원"
        value *= 1000
    # 나열("7/6/5천원")은 items가 따로 있으므로 여기서는 맨 앞 값만 쓴다.
    out = {"won": [None, value]} if "최대" in text else {"won": value}
    if random:
        out = {"won": [None, value], "random": True}
    if kind:
        out["kind"] = kind
    return out


def convert_banner(old: dict, *, group: str | None = None,
                   amount: dict | None = None) -> dict:
    """배너 한 장을 새 모양으로. 못 읽는 금액은 원본을 그대로 남긴다."""
    new = {k: v for k, v in old.items() if k not in DROPPED}

    if old.get("startsOn") is not None:
        new["startsAt"] = f"{old['startsOn']}T00:00"
    if old.get("endsOn") is not None:
        # endsOn: D는 "그날 포함"이라는 뜻이었다.
        new["endsAt"] = f"{old['endsOn']}T23:59"

    parsed = amount if amount is not None else parse_amount(old)
    new["amount"] = parsed if parsed is not None else old.get("amount")

    limit = old.get("limit")
    if limit == "first_come":
        new["firstCome"] = old.get("usage") or "issue"
    elif limit == "targeted":
        new["targeted"] = True

    if group:
        new["group"] = group
    return new


def convert_all(banners: list[dict]) -> tuple[list[dict], list[str]]:
    """전부 옮긴다. 사람이 봐야 하는 배너의 id를 같이 돌려준다."""
    out: list[dict] = []
    review: list[str] = []
    for old in banners:
        items = old.get("items")
        if isinstance(items, list) and items:
            # 묶음 배너 하나가 브랜드마다 한 장이 된다. group으로 다시 묶인다.
            for it in items:
                brand = it.get("brand")
                amount = {"won": it["amount"]} if it.get("amount") is not None else None
                child = convert_banner(old, group=old.get("id"), amount=amount)
                child["id"] = f"{old.get('id')}-{brand}"
                child["brand"] = brand
                if it.get("minOrder") is not None:
                    child["minOrder"] = it["minOrder"]
                if it.get("opensAt"):
                    child["opensAt"] = it["opensAt"]
                if amount is None:
                    review.append(child["id"])
                out.append(child)
            continue
        new = convert_banner(old)
        if not isinstance(new.get("amount"), dict):
            review.append(str(old.get("id")))
        out.append(new)
    return out, review


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--file", required=True, help="banners.yml 경로")
    p.add_argument("--apply", action="store_true", help="실제로 쓴다. 기본은 안 쓴다")
    args = p.parse_args(argv)

    path = Path(args.file)
    head, banners = load_yml(path.read_text(encoding="utf-8"))
    out, review = convert_all(banners)

    print(f"배너 {len(banners)}장 -> {len(out)}장")
    if review:
        print(f"사람이 봐야 하는 배너 {len(review)}장: {', '.join(review)}")
    else:
        print("금액을 전부 읽었다")

    if not args.apply:
        print("미리보기다. 실제로 쓰려면 --apply")
        return 0

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(path, path.with_name(path.name + f".bak-{stamp}-convert"))
    path.write_text(dump_yml(head, out), encoding="utf-8")
    print(f"썼다. 백업: {path.name}.bak-{stamp}-convert")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd "C:/Users/Jaewun/_dev/beggars-ops" && python tools/test_convert.py`
Expected: `11건 통과`

- [ ] **Step 5: 커밋한다**

```bash
cd "C:/Users/Jaewun/_dev/beggars-ops"
git add tools/convert_banners.py tools/test_convert.py
git commit -m "feat(tools): 배너 파일 변환기. 기본은 안 쓰는 미리보기"
```
---

### Task 11: 문구가 바이트 단위로 같은지 확인하고 적용한다

**Files:**
- Create: `beggars-ops/tools/compare_banner_text.py`

**Interfaces:**
- Consumes: `convert_banners.convert_all` (Task 10), 1단계가 배포된 API의 `GET /api/brands`와 `POST /api/reload`.
- Produces: 없다. 사람이 읽는 표다.

변환이 무해한지 재는 기준은 하나다. 화면에 나가는 문구 셋(`amount`, `period`, `extra`)이 옛 모양과 새 모양에서 바이트 단위로 같은가. 다르다고 실패는 아니다. `endsOn`을 `endsAt`으로 옮기면서 기간 문구가 나아지는 경우가 있다. 다만 사람이 한 건씩 보고 넘어간다.

- [ ] **Step 1: 비교 도구를 쓴다**

`beggars-ops/tools/compare_banner_text.py`

```python
#!/usr/bin/env python3
"""옛 모양과 새 모양이 같은 문구를 내는지 서버에 물어 견준다. 아무것도 안 쓴다.

1단계가 배포되어 있어야 한다. API가 두 모양을 다 읽을 때만 뜻이 있다.

    python tools/compare_banner_text.py --file /path/to/banners.yml
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from banner_ops import load_yml, dump_yml                      # noqa: E402
from convert_banners import convert_all                        # noqa: E402

API = "http://127.0.0.1:8088"

# 배너 한 장에서 견줄 것. 화면 문구 셋과 오퍼가 되는 값들.
FIELDS = ("amount", "period", "extra", "minOrder", "brands", "priority", "soldOut")


def banners_from_api() -> list[dict]:
    with urllib.request.urlopen(f"{API}/api/banners", timeout=10) as res:
        return json.loads(res.read().decode("utf-8"))


def reload_with(path: Path, text: str) -> list[dict]:
    """파일을 잠깐 바꿔 읽히고 곧바로 되돌린다. 원래 내용은 호출 전에 들고 있어야 한다."""
    path.write_text(text, encoding="utf-8")
    urllib.request.urlopen(urllib.request.Request(f"{API}/api/reload", method="POST"), timeout=20).read()
    return banners_from_api()


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--file", required=True)
    args = p.parse_args(argv)

    path = Path(args.file)
    original = path.read_text(encoding="utf-8")
    head, banners = load_yml(original)
    converted, review = convert_all(banners)

    try:
        before = {b["id"]: b for b in reload_with(path, original)}
        after = {b["id"]: b for b in reload_with(path, dump_yml(head, converted))}
    finally:
        # 무슨 일이 있어도 원래 파일로 되돌린다.
        path.write_text(original, encoding="utf-8")
        urllib.request.urlopen(urllib.request.Request(f"{API}/api/reload", method="POST"), timeout=20).read()

    same, diff = 0, []
    for bid, old in before.items():
        new = after.get(bid)
        if new is None:
            # 묶음이 쪼개지면서 id가 바뀐다. group으로 찾는다.
            new = next((b for b in after.values() if b.get("group") == bid), None)
        if new is None:
            diff.append((bid, "새 모양에서 사라졌다", "", ""))
            continue
        for f in FIELDS:
            if old.get(f) != new.get(f):
                diff.append((bid, f, old.get(f), new.get(f)))
            else:
                same += 1

    print(f"같은 값 {same}칸, 다른 값 {len(diff)}칸")
    for bid, field, a, b in diff:
        print(f"  {bid}  {field}\n    전: {a!r}\n    후: {b!r}")
    if review:
        print(f"금액을 못 읽어 원본을 남긴 배너 {len(review)}장: {', '.join(review)}")
    print("아무것도 안 썼다. 파일은 원래대로다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: 서버에서 비교를 돌린다**

```bash
ssh ubuntu@bebeggars.duckdns.org \
  "cd /home/ubuntu/beggars-ops && python3 tools/compare_banner_text.py --file /home/ubuntu/delivery-discount-api/data/banners.yml"
```
Expected: 다른 칸의 목록이 찍힌다. 한 건씩 읽고 "왜 달라졌는지"가 설명되는지 본다. 설명이 안 되는 차이가 하나라도 있으면 여기서 멈추고 `convert_banners.py`를 고친 뒤 다시 돌린다.

- [ ] **Step 3: 적용한다**

```bash
ssh ubuntu@bebeggars.duckdns.org \
  "cd /home/ubuntu/beggars-ops && python3 tools/convert_banners.py --file /home/ubuntu/delivery-discount-api/data/banners.yml --apply"
```

- [ ] **Step 4: 읽혔는지 확인한다**

```bash
curl -s -X POST http://bebeggars.duckdns.org/api/reload | python -m json.tool
```
Expected: `"bannersOk": true`. 배너 건수가 2단계에서 보관해 둔 수와 같거나(묶음이 쪼개진 만큼) 늘어야 한다.

`bannersOk`가 false면 즉시 되돌린다. 응답의 배너 건수는 새로 읽은 값이 아니라 이전 목록 그대로라서, 건수만 보고 성공으로 읽으면 안 된다.

```bash
ssh ubuntu@bebeggars.duckdns.org \
  "cd /home/ubuntu/delivery-discount-api/data && cp \$(ls -t banners.yml.bak-*-convert | head -1) banners.yml"
curl -s -X POST http://bebeggars.duckdns.org/api/reload
```

- [ ] **Step 5: 적용 후 파일도 보관한다**

```bash
scp ubuntu@bebeggars.duckdns.org:/home/ubuntu/delivery-discount-api/data/banners.yml \
    "C:/Users/Jaewun/_dev/beggars-ops/archive/banners-2026-09-22-converted.yml"
cd "C:/Users/Jaewun/_dev/beggars-ops"
git add tools/compare_banner_text.py archive/
git commit -m "feat(tools): 변환 전후 문구 비교. 적용 결과 보관"
```

---

# 3단계. ops 콘솔

### Task 12: 콘솔 스키마를 새 칸으로 바꾼다

**Files:**
- Modify: `beggars-ops/ops_apply.py:241-290`
- Modify: `beggars-ops/tools/test_schema_form.mjs`

**Interfaces:**
- Consumes: 없다.
- Produces: `banner_schema()`가 새 칸을 그린다. `SPEC_KEYS`가 `["opensAt", "channel", "membership", "event", "note"]`가 된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`beggars-ops/tools/test_schema_form.mjs`의 끝에 붙인다.

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('스키마가 2026-09-22 새 칸을 그린다', () => {
  const out = execFileSync('python', ['-c',
    'import json,ops_apply; print(json.dumps(ops_apply.banner_schema(), ensure_ascii=False))'],
    { cwd: new URL('..', import.meta.url).pathname.replace(/^\//, ''), encoding: 'utf-8' })
  const schema = JSON.parse(out)
  const keys = schema.groups.flatMap((g) => g.fields.map((f) => f.key))

  for (const k of ['group', 'via', 'amount', 'startsAt', 'endsAt', 'targeted', 'firstCome', 'untilSoldOut']) {
    assert.ok(keys.includes(k), `새 칸이 없다: ${k}`)
  }
  // 없어진 칸을 계속 그리면 사람이 적고 서버가 무시한다.
  for (const k of ['items', 'amountRange', 'limit', 'usage', 'period', 'extra', 'startsOn', 'endsOn', 'brands']) {
    assert.ok(!keys.includes(k), `없어진 칸이 남아 있다: ${k}`)
  }
  assert.deepEqual(schema.specKeys, ['opensAt', 'channel', 'membership', 'event', 'note'])
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd "C:/Users/Jaewun/_dev/beggars-ops" && node --test tools/test_schema_form.mjs`
Expected: FAIL. `새 칸이 없다: group`

- [ ] **Step 3: 최소 구현을 쓴다**

`ops_apply.py`의 `BANNER_SCHEMA`를 아래로 바꾼다.

```python
BANNER_SCHEMA = {
    "groups": [
        {"key": "basic", "title": "기본", "note": "배너를 가리키고 언제 보일지 정하는 값",
         "fields": [
             {"key": "id", "label": "id", "hint": "브랜드-날짜. 고유", "required": True, "lockAfterCreate": True},
             {"key": "group", "label": "묶음", "hint": "같은 값을 적은 배너끼리 한 장으로 그린다. 비우면 혼자"},
             {"key": "brand", "label": "브랜드", "hint": "한 장에 하나", "required": True},
             {"key": "platform", "label": "플랫폼", "kind": "select",
              "options": ["own", "baemin", "coupangeats", "ddangyo", "yogiyo"],
              "labels": {"own": "own (자체 행사)"}, "hint": "own = 브랜드 자체 앱이나 사이트"},
             {"key": "via", "label": "제휴 결제", "hint": "naverpay 등. 아이콘만 바뀐다"},
             {"key": "url", "label": "링크", "hint": "?가 있어도 그대로", "required": True},
             {"key": "startsAt", "label": "시작", "hint": "YYYY-MM-DDTHH:MM. 17시 오픈이면 T17:00", "required": True},
             {"key": "endsAt", "label": "끝", "hint": "YYYY-MM-DDTHH:MM. 그날 끝이면 T23:59", "required": True},
             {"key": "priority", "label": "노출 순서", "kind": "number", "hint": "낮을수록 먼저. 묶음은 구성원 중 가장 작은 값"},
             {"key": "soldOutOn", "label": "소진일", "hint": "YYYY-MM-DD. 그날부터 '오늘 소진'"},
             {"key": "color", "label": "색", "hint": "#rrggbb. 비우면 로고에서"},
         ]},
        {"key": "value", "title": "무엇을 얼마나", "note": "won과 percent는 하나만 쓴다",
         "fields": [
             {"key": "amount", "label": "금액", "kind": "textarea", "required": True,
              "hint": "{won: 8000} / {won: [null, 8000]} / {won: [1000, 8000], random: true} / {percent: 50, kind: cashback}"},
             {"key": "minOrder", "label": "최소주문", "kind": "number", "hint": "숫자만"},
         ]},
        {"key": "who", "title": "누가 받나",
         "fields": [
             {"key": "membership", "label": "멤버십", "hint": "coupangEats, baeminClub …"},
             {"key": "channel", "label": "채널", "kind": "select", "options": ["", "배달", "포장"]},
             {"key": "targeted", "label": "개인 지정", "kind": "select", "options": ["", "true", "false"],
              "labels": {"true": "타겟딜", "false": "누구나"}},
         ]},
        {"key": "howmany", "title": "몇 명까지",
         "fields": [
             {"key": "firstCome", "label": "선착순", "kind": "select", "options": ["", "issue", "use"],
              "labels": {"issue": "발급 선착순", "use": "사용 선착순"}},
             {"key": "untilSoldOut", "label": "소진 시 종료", "kind": "select", "options": ["", "true", "false"]},
             {"key": "opensAt", "label": "매일 여는 시각", "hint": "HH:MM. 하루짜리 행사는 시작 칸에 적는다"},
         ]},
        {"key": "words", "title": "사람이 읽는 것", "note": "문구는 서버가 이 값들로 만든다",
         "fields": [
             {"key": "event", "label": "행사 제목", "hint": "더블 땡데이, 위클리 슈퍼딜"},
             {"key": "note", "label": "비고", "hint": "위 칸 어디에도 안 담기는 한 줄"},
         ]},
    ],
}
SPEC_KEYS = ["opensAt", "channel", "membership", "event", "note"]
LIST_KEYS = []
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd "C:/Users/Jaewun/_dev/beggars-ops" && node --test tools/test_schema_form.mjs`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
cd "C:/Users/Jaewun/_dev/beggars-ops"
git add ops_apply.py tools/test_schema_form.mjs
git commit -m "feat(ops): 콘솔 스키마를 배너 새 칸으로 바꾼다"
```

---

### Task 13: 묶음 알림과 모양 혼용을 적용 전에 막는다

푸시는 나가면 되돌릴 수 없다. 서버가 조용히 하나로 합치면 사람은 넷을 켰다고 믿은 채로 하나만 나간다. 계산으로 접지 않고 사람에게 묻는다.

**Files:**
- Modify: `beggars-ops/ops_apply.py:92-155`
- Create: `beggars-ops/tools/test_group_guard.py`

**Interfaces:**
- Consumes: `banner_ops.load_yml`.
- Produces: `group_problem(banners: list[dict]) -> str | None`, `shape_problem(banner: dict) -> str | None`. 둘 다 `apply_proposal`과 `apply_edits`가 쓰기 전에 부른다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`beggars-ops/tools/test_group_guard.py`

```python
"""묶음 검사와 모양 혼용 검사. 표준 라이브러리 assert로 돈다.

    python tools/test_group_guard.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ops_apply import group_problem, shape_problem            # noqa: E402


def test_group_with_matching_notify_passes():
    assert group_problem([
        {"id": "a", "group": "g1", "notify": True, "priority": 3},
        {"id": "b", "group": "g1", "notify": True, "priority": 3},
    ]) is None


def test_mixed_notify_in_one_group_is_refused():
    # 구성원의 notify가 서로 다른 시점에 켜지면 같은 행사로 푸시가 두 번 나간다.
    why = group_problem([
        {"id": "a", "group": "g1", "notify": True},
        {"id": "b", "group": "g1", "notify": False},
    ])
    assert why is not None and "g1" in why and "notify" in why, why


def test_mixed_immediate_notify_is_refused():
    why = group_problem([
        {"id": "a", "group": "g1", "notifyImmediately": True},
        {"id": "b", "group": "g1"},
    ])
    assert why is not None and "notifyImmediately" in why, why


def test_ungrouped_banners_are_never_compared():
    assert group_problem([
        {"id": "a", "notify": True},
        {"id": "b", "notify": False},
    ]) is None


def test_old_and_new_date_fields_together_are_refused():
    # 드리프트 2. 어느 쪽이 이기는지 파일만 봐서는 모른다.
    why = shape_problem({"id": "a", "startsOn": "2026-09-22", "startsAt": "2026-09-22T17:00"})
    assert why is not None and "startsOn" in why, why


def test_sentence_and_structure_together_are_refused():
    # 드리프트 1. 구조 칸만 고치면 화면은 안 바뀌는데 고친 사람은 고쳤다고 믿는다.
    why = shape_problem({"id": "a", "amount": {"won": 8000}, "extra": "15,000원↑"})
    assert why is not None and "extra" in why, why


def test_pure_new_shape_passes():
    assert shape_problem({"id": "a", "amount": {"won": 8000},
                          "startsAt": "2026-09-22T00:00", "endsAt": "2026-09-22T23:59"}) is None


def run():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print("ok", fn.__name__)
    print(f"{len(fns)}건 통과")


if __name__ == "__main__":
    run()
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd "C:/Users/Jaewun/_dev/beggars-ops" && python tools/test_group_guard.py`
Expected: `ImportError: cannot import name 'group_problem'`

- [ ] **Step 3: 최소 구현을 쓴다**

`ops_apply.py`에 `check_ops_copy` 아래로 더한다.

```python
# 묶음 안에서 값이 하나여야 하는 칸. priority는 서버가 구성원 중 가장 작은 값으로
# 계산하므로 여기서 안 본다. 알림은 계산으로 못 접는다 - 나가면 되돌릴 수 없어서,
# 서버가 조용히 하나로 합치면 사람은 넷을 켰다고 믿은 채로 하나만 나간다.
GROUP_UNIFORM = ("notify", "notifyImmediately")


def group_problem(banners: list[dict]) -> str | None:
    """같은 group 안에서 알림 설정이 섞여 있나. 섞여 있으면 사람이 맞춰 적어야 한다."""
    by_group: dict[str, list[dict]] = {}
    for b in banners:
        g = b.get("group")
        if g:
            by_group.setdefault(str(g), []).append(b)
    for group, mates in sorted(by_group.items()):
        for field in GROUP_UNIFORM:
            values = {bool(m.get(field)) for m in mates}
            if len(values) > 1:
                ids = ", ".join(sorted(str(m.get("id")) for m in mates))
                return (f"묶음 {group}의 {field}가 섞여 있다 - 같은 행사로 푸시가 두 번 "
                        f"나간다. 구성원({ids})에 같은 값을 적을 것")
    return None


# 옛 칸과 새 칸을 같이 적으면 어느 쪽이 이기는지 파일만 봐서는 모른다(드리프트 1, 2).
SHAPE_PAIRS = (("startsOn", "startsAt"), ("endsOn", "endsAt"))
SENTENCE_FIELDS = ("period", "extra")


def shape_problem(banner: dict) -> str | None:
    """옛 모양과 새 모양을 섞어 적었나."""
    for old, new in SHAPE_PAIRS:
        if banner.get(old) is not None and banner.get(new) is not None:
            return f"{banner.get('id')}: {old}와 {new}를 같이 적었다. 하나만 남길 것"
    if isinstance(banner.get("amount"), dict):
        for f in SENTENCE_FIELDS:
            if banner.get(f) is not None:
                return (f"{banner.get('id')}: 구조 칸(amount)과 문장 칸({f})을 같이 적었다. "
                        f"문장이 이겨서 구조 칸을 고쳐도 화면이 안 바뀐다. 문장 칸을 비울 것")
    return None
```

`apply_proposal`의 `unknown_brands` 검사 바로 뒤에 더한다.

```python
    for op in ops:
        if op_key(op) not in approved:
            continue
        why = shape_problem(op.get("banner") or op.get("fields") or {})
        if why:
            return {"ok": False, "error": f"옛 모양과 새 모양이 섞였다 - {why}"}
```

그리고 `assert_only_touched` 바로 뒤, 파일을 쓰기 전에 더한다. `apply_edits`에도 같은 두 줄을 넣는다.

```python
    why = group_problem(banners)
    if why:
        return {"ok": False, "error": why}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd "C:/Users/Jaewun/_dev/beggars-ops" && python tools/test_group_guard.py`
Expected: `7건 통과`

- [ ] **Step 5: 커밋하고 배포한다**

```bash
cd "C:/Users/Jaewun/_dev/beggars-ops"
git add ops_apply.py tools/test_group_guard.py
git commit -m "feat(ops): 묶음 알림과 모양 혼용을 적용 전에 막는다"
git push
```

배포는 `.github/workflows`가 한다. `nginx -t`와 경로 확인까지 통과하는지 본다. 되돌리기는 이전 커밋을 다시 배포하는 것이다.
---

### Task 14: 콘솔의 묶기와 풀기가 group 칸을 쓴다

지금 묶기는 배너 여럿을 `brands`와 `amount` 나열을 가진 배너 하나로 합치고, 풀기는 그 나열을 도로 쪼갠다. 새 모양에서는 배너를 그대로 두고 `group` 값만 맞추거나 지운다. 금액 나열을 문자열로 붙였다 떼는 일이 통째로 사라진다.

**Files:**
- Modify: `beggars-ops/web/index.html:251-330`
- Modify: `beggars-ops/tools/test_grouping.mjs`

**Interfaces:**
- Consumes: 없다.
- Produces: `groupBanners(banners, groupId) -> banners`, `ungroupBanners(banners) -> banners`. `amountParts`, `mergeBanners`, `splitBanner`는 사라진다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`beggars-ops/tools/test_grouping.mjs`를 통째로 바꾼다.

```javascript
// 묶기와 풀기. 배너를 다시 쓰지 않고 group 값만 맞추거나 지운다(2026-09-22 재설계).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8')
const pick = (name) => {
  const start = html.indexOf(`function ${name}(`)
  assert.ok(start > 0, `${name}가 콘솔에 없다`)
  let depth = 0, i = html.indexOf('{', start)
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++
    else if (html[j] === '}' && --depth === 0) return html.slice(start, j + 1)
  }
  throw new Error(`${name}의 끝을 못 찾았다`)
}
const src = ['groupBanners', 'ungroupBanners'].map(pick).join('\n')
const { groupBanners, ungroupBanners } = new Function(src +
  '\nreturn {groupBanners, ungroupBanners}')()

const three = [
  {id: 'ce-20260922-두찜', brand: '두찜', amount: {won: 7000}, priority: 5},
  {id: 'ce-20260922-자담치킨', brand: '자담치킨', amount: {won: 6000}, priority: 9},
  {id: 'ce-20260922-꾸브라꼬', brand: '꾸브라꼬 숯불치킨', amount: {won: 5000}, priority: 7},
]

// 묶어도 배너는 그대로 셋이다. 금액을 문자열로 붙였다 떼지 않는다.
const grouped = groupBanners(three, 'ce-17si-20260922')
assert.equal(grouped.length, 3)
assert.deepEqual(grouped.map(b => b.group), ['ce-17si-20260922', 'ce-17si-20260922', 'ce-17si-20260922'])
assert.deepEqual(grouped.map(b => b.amount), [{won: 7000}, {won: 6000}, {won: 5000}])
// priority는 서버가 구성원 중 가장 작은 값으로 계산한다. 콘솔이 안 건드린다.
assert.deepEqual(grouped.map(b => b.priority), [5, 9, 7])

// 푸는 일은 group을 비우는 일이다. 배너를 다시 쓰지 않는다.
const loose = ungroupBanners(grouped)
assert.equal(loose.length, 3)
assert.ok(loose.every(b => b.group === undefined || b.group === null))
assert.deepEqual(loose.map(b => b.amount), [{won: 7000}, {won: 6000}, {won: 5000}])

// 묶음 id를 안 주면 첫 배너의 id를 쓴다. 사람이 이름을 안 지어도 묶인다.
assert.equal(groupBanners(three)[0].group, 'ce-20260922-두찜')
console.log('grouping: PASS')
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd "C:/Users/Jaewun/_dev/beggars-ops" && node tools/test_grouping.mjs`
Expected: `groupBanners가 콘솔에 없다`

- [ ] **Step 3: 최소 구현을 쓴다**

`beggars-ops/web/index.html`에서 `amountParts`, `mergeBanners`, `splitBanner` 셋을 지우고 아래 둘을 넣는다.

```javascript
// 묶기·풀기(2026-09-22 재설계). 배너를 다시 쓰지 않는다 — group 값만 맞추거나 지운다.
// 예전에는 금액을 "7/6/5천원"으로 붙였다 떼느라 단위가 섞이면 남의 금액이 나갔다.
function groupBanners(banners, groupId){
  const id = groupId || (banners[0] && banners[0].id);
  return banners.map(b => ({...b, group: id}));
}
function ungroupBanners(banners){
  return banners.map(b => { const {group, ...rest} = b; return rest; });
}
```

단추를 잇는 자리(`group-btn`, `ungroup-btn`)를 아래로 바꾼다.

```javascript
  document.getElementById("group-btn").onclick = () => {
    const picked = selectedOps();
    if (picked.length < 2) return toast("두 장 이상 골라야 묶는다");
    const name = prompt("묶음 이름", picked[0].banner.id) || picked[0].banner.id;
    const next = groupBanners(picked.map(op => op.banner), name);
    replaceProposal(picked, next.map(b => ({op:"add", why:"콘솔에서 묶기", auto:false, banner:b})));
  };
  document.getElementById("ungroup-btn").onclick = () => {
    const picked = selectedOps();
    if (!picked.length) return toast("풀 배너를 고른다");
    const next = ungroupBanners(picked.map(op => op.banner));
    replaceProposal(picked, next.map(b => ({op:"add", why:"콘솔에서 풀기", auto:false, banner:b})));
  };
```

`selectedOps()`와 `replaceProposal()`은 지금 단추가 쓰던 자리 코드를 그대로 함수로 뽑은 것이다. 뽑기 전 코드가 무엇을 하는지 먼저 읽고, 고른 op 목록을 돌려주는 부분과 `POST /ops/proposal`로 통째로 갈아끼우는 부분을 각각 옮긴다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd "C:/Users/Jaewun/_dev/beggars-ops" && node tools/test_grouping.mjs && node --test tools/test_schema_form.mjs`
Expected: `grouping: PASS`와 스키마 테스트 PASS

- [ ] **Step 5: 커밋하고 배포한다**

```bash
cd "C:/Users/Jaewun/_dev/beggars-ops"
git add web/index.html tools/test_grouping.mjs
git commit -m "feat(ops): 묶기와 풀기가 group 칸을 쓴다"
git push
```

배포 뒤 콘솔에서 배너 둘을 골라 묶고 다시 풀어 본다. 금액이 그대로인지 화면에서 확인한다.

---

# 4단계. 웹

순서를 지킨다. `PlatformBadge`, 플랫폼 필터, 묶음 렌더다. 필터를 먼저 열면 자사 오퍼가 `PlatformBadge`에 닿아 페이지 전체가 안 그려진다.

### Task 15: PlatformBadge가 모르는 키에서 안 죽는다

**Files:**
- Modify: `web/src/platforms.js`
- Modify: `web/src/logos.jsx:48-78`
- Create: `web/src/platformBadge.test.js`
- Modify: `web/package.json` (테스트 스크립트 한 줄)

**Interfaces:**
- Consumes: 없다.
- Produces: `PARTNERS`와 `ICON_BY_KEY`가 `platforms.js`에서 나온다. `iconFor(platformKey, via)`가 `platforms.js`에서 나온다. `PlatformBadge({ platformKey, via, brand, onClick, active })`가 모르는 키에 null을 돌려준다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/src/platformBadge.test.js`

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { iconFor, ICON_BY_KEY, PLATFORMS } from './platforms.js'

test('배달앱 넷은 그대로 찾는다', () => {
  for (const p of PLATFORMS) {
    assert.equal(iconFor(p.key, null).key, p.key)
  }
})

test('own은 아이콘이 없다 - 브랜드 로고 자리다', () => {
  // 지금 코드는 PLATFORM_BY_KEY['own'].key를 읽어 TypeError를 낸다. 웹에 에러 경계가
  // 없어서 카드 하나가 아니라 페이지 전체가 안 그려진다.
  assert.equal(iconFor('own', null), null)
  assert.equal(iconFor(undefined, null), null)
  assert.equal(iconFor('듣도보도못한앱', null), null)
})

test('via가 있으면 제휴 결제 마크가 이긴다', () => {
  assert.equal(iconFor('own', 'naverpay').key, 'naverpay')
  assert.equal(iconFor('baemin', 'naverpay').key, 'naverpay')
})

test('via는 아이콘에만 쓴다 - 필터 목록에는 안 들어간다', () => {
  assert.ok(!PLATFORMS.some((p) => p.key === 'naverpay'))
  assert.ok(ICON_BY_KEY.naverpay)
})
```

`web/package.json`의 `scripts`에 더하고 `test`에 잇는다.

```json
    "test:platform-badge": "node --test src/platformBadge.test.js",
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && node --test src/platformBadge.test.js`
Expected: FAIL. `SyntaxError: The requested module './platforms.js' does not provide an export named 'iconFor'`

- [ ] **Step 3: 최소 구현을 쓴다**

`web/src/platforms.js`를 아래로 바꾼다.

```javascript
// 플랫폼 목록. 컴포넌트(logos.jsx)와 분리한 순수 모듈 — filters.js와 그 테스트가 쓴다.
export const PLATFORMS = [
  { key: 'baemin', label: '배달의민족', initial: '배' },
  { key: 'coupangeats', label: '쿠팡이츠', initial: '쿠' },
  { key: 'ddangyo', label: '땡겨요', initial: '땡' },
  { key: 'yogiyo', label: '요기요', initial: '요' },
]
export const PLATFORM_BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]))

// 브랜드 자체 앱이나 사이트의 행사. 배달앱이 아니라 필터에 안 들어간다.
export const OWN = 'own'

// 제휴 결제 수단. 아이콘에만 쓴다 — 필터가 고르는 것은 "어느 배달앱으로 시킬까"인데
// 결제 수단은 그 질문의 답이 아니다.
export const PARTNERS = [
  { key: 'naverpay', label: '네이버페이', initial: 'N' },
]

export const ICON_BY_KEY = Object.fromEntries(
  [...PLATFORMS, ...PARTNERS].map((p) => [p.key, p]))

/**
 * 이 오퍼에 그릴 아이콘. 없으면 null이고 부르는 쪽이 브랜드 로고로 떨어진다.
 *
 * via가 platform을 이긴다 — 백억커피 네이버페이 적립은 앱이 아니라 결제 수단이
 * 알아볼 표식이다. 모르는 키는 null이다: 예전에는 PLATFORM_BY_KEY[key].key를 바로
 * 읽어 own에서 TypeError가 났고, 웹에 에러 경계가 없어 페이지 전체가 안 그려졌다.
 */
export function iconFor(platformKey, via) {
  return ICON_BY_KEY[via] ?? ICON_BY_KEY[platformKey] ?? null
}
```

`web/src/logos.jsx`의 `PlatformBadge`를 아래로 바꾸고 맨 위 import에 `iconFor`를 더한다.

```javascript
export function PlatformBadge({ platformKey, via = null, brand = null, onClick, active }) {
  const p = iconFor(platformKey, via)
  // 아이콘이 없는 자리(자사 행사)는 브랜드 로고를 그대로 쓴다. 로고도 없으면 아무것도
  // 안 그린다 — 여기서 죽으면 카드 하나가 아니라 페이지 전체가 안 그려진다.
  if (!p) return brand ? <BrandLogo name={brand} /> : null
  const content = (
    <>
      <img
        src={platformIconSrc(p.key)}
        alt=""
        loading="lazy"
        decoding="async"
        width={LOGO_PX}
        height={LOGO_PX}
        onLoad={hideSiblingFallback}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
      <span className="platform-badge__fallback" aria-hidden="true">{p.initial}</span>
      <span className="sr-only">{p.label}</span>
    </>
  )
  const className = `platform-badge platform-badge--${p.key}${active === false ? ' platform-badge--dim' : ''}`
  if (onClick) {
    return (
      <button type="button" className={className} title={p.label} aria-pressed={active === true} onClick={onClick}>
        {content}
      </button>
    )
  }
  return (
    <span className={className} title={p.label}>
      {content}
    </span>
  )
}
```

`web/src/App.jsx:279`와 `:344`의 두 호출에 `via`와 `brand`를 넘긴다.

```jsx
        <PlatformBadge platformKey={offer.platform} via={offer.via} brand={brandName} />
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && node --test src/platformBadge.test.js && npm run build`
Expected: 테스트 4건 PASS, 빌드 성공

- [ ] **Step 5: 커밋한다**

```bash
git add web/src/platforms.js web/src/logos.jsx web/src/App.jsx web/src/platformBadge.test.js web/package.json
git commit -m "fix(web): PlatformBadge가 모르는 플랫폼 키에서 페이지를 죽이지 않는다"
```

---

### Task 16: 자사 오퍼를 플랫폼 필터 밖에 둔다

**Files:**
- Modify: `web/src/filters.js`
- Modify: `web/src/filters.test.js`

**Interfaces:**
- Consumes: `OWN` (Task 15).
- Produces: `applyFilters`가 `platform === 'own'`인 오퍼를 플랫폼 토글과 무관하게 남긴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/src/filters.test.js`에 붙인다.

```javascript
import { applyFilters, defaultFilters } from './filters.js'

test('자사 오퍼는 플랫폼 필터 밖이다 - 배달앱을 다 꺼도 남는다', () => {
  const brands = [{
    name: '백억커피',
    category: 'cafe',
    offers: [
      { platform: 'own', amount: 5000, certainty: 'exact', kind: 'cashback' },
      { platform: 'baemin', amount: 3000, certainty: 'exact', kind: 'discount' },
    ],
  }]
  const all = defaultFilters()
  assert.equal(applyFilters(brands, all)[0].offers.length, 2)

  // 필터가 고르는 것은 "어느 배달앱으로 시킬까"다. 자사 행사는 그 질문의 답이 아니다.
  const none = { ...defaultFilters(), platforms: new Set() }
  const left = applyFilters(brands, none)
  assert.equal(left.length, 1)
  assert.deepEqual(left[0].offers.map((o) => o.platform), ['own'])
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && node --test src/filters.test.js`
Expected: FAIL. `Expected values to be strictly equal: 0 !== 1`

- [ ] **Step 3: 최소 구현을 쓴다**

`web/src/filters.js`의 import에 `OWN`을 더하고 `applyFilters`의 오퍼 거르는 줄을 바꾼다.

```javascript
import { PLATFORMS, OWN } from './platforms.js'
```

```javascript
      const offers = b.offers.filter((o) => (o.platform === OWN || filters.platforms.has(o.platform))
        && (!filters.minAmount5k || (o.amount ?? 0) >= 5000))
```

같은 파일의 `isDefaultFilters`는 안 건드린다. 자사는 체크상자가 아니라서 기본 상태 판정에 안 들어간다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && node --test src/filters.test.js`
Expected: PASS, 4건

- [ ] **Step 5: 커밋한다**

```bash
git add web/src/filters.js web/src/filters.test.js
git commit -m "feat(web): 자사 오퍼를 플랫폼 필터 밖에 둔다"
```

---

### Task 17: 웹이 확실성으로 판정한다

**Files:**
- Modify: `web/src/filters.js`
- Modify: `web/src/filters.test.js`

**Interfaces:**
- Consumes: `docs/contracts/certainty-cases.json` (Task 2), 응답의 `offer.certainty`와 `offer.kind` (Task 7).
- Produces: `certaintyOf(offer)`, `isBestCandidate(offer)`, `sortingAmount(offer)`가 `filters.js`에서 나온다. `comparable(offer, include)`와 `bestConfirmedAmount(offers, include)`는 이름과 인자가 그대로다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/src/filters.test.js`에 붙인다.

```javascript
import { readFileSync } from 'node:fs'
import { certaintyOf, isBestCandidate, sortingAmount } from './filters.js'

test('판정표를 API와 같이 읽는다 - 규칙을 두 벌 적지 않는다(ADR-016)', () => {
  const { cases } = JSON.parse(
    readFileSync(new URL('../../docs/contracts/certainty-cases.json', import.meta.url), 'utf8'))
  assert.ok(cases.length >= 8, '판정표가 비었거나 줄었다')
  for (const c of cases) {
    const offer = { certainty: c.certainty, kind: c.kind, soldOut: c.soldOut, amount: c.amount }
    assert.equal(isBestCandidate(offer), c.best, JSON.stringify(c))
    assert.equal(sortingAmount(offer), c.sorting, JSON.stringify(c))
  }
})

test('certainty가 안 오면 qualifier로 읽는다 - API와 웹은 따로 배포된다', () => {
  // 드리프트 5. 웹이 먼저 나가면 아직 안 오는 certainty를 읽어 전부 회색이 된다.
  assert.equal(certaintyOf({ qualifier: '최대' }), 'capped')
  assert.equal(certaintyOf({ qualifier: '랜덤' }), 'random')
  assert.equal(certaintyOf({ qualifier: '특정메뉴' }), 'menuOnly')
  assert.equal(certaintyOf({ qualifier: '최적' }), 'exact')
  assert.equal(certaintyOf({ qualifier: '행사' }), 'exact')
  assert.equal(certaintyOf({}), 'exact')
  // certainty가 오면 그쪽이 이긴다.
  assert.equal(certaintyOf({ qualifier: '최대', certainty: 'random' }), 'random')
})

test('캐시백은 최고 할인 후보가 아니다 - 액면으로 견줄 수 없다', () => {
  const offers = [
    { amount: 3000, certainty: 'exact', kind: 'discount' },
    { amount: 9000, certainty: 'exact', kind: 'cashback' },
  ]
  assert.equal(bestConfirmedAmount(offers), 3000)
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && node --test src/filters.test.js`
Expected: FAIL. `does not provide an export named 'certaintyOf'`

- [ ] **Step 3: 최소 구현을 쓴다**

`web/src/filters.js`의 `INCOMPARABLE` 블록을 통째로 아래로 바꾼다.

```javascript
/**
 * 이 금액을 액면대로 견줄 수 있나.
 *
 * API가 `certainty`를 내려준다. 아직 안 오면 옛 `qualifier`에서 읽는다 — API와 웹은
 * 미러 저장소가 둘이라 배포 시각이 어긋난다. 양쪽이 다 나간 뒤에 이 다리를 뗀다.
 */
const CERTAINTY_FROM_QUALIFIER = {
  최대: 'capped',
  랜덤: 'random',
  특정메뉴: 'menuOnly',
}

export function certaintyOf(offer) {
  return offer.certainty ?? CERTAINTY_FROM_QUALIFIER[offer.qualifier] ?? 'exact'
}

export function kindOf(offer) {
  return offer.kind ?? 'discount'
}

/**
 * 카드의 "최고 할인"으로 세울 수 있는 값인가.
 *
 * 같은 판정이 api의 OfferComparison.isBestCandidate에도 있다. 판정표
 * docs/contracts/certainty-cases.json을 양쪽 테스트가 같이 읽어 어긋남을 막는다(ADR-016).
 */
export function isBestCandidate(offer) {
  return certaintyOf(offer) === 'exact' && kindOf(offer) === 'discount' && !offer.soldOut
}

/** 특정 메뉴 한정 쿠폰이 정렬에서 갖는 값. 5,000원 바로 아래다. */
export const MENU_LIMITED_SORTING_AMOUNT = 4999

/** 카드 정렬에 기여하는 금액. 견줄 수 없으면 null이라 아예 안 들어간다. */
export function sortingAmount(offer) {
  const c = certaintyOf(offer)
  if (c === 'menuOnly') return MENU_LIMITED_SORTING_AMOUNT
  if (c === 'capped' || c === 'random' || c === 'percent') return null
  return offer.amount ?? null
}

export const RANDOM_QUALIFIER = '랜덤'
export function isRandom(offer) {
  return certaintyOf(offer) === 'random'
}

export const MENU_QUALIFIER = '특정메뉴'
export function isMenuOnly(offer) {
  return certaintyOf(offer) === 'menuOnly'
}

/** 넣을 것. `true`는 예전 호출(랜덤만)과 같다. 객체면 {random, menu}. */
function includesOf(include) {
  if (include === true) return { random: true, menu: false }
  if (!include) return { random: false, menu: false }
  return { random: !!include.random, menu: !!include.menu }
}

export function comparable(offer, include = false) {
  const inc = includesOf(include)
  if (inc.random && isRandom(offer)) return true
  if (inc.menu && isMenuOnly(offer)) return true
  return isBestCandidate({ ...offer, soldOut: false })
}
```

`bestConfirmedAmount`는 그대로 둔다. `comparable`이 새 규칙을 타므로 자동으로 따라온다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && npm run test:filters`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add web/src/filters.js web/src/filters.test.js
git commit -m "feat(web): 확실성과 종류로 판정한다. qualifier는 다리로만 남긴다"
```

---

### Task 18: 배너 표식이 종류를 읽는다

**Files:**
- Modify: `web/src/EventBanner.jsx:328-338`
- Create: `web/src/bannerTag.test.js`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: 응답의 `banner.amount`가 이제 구조 칸이고 `banner.firstCome`, `banner.targeted`가 온다.
- Produces: `bannerTag(banner)`가 `EventBanner.jsx`에서 나간다. 새 위치는 `web/src/bannerTag.js`다 — `node --test`가 `.jsx`를 못 읽는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/src/bannerTag.test.js`

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { bannerTag } from './bannerTag.js'

test('표식은 칸에서 나온다 - 문구를 되짚지 않는다', () => {
  assert.deepEqual(bannerTag({ firstCome: 'issue' }), { kind: 'first-come', label: '선착순' })
  assert.deepEqual(bannerTag({ targeted: true }), { kind: 'targeted', label: '타겟' })
  assert.deepEqual(bannerTag({ amount: { won: [1000, 8000], random: true } }),
    { kind: 'random', label: '랜덤' })
})

test('캐시백과 적립은 문구가 다르다 - 쓸 수 있는 곳이 다르다', () => {
  assert.deepEqual(bannerTag({ amount: { percent: 50, kind: 'cashback' } }),
    { kind: 'cashback', label: '캐시백' })
  assert.deepEqual(bannerTag({ amount: { percent: 5, kind: 'points' } }),
    { kind: 'cashback', label: '적립' })
})

test('할인 배너에는 표식이 없다', () => {
  assert.equal(bannerTag({ amount: { won: 8000 } }), null)
  assert.equal(bannerTag({}), null)
})

test('선착순이 랜덤보다 먼저다 - 뽑기 선착순은 선착순으로 읽힌다', () => {
  assert.deepEqual(bannerTag({ firstCome: 'use', amount: { won: [null, 7000], random: true } }),
    { kind: 'first-come', label: '선착순' })
})
```

`web/package.json`에 더하고 `test`에 잇는다.

```json
    "test:banner-tag": "node --test src/bannerTag.test.js",
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && node --test src/bannerTag.test.js`
Expected: FAIL. `Cannot find module './bannerTag.js'`

- [ ] **Step 3: 최소 구현을 쓴다**

`web/src/bannerTag.js`

```javascript
/**
 * 배너 오른쪽 위에 붙는 표식. 칸에서 바로 나온다.
 *
 * 예전에는 period와 extra 문장에 "선착순"이나 "랜덤"이 있는지 봤다. 서버가 구조 칸으로
 * 만든 문장을 화면이 다시 읽던 자리다(2026-09-18에 없애기로 한 파싱).
 *
 * 캐시백과 적립을 갈라 쓴다. 비교 규칙에서는 둘 다 최고 후보에서 빠져 차이가 없지만,
 * 받은 값을 어디서 쓸 수 있는지가 달라 문구가 달라야 한다. 캐시백은 그 결제 수단이
 * 닿는 곳이면 어디서든 쓰고, 적립은 그 브랜드나 그 앱 안에서만 쓴다.
 */
export function bannerTag(banner) {
  if (banner.firstCome) return { kind: 'first-come', label: '선착순' }
  if (banner.targeted) return { kind: 'targeted', label: '타겟' }
  const amount = banner.amount
  if (amount && typeof amount === 'object') {
    if (amount.kind === 'cashback') return { kind: 'cashback', label: '캐시백' }
    if (amount.kind === 'points') return { kind: 'cashback', label: '적립' }
    if (amount.random) return { kind: 'random', label: '랜덤' }
  }
  return null
}
```

`web/src/EventBanner.jsx`에서 `bannerTag` 함수를 지우고 맨 위에 `import { bannerTag } from './bannerTag.js'`를 더한다. 부르는 자리는 그대로다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && node --test src/bannerTag.test.js && npm run build`
Expected: 테스트 4건 PASS, 빌드 성공

- [ ] **Step 5: 프리뷰로 확인받는다**

```bash
git checkout -b web/banner-model
git add web/src/bannerTag.js web/src/bannerTag.test.js web/src/EventBanner.jsx web/package.json
git commit -m "feat(web): 배너 표식이 칸에서 나온다"
git push -u origin web/banner-model
```

미러 저장소는 main만 밀어 준다. 프리뷰는 subtree split을 손으로 민다.

```bash
git subtree split -q --prefix=web -b _split_banner_model web/banner-model
git push -q web-mirror _split_banner_model:preview/banner-model --force
git branch -D _split_banner_model
```

프리뷰 주소는 `https://beggars-git-preview-banner-model-nn98s-projects.vercel.app`다. 360px에서 아래 셋을 본다.

1. 자사 배너가 오퍼 칩으로 서고 브랜드 로고가 아이콘 자리에 뜬다.
2. 배달앱 넷을 다 꺼도 자사 오퍼가 남는다.
3. 묶음 배너가 한 장으로 뜨고 로고가 구성원 수만큼 늘어선다.

승인을 받은 뒤 main에 올린다.

---

# 5단계. 정리

### Task 19: 옛 모양 읽기를 지운다

이 단계부터는 앞으로만 간다. 4단계까지가 되돌릴 수 있는 구간이다. 시작하기 전에 두 가지를 확인한다. 첫째, 서버 `banners.yml`에 `startsOn`, `endsOn`, 문자열 `amount`, `period`, `extra`가 한 줄도 없다. 둘째, API와 웹이 둘 다 배포되어 있고 프리뷰 승인이 끝났다.

**Files:**
- Modify: `api/src/main/java/com/discounttracker/banner/BannerCatalog.java`
- Modify: `api/src/main/java/com/discounttracker/banner/Banner.java`
- Modify: `api/src/main/java/com/discounttracker/offer/Offer.java`
- Modify: `web/src/filters.js`

**Interfaces:**
- Consumes: 앞선 전부.
- Produces: `Banner`에서 `amount`, `period`, `extra`가 사라지고 `BannerText`가 만든 값만 응답에 실린다. `Offer.qualifier`가 응답에서 빠진다. `filters.certaintyOf`의 `qualifier` 다리가 빠진다.

- [ ] **Step 1: 옛 칸이 파일에 안 남았는지 확인한다**

```bash
ssh ubuntu@bebeggars.duckdns.org \
  "grep -nE '^\\s+(startsOn|endsOn|period|extra|items|amountRange|limit|usage):' /home/ubuntu/delivery-discount-api/data/banners.yml || echo '옛 칸 없음'"
```
Expected: `옛 칸 없음`. 하나라도 나오면 여기서 멈추고 그 배너를 콘솔에서 고친다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/banner/BannerGroupTest.java`의 `oldShapeStillLoads`를 아래로 바꾼다.

```java
    @Test
    void oldShapeNoLongerLoads() {
        // 5단계. 문장 칸과 날짜 칸을 적은 배너는 이제 안 뜬다. 변환이 끝났고 콘솔이
        // 새 칸만 그린다 - 옛 칸을 계속 받아 주면 사람이 적고 서버가 무시한다.
        BannerCatalog c = catalog("""
                banners:
                  - id: kyochon-20260922
                    brand: 교촌치킨
                    platform: baemin
                    url: "https://example.test/k"
                    amount: "12,000원"
                    period: 9월 22일 하루
                    startsOn: 2026-09-22
                    endsOn: 2026-09-22
                """);
        assertEquals(List.of(), c.active());
        assertEquals(List.of("kyochon-20260922"), c.dropped());
    }
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests com.discounttracker.banner.BannerGroupTest`
Expected: FAIL. `expected: <[]> but was: <[Banner[...]]>`

- [ ] **Step 4: 최소 구현을 쓴다**

`BannerCatalog.moment()`에서 `on` 갈래를 지우고 `startsAt`과 `endsAt`만 읽는다. `toBanner`에서 문자열 `amount`, `period`, `extra` 읽기를 지운다. `mixedShape` 검사도 지운다 - 옛 칸이 아예 안 읽히므로 섞일 수가 없다.

`Banner` record에서 `amount`, `period`, `extra` 구성 요소를 지우고 아래 셋으로 바꾼다.

```java
    /** 화면 금액 문구. 구조 칸에서 만든다. */
    public String amount() {
        return BannerText.amount(amountSpec);
    }

    /** 화면 기간 문구. */
    public String period() {
        return BannerText.period(this);
    }

    /** 화면 부가 문구. */
    public String extra() {
        return BannerText.extra(this);
    }
```

`Offer` record에서 `String qualifier` 구성 요소를 지운다. `Offer.from`에서 `r.qualifier()`는 `Certainty.fromQualifier(r.qualifier())`에만 쓴다.

`web/src/filters.js`의 `CERTAINTY_FROM_QUALIFIER`와 `certaintyOf`의 다리를 지운다.

```javascript
export function certaintyOf(offer) {
  return offer.certainty ?? 'exact'
}
```

`filters.test.js`의 "certainty가 안 오면 qualifier로 읽는다" 사례를 지운다.

- [ ] **Step 5: 통과를 확인한다**

Run: `cd api && ./gradlew test && cd ../web && npm test`
Expected: 양쪽 다 PASS

- [ ] **Step 6: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/ api/src/test/java/com/discounttracker/ web/src/filters.js web/src/filters.test.js
git commit -m "chore: 배너 옛 모양 읽기와 qualifier 다리를 지운다"
```

---

## Self-Review

**1. 스펙 덮개.** 설계의 절마다 짚어 본다.

| 스펙 절 | 어느 Task | 
| --- | --- |
| 새 구조(group, via, amount, startsAt, endsAt, membership, channel, targeted, firstCome, untilSoldOut, event, note) | Task 3, 4, 6 |
| amount가 값의 유형을 갖는다 | Task 3 |
| 멤버십은 자격이지 제한이 아니다 | Task 4(칸), Task 5(문구) |
| 날짜 대신 시각 | Task 4, 6, 10 |
| 오퍼에는 자사 행사도 올린다 | Task 8(API), Task 15, 16(웹) |
| note는 남긴다 | Task 5 |
| 없어지는 칸 | Task 5(BannerSpec), Task 6(읽기), Task 19(정리) |
| qualifier 한 칸이 세 질문을 겸한다 | Task 1, 7 |
| 배너에서 오퍼를 만드는 길이 문장을 되짚는다 | Task 8 |
| 축 넷 중 둘은 이미 있다 | Task 7(tierMode와 fromBanner를 그대로 두고 응답에만 싣는다) |
| 옛 qualifier에서 끌어내는 대응 | Task 1 |
| 비교 규칙: 지금 두 곳이 서로 다르다 | Task 2, 8, 17 |
| 자사 오퍼를 올리면 걸리는 곳 셋 | Task 15(아이콘), Task 16(필터), Task 8(링크는 offer.link로 이미 있다) |
| 묶음이 화면에 닿는 곳 | Task 6(priority), Task 13(알림) |
| 오퍼는 묶지 않는다 | Task 8 |
| 원장을 고칠 것인가 | Task 1, 7. 안 고친다 |
| 드리프트 1(문장 칸이 남은 배너) | Task 13 `shape_problem` |
| 드리프트 2(startsOn과 startsAt 동시) | Task 6 `mixedShape`, Task 13 `shape_problem` |
| 드리프트 3(콘솔이 옛 칸을 지운다) | Task 12(스키마에서 옛 칸을 뺀다), 기존 `assert_only_touched`가 나머지를 지킨다 |
| 드리프트 4(certainty를 만드는 길이 둘) | Task 2 판정표, Task 8 `qualifierOf` |
| 드리프트 5(API와 웹 배포 시각) | Task 7(둘 다 싣는다), Task 17(없으면 qualifier로 읽는다) |
| 드리프트 6(수집기가 qualifier를 계속 적는다) | 손댈 것이 없다. A안의 이점이다 |
| 마이그레이션 0단계 백업 | Task 9 |
| 1단계 API | Task 1~8 |
| 2단계 dry-run | Task 11 |
| 3단계 적용 | Task 11 |
| 4단계 ops 콘솔 | Task 12, 13, 14 |
| 5단계 웹 | Task 15, 16, 17, 18 |
| 6단계 정리 | Task 19 |
| 지난 배너를 어떻게 할지 | Task 9. 보관한다 |

빈 곳이 하나 있었다. 설계의 "드리프트 4"가 "한 브랜드에 배너 오퍼와 원장 오퍼가 둘 다 있고 certainty가 다르면 서버가 경고 로그를 남긴다"고 적었는데 Task에 없었다. Task 8의 Step 3에 아래를 더한다.

```java
    // 드리프트 4. 두 길이 다른 답을 내면 같은 브랜드의 같은 앱에서 배너 오퍼와 원장
    // 오퍼가 다른 배지를 단다. 화면을 봐도 안 보이는 어긋남이라 로그로 남긴다.
    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(BrandComparisonService.class);
```

`compare(List<OfferRecord>)`의 `byBrand.computeIfAbsent(...).merge(...)` 바로 뒤에 넣는다.

```java
            Offer kept = byBrand.get(name).get(slot);
            if (kept != offer && kept.fromBanner() != offer.fromBanner()
                    && kept.certainty() != offer.certainty()) {
                log.warn("배너 오퍼와 원장 오퍼의 certainty가 다르다 - {} {} {} vs {}",
                        name, record.platform(), kept.certainty(), offer.certainty());
            }
```

**2. 자리 표시 검사.** "TBD", "나중에", "적절히", "Task N과 같다"를 찾았다. 없다. 코드가 필요한 모든 단계에 실제 코드가 들어 있다. Task 14의 `selectedOps()`와 `replaceProposal()`은 예외인데, 지금 콘솔 코드에서 뽑아내는 것이라 새로 쓰는 코드가 아니고 어디서 뽑는지 적어 두었다.

**3. 이름 어긋남 검사.**

- `Certainty.MENU_ONLY`의 JSON 표기는 `menuOnly`다. 판정표, Java, JavaScript 셋 다 `menuOnly`다.
- `BannerAmount.headline()`은 Task 3에서 만들고 Task 8에서만 부른다.
- `BannerCatalog.activeMembers()`는 Task 6에서 만들고 Task 8에서 부른다. `active()`는 화면용이다.
- `BannerText.conditions(Banner)`는 Task 5에서 만들고 Task 8에서 부른다. Task 8이 `BannerText`를 `public`으로 여는 것을 명시했다.
- `Banner.startsOn()`과 `endsOn()`은 Task 4에서 메서드가 되고 `BrandComparisonService`가 `banner.endsOn().toString()`으로 계속 부른다.
- 웹의 `isBestCandidate(offer)`는 오퍼 하나를 받고, Java의 `isBestCandidate(Certainty, AmountKind, boolean)`는 셋을 받는다. 인자 모양이 다른 것은 의도다. 판정표가 둘을 묶는다.
- `group_problem`과 `shape_problem`은 Task 13에서 만들고 같은 Task가 `apply_proposal`과 `apply_edits`에 꽂는다.
- `iconFor(platformKey, via)`는 Task 15에서 만들고 같은 Task의 `PlatformBadge`가 부른다.

**4. 범위.** 세 저장소를 오가지만 하나의 변경이다. 배너 모델을 바꾸면 API, 운영 콘솔, 웹이 같이 안 움직이면 화면이 깨진다. 나눌 수 없다.
