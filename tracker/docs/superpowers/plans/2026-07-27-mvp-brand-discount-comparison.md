# 브랜드 할인 교차 비교 MVP 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수집된 배달앱 브랜드 할인(107건)을 앱별로 나란히 비교하는 웹 프로토타입을, 파이썬 데이터 공급 + 스프링 REST + React 화면으로 만든다.

**Architecture:** 두 레포, 하나의 파일 경계. 현재 파이썬 레포는 원장을 정제해 `export.json`을 뽑는 스크립트 하나만 추가한다(데이터 공급자). 신규 스프링 레포가 메인이다 — `export.json`을 읽고, 별칭으로 브랜드를 묶고, 확정/미확정을 판정하고, 최고 확정 할인 큰 순으로 정렬해 REST로 낸다. React(Vite)가 그 API를 불러 한 페이지에 교차 비교를 그린다.

**Tech Stack:** Python 3.14 + pytest(공급자), Java 17 + Spring Boot 3 + Gradle + JUnit5(API), React 18 + Vite(프론트)

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-27-mvp-brand-discount-comparison-design.md`. 필드명/의미를 바꾸지 않는다.
- 데이터 경계는 `export.json` 파일 하나뿐이다. 스프링이 파이썬을 호출하거나 그 반대는 없다.
- `export.json`의 필드명은 **camelCase**다 (`needsReview`, `capturedAt`, `screenshotPath`). 파이썬 원장은 snake_case이므로 export 스크립트가 변환한다.
- 브랜드명 정규화(별칭 묶기)는 **스프링에서만** 한다. 파이썬은 판독된 원본 이름을 그대로 낸다.
- 확정 판정: `amount`가 있고 `needsReview`가 false면 `confirmed`, 아니면 `held`.
- 정렬: 최고 확정 할인 큰 순. 확정값이 없는 브랜드는 미확정 최댓값 기준으로 그 아래.
- 결정론적 로직(파이썬 export, 스프링 서비스/컨트롤러)은 자동 테스트로 검증한다. React 화면은 자동 테스트 대신 실기(브라우저) 검증한다 — 기존 저장소 관례.
- 커밋 메시지는 한글로 작성한다.
- 신규 스프링 레포 경로: `C:/Users/soldesk/IdeaProjects/delivery-discount-api` (현재 레포의 형제 디렉터리). 자바 패키지는 `com.discounttracker`.

---

## 파일 구조

```
delivery-discount-tracker/          # 현재 레포 (파이썬, 데이터 공급자)
  export_data.py                    # 신규: 원장 → export.json + brands-sorted.txt
  tests/test_export_data.py         # 신규

delivery-discount-api/              # 신규 레포 (스프링, 메인)
  build.gradle  settings.gradle
  src/main/java/com/discounttracker/
    DiscountApiApplication.java
    model/OfferRecord.java          # export.json 한 항목
    model/Offer.java                # 화면용 offer (status 포함)
    model/BrandComparison.java      # 대표 브랜드 + offers
    data/ExportDataLoader.java      # export.json 읽기 (리로드 가능)
    alias/AliasResolver.java        # brand-aliases.yml → 대표명 매핑
    service/BrandComparisonService.java  # 묶기+신뢰도+정렬
    web/BrandController.java        # GET /api/brands, POST /api/reload
    web/WebConfig.java              # CORS (프론트 dev 서버 허용)
  src/main/resources/
    application.yml                 # export.json 경로
    brand-aliases.yml               # 대표명 → 별칭
    data/export.json                # 파이썬에서 복사 (gitignore)
  src/test/java/com/discounttracker/
    alias/AliasResolverTest.java
    service/BrandComparisonServiceTest.java
    web/BrandControllerTest.java
  web/                              # React (Vite)
    package.json  vite.config.js  index.html
    src/main.jsx  src/App.jsx  src/api.js  src/App.css
```

---

### Task 1: 파이썬 데이터 공급자 — `export_data.py`

**Files:**
- Create: `export_data.py`
- Test: `tests/test_export_data.py`

**Interfaces:**
- Consumes: `store.read_records(log_path) -> list[dict]`, `store.latest_per_brand(records) -> dict`
- Produces:
  - `build_export(records: list[dict]) -> list[dict]` — 원장 레코드(snake_case)를 camelCase export 항목으로 변환한 배열. 각 항목 키: `platform, brand, amount, qualifier, needsReview, offerType, section, rawText, capturedAt, screenshotPath`
  - `sorted_brand_names(records: list[dict]) -> list[str]` — 고유 브랜드명(원본) 이름 오름차순
  - CLI: `python export_data.py` → `data/export.json`, `data/brands-sorted.txt` 생성

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_export_data.py`:
```python
from export_data import build_export, sorted_brand_names

RECORDS = [
    {
        "platform": "baemin", "brand": "도미노피자", "amount": 5000,
        "qualifier": None, "needs_review": False, "offer_type": "discount",
        "section": "오늘의 할인", "raw_text": "5,000원 브랜드 할인",
        "captured_at": "2026-07-27T14:20:00+09:00", "unit": "KRW", "scope": "brand",
        "target_address": "x", "capture_mode": "manual",
        "screenshot_path": "ref/delivery/baemin_2026-07-27.jpg",
    },
    {
        "platform": "yogiyo", "brand": "굽네치킨", "amount": 7000,
        "qualifier": "최대", "needs_review": True, "offer_type": "discount",
        "section": None, "raw_text": "최대 7,000원 할인",
        "captured_at": "2026-07-27T14:25:00+09:00", "unit": "KRW", "scope": "brand",
        "target_address": "x", "capture_mode": "manual",
        "screenshot_path": "ref/delivery/yogiyo_2026-07-27 (1).jpg",
    },
]


def test_build_export_converts_to_camel_case():
    out = build_export(RECORDS)
    item = next(x for x in out if x["brand"] == "도미노피자")
    assert item["needsReview"] is False
    assert item["offerType"] == "discount"
    assert item["capturedAt"] == "2026-07-27T14:20:00+09:00"
    assert item["screenshotPath"] == "ref/delivery/baemin_2026-07-27.jpg"
    # snake_case 키는 남지 않는다
    assert "needs_review" not in item
    assert "capture_mode" not in item   # export에 불필요한 필드는 뺀다


def test_build_export_keeps_amount_and_qualifier():
    out = build_export(RECORDS)
    goobne = next(x for x in out if x["brand"] == "굽네치킨")
    assert goobne["amount"] == 7000
    assert goobne["qualifier"] == "최대"
    assert goobne["needsReview"] is True


def test_sorted_brand_names_unique_and_ascending():
    dup = RECORDS + [dict(RECORDS[0])]   # 도미노피자 중복
    names = sorted_brand_names(dup)
    assert names == ["굽네치킨", "도미노피자"]   # 중복 제거 + 오름차순
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_export_data.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'export_data'`

- [ ] **Step 3: 최소 구현**

`export_data.py`:
```python
import json
from pathlib import Path

from store import read_records, latest_per_brand

# export.json 항목에 담을 필드: (원장 snake_case 키, export camelCase 키)
FIELDS = [
    ("platform", "platform"),
    ("brand", "brand"),
    ("amount", "amount"),
    ("qualifier", "qualifier"),
    ("needs_review", "needsReview"),
    ("offer_type", "offerType"),
    ("section", "section"),
    ("raw_text", "rawText"),
    ("captured_at", "capturedAt"),
    ("screenshot_path", "screenshotPath"),
]

LOG_PATH = Path(__file__).parent / "data" / "log.jsonl"
EXPORT_PATH = Path(__file__).parent / "data" / "export.json"
BRANDS_PATH = Path(__file__).parent / "data" / "brands-sorted.txt"


def build_export(records: list[dict]) -> list[dict]:
    latest = latest_per_brand(records)
    out = []
    for record in latest.values():
        out.append({camel: record.get(snake) for snake, camel in FIELDS})
    return out


def sorted_brand_names(records: list[dict]) -> list[str]:
    return sorted({r["brand"] for r in records})


def main() -> int:
    records = read_records(LOG_PATH)
    EXPORT_PATH.write_text(
        json.dumps(build_export(records), ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    BRANDS_PATH.write_text(
        "\n".join(sorted_brand_names(records)) + "\n", encoding="utf-8",
    )
    print(f"export.json {len(build_export(records))}건, "
          f"brands-sorted.txt {len(sorted_brand_names(records))}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest tests/test_export_data.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: 실제 데이터로 생성 확인**

Run: `python export_data.py`
Expected: `data/export.json`(브랜드 수만큼), `data/brands-sorted.txt` 생성. `export.json` 첫 항목에 `needsReview`, `capturedAt` 키가 있고 snake_case 없음.

- [ ] **Step 6: 커밋**

```bash
git add export_data.py tests/test_export_data.py
git commit -m "feat: 원장을 export.json으로 뽑는 데이터 공급 스크립트 추가"
```

`data/export.json`과 `data/brands-sorted.txt`는 `.gitignore`의 `data/*` 규칙으로 이미 제외된다(`data/.gitkeep`만 추적). 별도 조치 불필요.

---

### Task 2: 스프링 프로젝트 스캐폴드 + 데이터 로더

**Files (신규 레포 `../delivery-discount-api`):**
- Create: `settings.gradle`, `build.gradle`
- Create: `src/main/java/com/discounttracker/DiscountApiApplication.java`
- Create: `src/main/java/com/discounttracker/model/OfferRecord.java`
- Create: `src/main/java/com/discounttracker/data/ExportDataLoader.java`
- Create: `src/main/resources/application.yml`
- Create: `src/main/resources/data/export.json` (Task 1 산출물 복사)
- Test: `src/test/java/com/discounttracker/data/ExportDataLoaderTest.java`

**Interfaces:**
- Produces:
  - `record OfferRecord(String platform, String brand, Integer amount, String qualifier, boolean needsReview, String offerType, String section, String rawText, String capturedAt, String screenshotPath)`
  - `ExportDataLoader.load() -> List<OfferRecord>` — 설정된 경로의 export.json을 읽어 파싱. 파일 없으면 빈 리스트.
  - `ExportDataLoader.reload() -> void` — 다시 읽어 내부 캐시 교체
  - `ExportDataLoader.records() -> List<OfferRecord>` — 현재 캐시

- [ ] **Step 1: Gradle 프로젝트 생성**

`../delivery-discount-api/settings.gradle`:
```groovy
rootProject.name = 'delivery-discount-api'
```

`../delivery-discount-api/build.gradle`:
```groovy
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.3.5'
    id 'io.spring.dependency-management' version '1.1.6'
}

group = 'com.discounttracker'
version = '0.0.1'
java { toolchain { languageVersion = JavaLanguageVersion.of(17) } }

repositories { mavenCentral() }

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}

tasks.named('test') { useJUnitPlatform() }
```

`src/main/java/com/discounttracker/DiscountApiApplication.java`:
```java
package com.discounttracker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DiscountApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(DiscountApiApplication.class, args);
    }
}
```

`src/main/resources/application.yml`:
```yaml
discount:
  export-path: classpath:data/export.json
server:
  port: 8080
```

- [ ] **Step 2: export.json 준비**

현재 레포에서 만든 `data/export.json`을 신규 레포 `src/main/resources/data/export.json`으로 복사한다.

```bash
mkdir -p ../delivery-discount-api/src/main/resources/data
cp data/export.json ../delivery-discount-api/src/main/resources/data/export.json
```

`.gitignore`에 `src/main/resources/data/export.json` 추가(데이터는 파이썬이 소유, 스프링 레포엔 커밋 안 함). 단 테스트가 클래스패스에서 읽으므로 파일 자체는 존재해야 한다.

- [ ] **Step 3: 실패하는 테스트 작성**

`src/test/java/com/discounttracker/data/ExportDataLoaderTest.java`:
```java
package com.discounttracker.data;

import com.discounttracker.model.OfferRecord;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ExportDataLoaderTest {

    private static final String JSON = """
        [
          {"platform":"baemin","brand":"도미노피자","amount":5000,"qualifier":null,
           "needsReview":false,"offerType":"discount","section":"오늘의 할인",
           "rawText":"5,000원 브랜드 할인","capturedAt":"2026-07-27T14:20:00+09:00",
           "screenshotPath":"ref/delivery/baemin_2026-07-27.jpg"},
          {"platform":"yogiyo","brand":"굽네치킨","amount":7000,"qualifier":"최대",
           "needsReview":true,"offerType":"discount","section":null,
           "rawText":"최대 7,000원 할인","capturedAt":"2026-07-27T14:25:00+09:00",
           "screenshotPath":"ref/delivery/yogiyo_2026-07-27 (1).jpg"}
        ]
        """;

    private ExportDataLoader loaderFor(String json) {
        return new ExportDataLoader(new ByteArrayResource(json.getBytes(
                java.nio.charset.StandardCharsets.UTF_8)));
    }

    @Test
    void parsesAllRecords() {
        ExportDataLoader loader = loaderFor(JSON);
        loader.reload();
        List<OfferRecord> records = loader.records();
        assertEquals(2, records.size());
    }

    @Test
    void mapsFieldsIncludingNulls() {
        ExportDataLoader loader = loaderFor(JSON);
        loader.reload();
        OfferRecord domino = loader.records().stream()
                .filter(r -> r.brand().equals("도미노피자")).findFirst().orElseThrow();
        assertEquals("baemin", domino.platform());
        assertEquals(5000, domino.amount());
        assertNull(domino.qualifier());
        assertFalse(domino.needsReview());

        OfferRecord goobne = loader.records().stream()
                .filter(r -> r.brand().equals("굽네치킨")).findFirst().orElseThrow();
        assertEquals("최대", goobne.qualifier());
        assertTrue(goobne.needsReview());
    }

    @Test
    void missingFileGivesEmptyList() {
        ExportDataLoader loader = new ExportDataLoader(
                new org.springframework.core.io.ClassPathResource("data/does-not-exist.json"));
        loader.reload();
        assertTrue(loader.records().isEmpty());
    }
}
```

- [ ] **Step 4: 실패 확인**

Run: `cd ../delivery-discount-api && ./gradlew test --tests ExportDataLoaderTest`
Expected: FAIL — `OfferRecord`, `ExportDataLoader` 클래스 없음(컴파일 에러)

- [ ] **Step 5: 최소 구현**

`src/main/java/com/discounttracker/model/OfferRecord.java`:
```java
package com.discounttracker.model;

public record OfferRecord(
        String platform,
        String brand,
        Integer amount,
        String qualifier,
        boolean needsReview,
        String offerType,
        String section,
        String rawText,
        String capturedAt,
        String screenshotPath
) {}
```

`src/main/java/com/discounttracker/data/ExportDataLoader.java`:
```java
package com.discounttracker.data;

import com.discounttracker.model.OfferRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

@Component
public class ExportDataLoader {

    private final Resource exportResource;
    private final ObjectMapper mapper = new ObjectMapper();
    private volatile List<OfferRecord> cache = List.of();

    public ExportDataLoader(@Value("${discount.export-path}") Resource exportResource) {
        this.exportResource = exportResource;
    }

    public void reload() {
        if (!exportResource.exists()) {
            cache = List.of();
            return;
        }
        try (InputStream in = exportResource.getInputStream()) {
            cache = List.of(mapper.readValue(in, OfferRecord[].class));
        } catch (IOException e) {
            throw new IllegalStateException("export.json 읽기 실패", e);
        }
    }

    public List<OfferRecord> records() {
        return cache;
    }
}
```

- [ ] **Step 6: 통과 확인**

Run: `./gradlew test --tests ExportDataLoaderTest`
Expected: PASS (3 tests)

- [ ] **Step 7: 커밋** (신규 레포에서 `git init` 후)

```bash
cd ../delivery-discount-api
git init
printf 'build/\n.gradle/\nsrc/main/resources/data/export.json\n' > .gitignore
git add .
git commit -m "feat: 스프링 스캐폴드와 export.json 로더 추가"
```

---

### Task 3: 별칭 리졸버 — `AliasResolver`

**Files:**
- Create: `src/main/resources/brand-aliases.yml`
- Create: `src/main/java/com/discounttracker/alias/AliasResolver.java`
- Test: `src/test/java/com/discounttracker/alias/AliasResolverTest.java`
- Modify: `build.gradle` (YAML 파싱용 의존성 추가)

**Interfaces:**
- Produces: `AliasResolver.canonical(String rawBrand) -> String` — 별칭표에 있으면 대표명, 없으면 입력 그대로 반환

- [ ] **Step 1: YAML 의존성 추가**

`build.gradle`의 `dependencies`에 추가:
```groovy
    implementation 'org.yaml:snakeyaml:2.2'
```

- [ ] **Step 2: 별칭표 작성**

`src/main/resources/brand-aliases.yml` (실제 데이터에서 확인된 명백한 것만):
```yaml
# 대표명: [원본 표기들]
멕시카나:
  - 멕시카나
  - 멕시카나치킨
BBQ:
  - BBQ
  - BBQ치킨
빽보이피자:
  - 빽보이피자
  - 빽보이피자 오구샌
```

- [ ] **Step 3: 실패하는 테스트 작성**

`src/test/java/com/discounttracker/alias/AliasResolverTest.java`:
```java
package com.discounttracker.alias;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AliasResolverTest {

    private static final String YAML = """
        멕시카나:
          - 멕시카나
          - 멕시카나치킨
        BBQ:
          - BBQ
          - BBQ치킨
        """;

    private AliasResolver resolverFor(String yaml) {
        return new AliasResolver(new ByteArrayResource(yaml.getBytes(
                java.nio.charset.StandardCharsets.UTF_8)));
    }

    @Test
    void mapsAliasToCanonical() {
        AliasResolver r = resolverFor(YAML);
        assertEquals("멕시카나", r.canonical("멕시카나치킨"));
        assertEquals("멕시카나", r.canonical("멕시카나"));
        assertEquals("BBQ", r.canonical("BBQ치킨"));
    }

    @Test
    void unknownBrandReturnedAsIs() {
        AliasResolver r = resolverFor(YAML);
        assertEquals("도미노피자", r.canonical("도미노피자"));
    }

    @Test
    void emptyYamlReturnsInputAsIs() {
        AliasResolver r = resolverFor("");
        assertEquals("굽네치킨", r.canonical("굽네치킨"));
    }
}
```

- [ ] **Step 4: 실패 확인**

Run: `./gradlew test --tests AliasResolverTest`
Expected: FAIL — `AliasResolver` 클래스 없음

- [ ] **Step 5: 최소 구현**

`src/main/java/com/discounttracker/alias/AliasResolver.java`:
```java
package com.discounttracker.alias;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class AliasResolver {

    private final Resource aliasResource;
    private final Map<String, String> aliasToCanonical = new HashMap<>();

    public AliasResolver(@Value("classpath:brand-aliases.yml") Resource aliasResource) {
        this.aliasResource = aliasResource;
        load();
    }

    // 스프링이 생성자 주입 후 자동 로드. 테스트는 생성자에서 바로 로드된다.
    @PostConstruct
    void load() {
        aliasToCanonical.clear();
        if (!aliasResource.exists()) return;
        try (InputStream in = aliasResource.getInputStream()) {
            Map<String, List<String>> raw = new Yaml().load(in);
            if (raw == null) return;
            for (var entry : raw.entrySet()) {
                String canonical = entry.getKey();
                for (String alias : entry.getValue()) {
                    aliasToCanonical.put(alias, canonical);
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("brand-aliases.yml 읽기 실패", e);
        }
    }

    public String canonical(String rawBrand) {
        return aliasToCanonical.getOrDefault(rawBrand, rawBrand);
    }
}
```

- [ ] **Step 6: 통과 확인**

Run: `./gradlew test --tests AliasResolverTest`
Expected: PASS (3 tests)

- [ ] **Step 7: 커밋**

```bash
git add build.gradle src/main/resources/brand-aliases.yml \
  src/main/java/com/discounttracker/alias/AliasResolver.java \
  src/test/java/com/discounttracker/alias/AliasResolverTest.java
git commit -m "feat: 브랜드 별칭 리졸버 추가"
```

---

### Task 4: 교차 비교 서비스 — `BrandComparisonService`

**Files:**
- Create: `src/main/java/com/discounttracker/model/Offer.java`
- Create: `src/main/java/com/discounttracker/model/BrandComparison.java`
- Create: `src/main/java/com/discounttracker/service/BrandComparisonService.java`
- Test: `src/test/java/com/discounttracker/service/BrandComparisonServiceTest.java`

**Interfaces:**
- Consumes: `ExportDataLoader.records() -> List<OfferRecord>`, `AliasResolver.canonical(String) -> String`
- Produces:
  - `record Offer(String platform, Integer amount, String qualifier, String status, String rawText)` — `status`는 `"confirmed"` 또는 `"held"`
  - `record BrandComparison(String name, Integer maxConfirmedAmount, List<Offer> offers)` — `maxConfirmedAmount`는 확정 offer가 없으면 null
  - `BrandComparisonService.compare() -> List<BrandComparison>` — 대표 브랜드별로 묶고, 정렬해 반환

- [ ] **Step 1: 실패하는 테스트 작성**

`src/test/java/com/discounttracker/service/BrandComparisonServiceTest.java`:
```java
package com.discounttracker.service;

import com.discounttracker.alias.AliasResolver;
import com.discounttracker.data.ExportDataLoader;
import com.discounttracker.model.BrandComparison;
import com.discounttracker.model.Offer;
import com.discounttracker.model.OfferRecord;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BrandComparisonServiceTest {

    // ExportDataLoader를 상속 없이 대체하기 위해 레코드를 직접 넘기는 테스트 전용 로더.
    private ExportDataLoader loaderWith(List<OfferRecord> records) {
        return new ExportDataLoader(null) {
            @Override public void reload() { }
            @Override public List<OfferRecord> records() { return records; }
        };
    }

    private AliasResolver aliasWith(String yaml) {
        return new AliasResolver(new org.springframework.core.io.ByteArrayResource(
                yaml.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    private OfferRecord rec(String platform, String brand, Integer amount,
                            String qualifier, boolean needsReview) {
        return new OfferRecord(platform, brand, amount, qualifier, needsReview,
                "discount", null, amount == null ? "" : amount + "원",
                "2026-07-27T14:20:00+09:00", "path.jpg");
    }

    @Test
    void groupsAliasesUnderCanonicalName() {
        var svc = new BrandComparisonService(
                loaderWith(List.of(
                        rec("coupangeats", "멕시카나", 5000, null, false),
                        rec("yogiyo", "멕시카나치킨", 7000, "최대", true))),
                aliasWith("멕시카나:\n  - 멕시카나\n  - 멕시카나치킨\n"));
        List<BrandComparison> result = svc.compare();
        assertEquals(1, result.size());
        assertEquals("멕시카나", result.get(0).name());
        assertEquals(2, result.get(0).offers().size());
    }

    @Test
    void statusConfirmedWhenAmountPresentAndNotReview() {
        var svc = new BrandComparisonService(
                loaderWith(List.of(
                        rec("baemin", "피자헛", 10000, null, false),
                        rec("yogiyo", "피자헛", 7000, "최대", true))),
                aliasWith(""));
        Offer baemin = svc.compare().get(0).offers().stream()
                .filter(o -> o.platform().equals("baemin")).findFirst().orElseThrow();
        Offer yogiyo = svc.compare().get(0).offers().stream()
                .filter(o -> o.platform().equals("yogiyo")).findFirst().orElseThrow();
        assertEquals("confirmed", baemin.status());
        assertEquals("held", yogiyo.status());
    }

    @Test
    void maxConfirmedAmountIgnoresHeld() {
        var svc = new BrandComparisonService(
                loaderWith(List.of(
                        rec("baemin", "피자헛", 10000, null, false),
                        rec("yogiyo", "피자헛", 99000, "최대", true))),  // held는 커도 무시
                aliasWith(""));
        assertEquals(10000, svc.compare().get(0).maxConfirmedAmount());
    }

    @Test
    void sortsByMaxConfirmedDescending_confirmedlessGoLast() {
        var svc = new BrandComparisonService(
                loaderWith(List.of(
                        rec("baemin", "A브랜드", 4000, null, false),
                        rec("baemin", "B브랜드", 9000, null, false),
                        rec("yogiyo", "C브랜드", 8000, "최대", true))),  // 확정 없음
                aliasWith(""));
        List<BrandComparison> result = svc.compare();
        assertEquals("B브랜드", result.get(0).name());   // 9000 확정
        assertEquals("A브랜드", result.get(1).name());   // 4000 확정
        assertEquals("C브랜드", result.get(2).name());   // 확정 없음 → 맨 아래
        assertNull(result.get(2).maxConfirmedAmount());
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./gradlew test --tests BrandComparisonServiceTest`
Expected: FAIL — `Offer`, `BrandComparison`, `BrandComparisonService` 없음

- [ ] **Step 3: 최소 구현**

`src/main/java/com/discounttracker/model/Offer.java`:
```java
package com.discounttracker.model;

public record Offer(String platform, Integer amount, String qualifier,
                    String status, String rawText) {}
```

`src/main/java/com/discounttracker/model/BrandComparison.java`:
```java
package com.discounttracker.model;

import java.util.List;

public record BrandComparison(String name, Integer maxConfirmedAmount,
                              List<Offer> offers) {}
```

`src/main/java/com/discounttracker/service/BrandComparisonService.java`:
```java
package com.discounttracker.service;

import com.discounttracker.alias.AliasResolver;
import com.discounttracker.data.ExportDataLoader;
import com.discounttracker.model.BrandComparison;
import com.discounttracker.model.Offer;
import com.discounttracker.model.OfferRecord;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class BrandComparisonService {

    private final ExportDataLoader loader;
    private final AliasResolver aliases;

    public BrandComparisonService(ExportDataLoader loader, AliasResolver aliases) {
        this.loader = loader;
        this.aliases = aliases;
    }

    private static boolean isConfirmed(OfferRecord r) {
        return r.amount() != null && !r.needsReview();
    }

    public List<BrandComparison> compare() {
        // 대표명별로 offer 모으기
        Map<String, List<Offer>> byBrand = new LinkedHashMap<>();
        Map<String, Integer> maxConfirmed = new LinkedHashMap<>();

        for (OfferRecord r : loader.records()) {
            String name = aliases.canonical(r.brand());
            String status = isConfirmed(r) ? "confirmed" : "held";
            byBrand.computeIfAbsent(name, k -> new ArrayList<>())
                    .add(new Offer(r.platform(), r.amount(), r.qualifier(), status, r.rawText()));
            if (isConfirmed(r)) {
                maxConfirmed.merge(name, r.amount(), Math::max);
            }
        }

        List<BrandComparison> result = new ArrayList<>();
        for (var entry : byBrand.entrySet()) {
            result.add(new BrandComparison(
                    entry.getKey(), maxConfirmed.get(entry.getKey()), entry.getValue()));
        }

        // 정렬: 확정값 있는 것 먼저(할인 큰 순), 확정 없는 것은 뒤로.
        result.sort(Comparator
                .comparing((BrandComparison b) -> b.maxConfirmedAmount() == null)  // false(확정) 먼저
                .thenComparing(b -> -nullToZero(b.maxConfirmedAmount())));
        return result;
    }

    private static int nullToZero(Integer v) {
        return v == null ? 0 : v;
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `./gradlew test --tests BrandComparisonServiceTest`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/main/java/com/discounttracker/model/Offer.java \
  src/main/java/com/discounttracker/model/BrandComparison.java \
  src/main/java/com/discounttracker/service/BrandComparisonService.java \
  src/test/java/com/discounttracker/service/BrandComparisonServiceTest.java
git commit -m "feat: 교차 비교 서비스 추가 (별칭 묶기·신뢰도·정렬)"
```

---

### Task 5: REST 컨트롤러 — `BrandController`

**Files:**
- Create: `src/main/java/com/discounttracker/web/BrandController.java`
- Create: `src/main/java/com/discounttracker/web/WebConfig.java`
- Create: `src/main/java/com/discounttracker/data/DataStartupLoader.java`
- Test: `src/test/java/com/discounttracker/web/BrandControllerTest.java`

**Interfaces:**
- Consumes: `BrandComparisonService.compare()`, `ExportDataLoader.reload()`
- Produces:
  - `GET /api/brands` → `200`, `List<BrandComparison>` JSON
  - `POST /api/reload` → `200`, 본문 `{"reloaded": <건수>}`
- Also: 앱 시작 시 `ExportDataLoader.reload()`를 1회 호출(`DataStartupLoader`), CORS로 dev 프론트(`http://localhost:5173`) 허용(`WebConfig`)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/test/java/com/discounttracker/web/BrandControllerTest.java`:
```java
package com.discounttracker.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class BrandControllerTest {

    @Autowired MockMvc mvc;

    // 이 테스트는 src/main/resources/data/export.json(실제 복사본)과
    // brand-aliases.yml을 그대로 쓴다. 최소 한 건 이상 있다고 가정한다.

    @Test
    void getBrandsReturnsList() throws Exception {
        mvc.perform(get("/api/brands"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$").isArray())
           .andExpect(jsonPath("$[0].name").exists())
           .andExpect(jsonPath("$[0].offers").isArray());
    }

    @Test
    void reloadReturnsCount() throws Exception {
        mvc.perform(post("/api/reload"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.reloaded").isNumber());
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./gradlew test --tests BrandControllerTest`
Expected: FAIL — 컨트롤러 없어 404, 또는 컴파일 에러

- [ ] **Step 3: 최소 구현**

`src/main/java/com/discounttracker/web/BrandController.java`:
```java
package com.discounttracker.web;

import com.discounttracker.data.ExportDataLoader;
import com.discounttracker.model.BrandComparison;
import com.discounttracker.service.BrandComparisonService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class BrandController {

    private final BrandComparisonService service;
    private final ExportDataLoader loader;

    public BrandController(BrandComparisonService service, ExportDataLoader loader) {
        this.service = service;
        this.loader = loader;
    }

    @GetMapping("/brands")
    public List<BrandComparison> brands() {
        return service.compare();
    }

    @PostMapping("/reload")
    public Map<String, Integer> reload() {
        loader.reload();
        return Map.of("reloaded", loader.records().size());
    }
}
```

`src/main/java/com/discounttracker/data/DataStartupLoader.java`:
```java
package com.discounttracker.data;

import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.stereotype.Component;

// 앱 시작 시 export.json을 한 번 읽어 캐시를 채운다.
@Component
public class DataStartupLoader implements ApplicationRunner {

    private final ExportDataLoader loader;

    public DataStartupLoader(ExportDataLoader loader) {
        this.loader = loader;
    }

    @Override
    public void run(ApplicationArguments args) {
        loader.reload();
    }
}
```

`src/main/java/com/discounttracker/web/WebConfig.java`:
```java
package com.discounttracker.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOrigins("http://localhost:5173");
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `./gradlew test --tests BrandControllerTest`
Expected: PASS (2 tests). (실패 시 `src/main/resources/data/export.json`이 비었는지 확인 — Task 2 Step 2에서 복사했어야 함)

- [ ] **Step 5: 서버 수동 확인**

```bash
./gradlew bootRun
```
다른 터미널에서:
```bash
curl http://localhost:8080/api/brands | head -c 400
curl -X POST http://localhost:8080/api/reload
```
Expected: 브랜드 배열 JSON, `{"reloaded":<수>}`.

- [ ] **Step 6: 커밋**

```bash
git add src/main/java/com/discounttracker/web/ src/main/java/com/discounttracker/data/DataStartupLoader.java \
  src/test/java/com/discounttracker/web/BrandControllerTest.java
git commit -m "feat: 브랜드 조회·리로드 REST 컨트롤러와 시작 시 로딩 추가"
```

---

### Task 6: React 화면 — 교차 비교 페이지

**Files (`../delivery-discount-api/web/`):**
- Create: `package.json`, `vite.config.js`, `index.html`
- Create: `src/main.jsx`, `src/api.js`, `src/App.jsx`, `src/App.css`

**Interfaces:**
- Consumes: `GET /api/brands` (Vite dev proxy로 `/api` → `http://localhost:8080`)
- Produces: 한 페이지 교차 비교 화면. 자동 테스트 없음 — 브라우저 실기 검증.

- [ ] **Step 1: Vite React 프로젝트 파일 작성**

`web/package.json`:
```json
{
  "name": "delivery-discount-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^5.4.11"
  }
}
```

`web/vite.config.js`:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
})
```

`web/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>배달앱 브랜드 할인 비교</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`web/src/main.jsx`:
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 2: API 호출 모듈**

`web/src/api.js`:
```js
export async function fetchBrands() {
  const res = await fetch('/api/brands')
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}
```

- [ ] **Step 3: 화면 컴포넌트**

`web/src/App.jsx`:
```jsx
import { useEffect, useState } from 'react'
import { fetchBrands } from './api.js'

const PLATFORMS = [
  { key: 'baemin', label: '배민' },
  { key: 'coupangeats', label: '쿠팡이츠' },
  { key: 'ddangyo', label: '땡겨요' },
  { key: 'yogiyo', label: '요기요' },
]

function Cell({ offer }) {
  if (!offer) return <td className="empty">·</td>
  const held = offer.status === 'held'
  const amount = offer.amount != null ? `${offer.amount.toLocaleString()}원` : offer.rawText
  return (
    <td className={held ? 'held' : 'confirmed'}>
      {offer.qualifier === '최대' && <span className="badge">최대</span>}
      {amount}
    </td>
  )
}

export default function App() {
  const [brands, setBrands] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchBrands().then(setBrands).catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="msg">불러오기 실패: {error}</p>
  if (!brands) return <p className="msg">불러오는 중…</p>

  return (
    <main>
      <h1>배달앱 브랜드 할인 비교</h1>
      <p className="sub">같은 브랜드를 어느 앱에서 시키는 게 이득인지 한눈에</p>
      <table>
        <thead>
          <tr>
            <th>브랜드</th>
            {PLATFORMS.map((p) => <th key={p.key}>{p.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => {
            const byPlatform = Object.fromEntries(b.offers.map((o) => [o.platform, o]))
            return (
              <tr key={b.name}>
                <td className="brand">{b.name}</td>
                {PLATFORMS.map((p) => <Cell key={p.key} offer={byPlatform[p.key]} />)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
```

`web/src/App.css`:
```css
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem; }
h1 { font-size: 1.25rem; margin: 0 0 .2rem; }
.sub { color: #888; font-size: .85rem; margin: 0 0 1.2rem; }
.msg { padding: 2rem 1rem; text-align: center; color: #888; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: .4rem .5rem; border-bottom: 1px solid #8883; text-align: right; white-space: nowrap; }
th:first-child, td.brand { text-align: left; }
th { font-size: .75rem; color: #888; font-weight: 600; }
td.brand { font-weight: 600; }
td.confirmed { font-variant-numeric: tabular-nums; }
td.held { color: #999; font-variant-numeric: tabular-nums; }
td.empty { color: #ccc; }
.badge { font-size: .7em; color: #c2410c; margin-right: .2em; }
@media (max-width: 520px) {
  th, td { padding: .35rem .3rem; font-size: .9em; }
}
```

- [ ] **Step 4: 의존성 설치 + 실기 검증**

```bash
cd ../delivery-discount-api/web
npm install
npm run dev
```
스프링(`./gradlew bootRun`)이 8080에 떠 있는 상태에서 브라우저로 `http://localhost:5173` 접속.
Expected(육안 확인):
- 브랜드 목록이 할인 큰 순으로 뜬다 (피자헛·청년피자 등 상단)
- 한 행에 앱별 셀이 나란히, 없는 앱은 `·`
- 요기요/쿠팡 `최대` 값은 회색 + `최대` 배지
- 창 폭을 좁히면 표가 뭉개지지 않고 읽힌다

- [ ] **Step 5: 커밋**

```bash
cd ../delivery-discount-api
printf 'web/node_modules/\nweb/dist/\n' >> .gitignore
git add web/package.json web/vite.config.js web/index.html web/src/
git commit -m "feat: 교차 비교 React 화면 추가"
```

---

### Task 7: 통합 확인 및 실행 문서

**Files:**
- Create: `../delivery-discount-api/README.md`

**Interfaces:**
- Consumes: Task 1~6 전체
- Produces: 사람이 따라 할 수 있는 "데이터 갱신 → 실행" 절차

- [ ] **Step 1: 전체 파이프 1회 통과**

현재 레포에서:
```bash
python export_data.py
cp data/export.json ../delivery-discount-api/src/main/resources/data/export.json
```
스프링 레포에서:
```bash
cd ../delivery-discount-api
./gradlew test          # Task 2~5 자동 테스트 전부 통과
./gradlew bootRun &     # 8080
cd web && npm run dev   # 5173
```
Expected: 브라우저에서 107건 데이터 기반 교차 비교가 뜬다.

- [ ] **Step 2: README 작성**

`../delivery-discount-api/README.md`:
```markdown
# 배달앱 브랜드 할인 비교 API

배달앱별 브랜드 할인을 한 화면에서 비교하는 MVP.
데이터는 [delivery-discount-tracker](../delivery-discount-tracker) 파이썬
파이프라인이 판독해 공급한다.

## 실행

1. 데이터 갱신 (delivery-discount-tracker 레포에서):
   ```
   python export_data.py
   cp data/export.json ../delivery-discount-api/src/main/resources/data/export.json
   ```
2. API 기동: `./gradlew bootRun` (http://localhost:8080)
3. 프론트 기동: `cd web && npm install && npm run dev` (http://localhost:5173)
4. 데이터만 갱신했다면 재기동 대신: `curl -X POST http://localhost:8080/api/reload`

## 구조

- `data/ExportDataLoader` — export.json 읽기(리로드 가능)
- `alias/AliasResolver` — brand-aliases.yml로 같은 브랜드의 다른 표기를 묶음
- `service/BrandComparisonService` — 묶기 + 확정/미확정 판정 + 최고 확정 할인 큰 순 정렬
- `web/BrandController` — GET /api/brands, POST /api/reload
- `web/` — React(Vite) 교차 비교 화면

## 별칭 추가

같은 브랜드가 다른 이름으로 안 묶이면 `src/main/resources/brand-aliases.yml`에 추가한다.
전체 브랜드명은 delivery-discount-tracker의 `data/brands-sorted.txt`(이름 오름차순)에서 확인한다.
```

- [ ] **Step 3: 커밋**

```bash
git add README.md
git commit -m "docs: 실행 절차와 구조 문서화"
```

---

## Self-Review 메모

- **스펙 커버리지**: §3 아키텍처(두 레포/경계) → Task 1(공급)+2(소비 시작), §4 export.json 계약 → Task 1(camelCase 변환), §4 brands-sorted.txt → Task 1, §5 별칭 → Task 3, §5 확정/미확정 판정 → Task 4(isConfirmed), §5 정렬(최고 확정 큰 순, 확정없음 아래) → Task 4(sort) + 테스트, §6 API 2개 → Task 5, §7 화면(4열·회색·최대 배지·반응형) → Task 6, §8 성공기준(107건 실데이터 관통) → Task 7.
- **타입 일관성**: `OfferRecord`(Task2) 필드명을 `BrandComparisonService`(Task4)가 그대로 사용. `Offer.status` 값 `"confirmed"/"held"`를 Task4 생성·Task6 소비에서 동일 문자열로 사용. `BrandComparison.maxConfirmedAmount` null 규약을 Task4 정렬과 Task6 렌더에서 일관되게 다룸(null=확정없음).
- **플레이스홀더 스캔**: 모든 코드 스텝에 실제 코드. 별칭표는 실데이터에서 확인된 3건으로 시작(추가는 운영 중). export.json 복사는 수동 절차로 명시(자동화는 스펙상 범위 밖).
- **경계 주의**: 파이썬은 원본 브랜드명만 내고 정규화 안 함(스펙 §4). 스프링만 별칭 묶기(Task3~4). React는 자동 테스트 없이 실기 검증(전체 관례와 일관).
