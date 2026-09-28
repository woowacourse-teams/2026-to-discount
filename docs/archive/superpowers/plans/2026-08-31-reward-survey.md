# 리워드 설문 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 접속일 7일 이상·전환 5회 이상인 사람에게만 한 문항 설문 카드를 띄우고, 답하면 기프티콘 코드를 화면에 바로 준다.

**Architecture:** 대상 판정과 코드 발급은 전부 서버가 한다 — 리워드가 걸린 판정을 프론트 `localStorage`에 두면 위조된다. 서버는 이미 가진 원장(`events.jsonl`)을 직접 세고, 기프티콘은 jar 밖 `gifticons.yml`에서 파일 잠금으로 하나씩 꺼낸다. 프론트는 서버가 "대상이고 코드가 남았다"고 답할 때만 브랜드 그리드 첫 줄에 카드 한 장을 그린다.

**Tech Stack:** Spring Boot(Java 17, Gradle) · SnakeYAML · React 18 + Vite · Node `node:test`

**Spec:** `docs/superpowers/specs/2026-08-31-reward-survey-design.md`

## Global Constraints

- 대상 조건은 **접속일 7일 이상 AND 전환 5회 이상**. 전환 이벤트는 `offer_link_click`, `banner_click` 두 종.
- 객관식 선택지 토큰은 정확히 `discount_info`, `save_money`, `compare`, `other` 넷.
- 화면 문구: 질문은 `어떻게 쓰고 계신가요?`, 보기는 순서대로 `할인 정보 보려고`, `배달비 아끼려고`, `앱끼리 비교하려고`, `직접 입력`.
- 직접 입력 상한 **200자**. 서버가 전화·이메일·주민번호 꼴을 잘라낸다.
- 1인 1회. 이미 받은 `visitorId`에는 코드를 다시 안 준다.
- 코드가 소진되면 설문이 자동으로 내려간다(`GET /api/survey`가 `eligible: false`).
- `gifticons.yml`은 **저장소에 올리지 않는다**. `.gitignore`에 넣고 경로만 열어둔다(`banners.yml`과 같은 방식).
- 다시 안 띄우는 규칙: 답하면 영구, 닫기 1회면 3일 뒤, 닫기 2회면 영구.
- 설문 배포일에 다른 변경을 같이 내보내지 않는다.
- 개발 트래픽(`dev: true`)과 크롤러(`bot != null`)는 대상 집계에서 뺀다.
- 주석과 커밋 메시지는 한국어. 기존 파일들의 서술 방식(왜 이렇게 했는지를 실측과 함께 적는다)을 따른다.

---

## 스펙에서 갈렸던 것 — 이 계획의 판단

스펙 §검증은 `verify-analytics-event-contract.mjs`가 `survey_answer`를 잡는다고 적었다. 그런데 그 검사는 **프론트가 `track()`으로 쏘는 이벤트**와 `EventController.ALLOWED_EVENTS`를 양방향으로 맞춘다 — 허용 목록에만 있고 프론트가 안 쏘면 그것도 실패다.

`survey_answer`는 스펙 §판정에서 **서버가** 원장에 적기로 했다. 프론트가 `/api/events`로 쏘면 아무나 위조할 수 있고, 그러면 응답 수와 코드 발급 수가 어긋난다.

그래서 이렇게 가른다.

| 이벤트 | 누가 적나 | 계약 검사 대상 |
|---|---|---|
| `survey_impression` | 프론트 `track()` | 예 |
| `survey_dismiss` | 프론트 `track()` | 예 |
| `survey_answer` | 서버 `SurveyService` | 아니오 (프론트가 안 쏜다) |

세 이벤트 모두 같은 `events.jsonl`에 들어가므로 `experiments.py features`는 셋 다 그대로 읽는다 — 스펙이 원한 결과는 유지된다.

---

## 파일 구조

**서버 (api)**

| 파일 | 책임 |
|---|---|
| `analytics/SurveyEligibility.java` | 원장을 훑어 한 `visitorId`의 접속일수·전환수를 센다. 판정만 한다 |
| `analytics/GifticonStore.java` | `gifticons.yml`을 읽고, 코드 하나를 원자적으로 꺼내 발급 표시를 한다 |
| `analytics/SurveyService.java` | 위 둘을 엮는다. 대상 판정 → 중복 확인 → 코드 발급 → 원장 기록 |
| `analytics/SurveyText.java` | 직접 입력에서 전화·이메일·주민번호 꼴을 잘라낸다 |
| `analytics/SurveyController.java` | `GET /api/survey`, `POST /api/survey` |

`SurveyEligibility`와 `GifticonStore`를 `SurveyService`에서 떼어 둔 이유: 앞의 둘은 각각 파일 하나를 다루는 순수한 일이라 파일 없이도 테스트가 되고, `SurveyService`는 그 둘을 어떤 순서로 부를지만 정한다. 한 클래스에 합치면 "코드가 남았는가"를 확인하려고 원장 전체를 훑어야 한다.

**프론트 (web)**

| 파일 | 책임 |
|---|---|
| `src/SurveyCard.jsx` | 설문 카드 한 장. 보기 넷, 직접 입력, 코드 표시 |
| `src/surveyDismiss.js` | 닫기 상태(localStorage). 답함/1회/2회 규칙 |
| `src/App.jsx` (수정) | `GET /api/survey`를 부르고, 대상이면 그리드 첫 줄에 카드를 끼운다 |
| `src/App.css` (수정) | 카드 크기·모서리를 브랜드 카드와 맞춘다 |
| `scripts/verify-analytics-event-contract.mjs` (수정) | `SurveyCard.jsx`를 검사 대상에 넣는다 |

---

### Task 1: 원장에서 대상 판정

**Files:**
- Create: `api/src/main/java/com/discounttracker/analytics/SurveyEligibility.java`
- Test: `api/src/test/java/com/discounttracker/analytics/SurveyEligibilityTest.java`

**Interfaces:**
- Consumes: `EventLog#path()` (이미 있는 package-private 메서드, `Path`를 돌려준다)
- Produces:
  - `SurveyEligibility(EventLog eventLog)` — 스프링 `@Component`
  - `SurveyEligibility.Counts count(String visitorId)`
  - `record Counts(int days, int conversions, boolean answered)`
  - `boolean qualifies(Counts c)` — `static`, `c.days() >= 7 && c.conversions() >= 5 && !c.answered()`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/analytics/SurveyEligibilityTest.java`:

```java
package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SurveyEligibilityTest {

    @TempDir Path tmp;

    /** 원장 한 줄. 이 테스트가 쓰는 필드만 채운다. */
    private String line(String ts, String event, String visitorId) {
        return "{\"ts\":\"" + ts + "\",\"event\":\"" + event
                + "\",\"visitorId\":\"" + visitorId + "\"}";
    }

    private SurveyEligibility on(List<String> lines) throws IOException {
        Path log = tmp.resolve("events.jsonl");
        Files.write(log, lines, StandardCharsets.UTF_8);
        return new SurveyEligibility(new EventLog(log.toString(), new ObjectMapper()));
    }

    @Test
    void countsDistinctDaysAndConversions() throws Exception {
        SurveyEligibility e = on(List.of(
                line("2026-08-01T10:00:00+09:00", "page_view", "v_1"),
                line("2026-08-01T10:01:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-01T10:02:00+09:00", "banner_click", "v_1"),
                line("2026-08-02T10:00:00+09:00", "offer_link_click", "v_1")));

        SurveyEligibility.Counts c = e.count("v_1");
        assertEquals(2, c.days(), "8/1과 8/2 이틀");
        assertEquals(3, c.conversions(), "offer_link_click 2 + banner_click 1");
        assertFalse(c.answered());
    }

    @Test
    void ignoresOtherVisitors() throws Exception {
        SurveyEligibility e = on(List.of(
                line("2026-08-01T10:00:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-02T10:00:00+09:00", "offer_link_click", "v_2")));

        assertEquals(1, e.count("v_1").conversions());
    }

    /** 개발 트래픽과 크롤러는 대상 집계에서 뺀다. */
    @Test
    void ignoresDevAndBotLines() throws Exception {
        Path log = tmp.resolve("events.jsonl");
        Files.write(log, List.of(
                "{\"ts\":\"2026-08-01T10:00:00+09:00\",\"event\":\"offer_link_click\","
                        + "\"visitorId\":\"v_1\",\"dev\":true}",
                "{\"ts\":\"2026-08-02T10:00:00+09:00\",\"event\":\"offer_link_click\","
                        + "\"visitorId\":\"v_1\",\"bot\":\"googlebot\"}"), StandardCharsets.UTF_8);
        SurveyEligibility e = new SurveyEligibility(
                new EventLog(log.toString(), new ObjectMapper()));

        assertEquals(0, e.count("v_1").days());
        assertEquals(0, e.count("v_1").conversions());
    }

    @Test
    void marksAlreadyAnswered() throws Exception {
        SurveyEligibility e = on(List.of(
                line("2026-08-01T10:00:00+09:00", "survey_answer", "v_1")));

        assertTrue(e.count("v_1").answered());
    }

    /** 원장이 아직 없을 수도 있다 — 새 서버에서 첫 요청이 500이면 안 된다. */
    @Test
    void missingLogCountsAsZero() {
        SurveyEligibility e = new SurveyEligibility(
                new EventLog(tmp.resolve("없는파일.jsonl").toString(), new ObjectMapper()));

        assertEquals(0, e.count("v_1").days());
    }

    @Test
    void qualifiesNeedsBothThresholds() {
        assertTrue(SurveyEligibility.qualifies(new SurveyEligibility.Counts(7, 5, false)));
        assertFalse(SurveyEligibility.qualifies(new SurveyEligibility.Counts(6, 5, false)));
        assertFalse(SurveyEligibility.qualifies(new SurveyEligibility.Counts(7, 4, false)));
        assertFalse(SurveyEligibility.qualifies(new SurveyEligibility.Counts(7, 5, true)));
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests '*SurveyEligibilityTest'`
Expected: 컴파일 실패 — `cannot find symbol: class SurveyEligibility`

- [ ] **Step 3: 구현한다**

`api/src/main/java/com/discounttracker/analytics/SurveyEligibility.java`:

```java
package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Stream;

/**
 * 한 브라우저가 설문 대상인지 원장에서 직접 센다.
 *
 * <p>프론트가 판정하지 않는 이유는 리워드다. 접속일수와 전환수는
 * {@code localStorage}에도 있지만 사용자가 고칠 수 있고, 그 값이 기프티콘을
 * 내주는 조건이면 누구나 받아간다. 원장은 서버에 있으니 서버가 센다.
 *
 * <p>매번 파일 전체를 훑는다. 설문 제출은 하루 몇 건이라 부담이 없고
 * (2026-08-29 기준 38,791줄, 1초 미만), 색인을 두면 원장과 어긋날 자리가
 * 하나 더 생긴다.
 */
@Component
public class SurveyEligibility {

    private static final Logger log = LoggerFactory.getLogger(SurveyEligibility.class);

    /** 스펙이 정한 전환. 앱으로 실제로 보낸 것만 센다. */
    private static final Set<String> CONVERSIONS = Set.of("offer_link_click", "banner_click");

    public static final int MIN_DAYS = 7;
    public static final int MIN_CONVERSIONS = 5;

    private final EventLog eventLog;
    private final ObjectMapper mapper = new ObjectMapper();

    public SurveyEligibility(EventLog eventLog) {
        this.eventLog = eventLog;
    }

    /**
     * @param days        서로 다른 접속 날짜 수(Asia/Seoul 기준 ts 앞 10글자)
     * @param conversions offer_link_click + banner_click 건수
     * @param answered    이미 설문에 답했나 — 1인 1회를 여기서 가른다
     */
    public record Counts(int days, int conversions, boolean answered) {
    }

    public static boolean qualifies(Counts c) {
        return c.days() >= MIN_DAYS && c.conversions() >= MIN_CONVERSIONS && !c.answered();
    }

    public Counts count(String visitorId) {
        if (visitorId == null || visitorId.isBlank()) return new Counts(0, 0, false);

        Path path = eventLog.path();
        // 새로 띄운 서버에는 원장이 아직 없다. 없으면 "대상 아님"이지 오류가 아니다.
        if (!Files.exists(path)) return new Counts(0, 0, false);

        Set<String> days = new HashSet<>();
        int conversions = 0;
        boolean answered = false;

        try (Stream<String> lines = Files.lines(path, StandardCharsets.UTF_8)) {
            for (String line : (Iterable<String>) lines::iterator) {
                JsonNode node = parse(line);
                if (node == null) continue;
                if (!visitorId.equals(text(node, "visitorId"))) continue;
                // 개발 트래픽과 크롤러는 사람이 아니다. 집계에서 빼는 규칙은
                // experiments.py와 같다.
                if (node.path("dev").asBoolean(false)) continue;
                if (!node.path("bot").isNull() && node.hasNonNull("bot")) continue;

                String event = text(node, "event");
                if ("survey_answer".equals(event)) answered = true;

                String ts = text(node, "ts");
                if (ts != null && ts.length() >= 10) days.add(ts.substring(0, 10));
                if (CONVERSIONS.contains(event)) conversions++;
            }
        } catch (IOException e) {
            // 원장을 못 읽으면 대상이 아니라고 본다. 설문이 안 뜨는 것은
            // 사용자에게 아무 손해가 없지만, 500을 던지면 화면 전체가 흔들린다.
            log.error("원장을 읽지 못해 설문 대상 판정을 건너뛴다: {}", path, e);
            return new Counts(0, 0, false);
        }
        return new Counts(days.size(), conversions, answered);
    }

    private JsonNode parse(String line) {
        if (line == null || line.isBlank()) return null;
        try {
            return mapper.readTree(line);
        } catch (IOException e) {
            // 한 줄이 깨져도 나머지는 멀쩡하다 — JSONL을 쓴 이유가 이것이다.
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests '*SurveyEligibilityTest'`
Expected: PASS (6개)

- [ ] **Step 5: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/analytics/SurveyEligibility.java \
        api/src/test/java/com/discounttracker/analytics/SurveyEligibilityTest.java
git commit -m "feat: 설문 대상 판정을 원장에서 서버가 센다"
```

---

### Task 2: 기프티콘 저장소

**Files:**
- Create: `api/src/main/java/com/discounttracker/analytics/GifticonStore.java`
- Test: `api/src/test/java/com/discounttracker/analytics/GifticonStoreTest.java`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 없음 (경로는 `@Value("${discount.gifticons-path:data/gifticons.yml}")`)
- Produces:
  - `GifticonStore(String path)` — 스프링 `@Component`
  - `int remaining()` — 아직 발급 안 된 코드 수
  - `Optional<String> issue(String visitorId)` — 코드 하나를 꺼내 `issuedTo`/`issuedAt`을 적고 돌려준다. 남은 게 없으면 `Optional.empty()`

파일 모양(`gifticons.yml`):

```yaml
gifticons:
  - code: "1234-5678-9012"
  - code: "2345-6789-0123"
    issuedTo: v_abc123
    issuedAt: "2026-09-01T12:00:00+09:00"
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/analytics/GifticonStoreTest.java`:

```java
package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GifticonStoreTest {

    @TempDir Path tmp;

    private GifticonStore store(String yaml) throws Exception {
        Path p = tmp.resolve("gifticons.yml");
        Files.writeString(p, yaml, StandardCharsets.UTF_8);
        return new GifticonStore(p.toString());
    }

    @Test
    void issuesCodeAndMarksIt() throws Exception {
        GifticonStore s = store("""
            gifticons:
              - code: "AAAA-1111"
            """);

        assertEquals(1, s.remaining());
        assertEquals(Optional.of("AAAA-1111"), s.issue("v_1"));
        assertEquals(0, s.remaining(), "발급한 코드는 더 이상 남은 것이 아니다");
        assertTrue(Files.readString(s.path()).contains("v_1"), "발급 기록이 파일에 남아야 한다");
    }

    @Test
    void neverIssuesTheSameCodeTwice() throws Exception {
        GifticonStore s = store("""
            gifticons:
              - code: "AAAA-1111"
              - code: "BBBB-2222"
            """);

        assertEquals(Optional.of("AAAA-1111"), s.issue("v_1"));
        assertEquals(Optional.of("BBBB-2222"), s.issue("v_2"));
        assertEquals(Optional.empty(), s.issue("v_3"), "소진되면 빈 값");
    }

    /** 파일이 없으면 설문이 자동으로 내려가야 한다 — 오류가 아니다. */
    @Test
    void missingFileHasNoneRemaining() {
        GifticonStore s = new GifticonStore(tmp.resolve("없는파일.yml").toString());

        assertEquals(0, s.remaining());
        assertEquals(Optional.empty(), s.issue("v_1"));
    }

    /** 동시에 들어와도 코드가 두 번 나가면 안 된다. */
    @Test
    void concurrentIssuesNeverOverlap() throws Exception {
        GifticonStore s = store("""
            gifticons:
              - code: "AAAA-1111"
              - code: "BBBB-2222"
              - code: "CCCC-3333"
            """);

        int threads = 8;
        CountDownLatch go = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        Set<String> issued = Collections.newSetFromMap(new ConcurrentHashMap<>());
        List<Thread> ts = java.util.stream.IntStream.range(0, threads)
                .mapToObj(i -> new Thread(() -> {
                    try {
                        go.await();
                        s.issue("v_" + i).ifPresent(code -> assertTrue(issued.add(code),
                                "같은 코드가 두 번 나갔다: " + code));
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                }))
                .toList();
        ts.forEach(Thread::start);
        go.countDown();
        assertTrue(done.await(10, TimeUnit.SECONDS));

        assertEquals(3, issued.size(), "코드 세 개가 서로 다른 사람에게 하나씩");
        assertEquals(0, s.remaining());
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests '*GifticonStoreTest'`
Expected: 컴파일 실패 — `cannot find symbol: class GifticonStore`

- [ ] **Step 3: 구현한다**

`api/src/main/java/com/discounttracker/analytics/GifticonStore.java`:

```java
package com.discounttracker.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 기프티콘 코드를 담아 두고 하나씩 꺼내 준다.
 *
 * <p>프론트 번들에 넣지 않는 이유는 명백하다 — 값을 가진 문자열이라 누구나
 * 읽어 간다. 저장소에도 올리지 않는다({@code .gitignore}). 경로만 열어두고
 * ({@code discount.gifticons-path}) 파일은 서버에 직접 올린다 —
 * {@code banners.yml}·{@code export.json}과 같은 방식이다(ADR-001).
 *
 * <p>발급은 두 번 나가면 안 된다. 서버가 단일 인스턴스이므로 이 객체의
 * 잠금 하나면 충분하다 — 여러 인스턴스로 늘리면 파일 잠금이나 DB가 필요해진다.
 */
@Component
public class GifticonStore {

    private static final Logger log = LoggerFactory.getLogger(GifticonStore.class);

    private final Path path;

    public GifticonStore(@Value("${discount.gifticons-path:data/gifticons.yml}") String path) {
        this.path = Path.of(path);
    }

    Path path() {
        return path;
    }

    /** 아직 아무에게도 안 나간 코드 수. 0이면 프론트가 설문을 안 그린다. */
    public synchronized int remaining() {
        return (int) read().stream().filter(g -> g.get("issuedTo") == null).count();
    }

    /**
     * 코드 하나를 꺼내 발급 표시를 하고 돌려준다.
     *
     * <p>읽기 → 표시 → 쓰기가 한 덩어리라야 한다. 나눠 두면 두 요청이 같은
     * 코드를 집는다. {@code synchronized}로 묶고, 파일에 다 쓴 뒤에야 코드를
     * 돌려준다 — 먼저 돌려주고 쓰다 실패하면 같은 코드가 다음 사람에게도 간다.
     */
    public synchronized Optional<String> issue(String visitorId) {
        List<Map<String, Object>> all = read();
        for (Map<String, Object> g : all) {
            if (g.get("issuedTo") != null) continue;
            Object code = g.get("code");
            if (code == null) continue;

            g.put("issuedTo", visitorId);
            g.put("issuedAt", OffsetDateTime.now(Clock.systemDefaultZone()).toString());
            try {
                write(all);
            } catch (IOException e) {
                // 못 적었으면 발급하지 않은 것으로 둔다. 코드를 주고 기록을
                // 못 남기면 같은 코드가 다음 사람에게도 나간다.
                log.error("기프티콘 발급 기록에 실패했다 — 코드를 내주지 않는다: {}", path, e);
                return Optional.empty();
            }
            return Optional.of(String.valueOf(code));
        }
        return Optional.empty();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> read() {
        // 파일이 없는 것은 오류가 아니다 — 아직 안 올렸거나 다 소진한 상태다.
        // 어느 쪽이든 "남은 코드 0"이고, 그러면 설문이 저절로 내려간다.
        if (!Files.exists(path)) return List.of();
        try (InputStream in = Files.newInputStream(path)) {
            Object loaded = new Yaml().load(in);
            if (!(loaded instanceof Map<?, ?> root)) return List.of();
            Object list = root.get("gifticons");
            if (!(list instanceof List<?> raw)) return List.of();

            List<Map<String, Object>> out = new ArrayList<>();
            for (Object item : raw) {
                if (item instanceof Map<?, ?> m) out.add(new LinkedHashMap<>((Map<String, Object>) m));
            }
            return out;
        } catch (IOException | RuntimeException e) {
            log.error("gifticons.yml을 읽지 못했다 — 남은 코드 0으로 본다: {}", path, e);
            return List.of();
        }
    }

    private void write(List<Map<String, Object>> all) throws IOException {
        DumperOptions options = new DumperOptions();
        options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        options.setAllowUnicode(true);
        String text = new Yaml(options).dump(Map.of("gifticons", all));

        if (path.getParent() != null) Files.createDirectories(path.getParent());
        // 임시 파일에 다 쓴 뒤 옮긴다. 쓰는 도중에 죽어도 원본이 반쪽으로
        // 남지 않는다 — 반쪽이면 남은 코드가 통째로 날아간다.
        Path tmp = path.resolveSibling(path.getFileName() + ".tmp");
        Files.writeString(tmp, text, StandardCharsets.UTF_8);
        Files.move(tmp, path, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests '*GifticonStoreTest'`
Expected: PASS (4개)

- [ ] **Step 5: 파일이 저장소에 안 올라가게 막는다**

`.gitignore` 맨 아래에 붙인다:

```
# 기프티콘 코드는 값을 가진 문자열이다. 서버에 직접 올리고 저장소에는 안 둔다.
gifticons.yml
```

- [ ] **Step 6: 정말 무시되는지 확인한다**

Run: `git check-ignore -v gifticons.yml`
Expected: `.gitignore:<줄번호>:gifticons.yml	gifticons.yml`

- [ ] **Step 7: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/analytics/GifticonStore.java \
        api/src/test/java/com/discounttracker/analytics/GifticonStoreTest.java \
        .gitignore
git commit -m "feat: 기프티콘 코드를 원자적으로 하나씩 발급한다"
```

---

### Task 3: 직접 입력 거름

**Files:**
- Create: `api/src/main/java/com/discounttracker/analytics/SurveyText.java`
- Test: `api/src/test/java/com/discounttracker/analytics/SurveyTextTest.java`

**Interfaces:**
- Consumes: 없음
- Produces: `static String SurveyText.clean(String raw)` — 200자로 자르고 전화·이메일·주민번호 꼴을 지운다. `null`이면 `null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/analytics/SurveyTextTest.java`:

```java
package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

class SurveyTextTest {

    @Test
    void keepsOrdinaryText() {
        assertEquals("배달비가 비싸서 씁니다", SurveyText.clean("배달비가 비싸서 씁니다"));
    }

    @Test
    void stripsPhoneNumbers() {
        String out = SurveyText.clean("연락처 010-1234-5678 로 주세요");
        assertFalse(out.contains("010-1234-5678"));
        assertFalse(out.contains("1234"));
    }

    /** 하이픈 없이 붙여 쓴 것도 잡아야 한다. */
    @Test
    void stripsPhoneNumbersWithoutHyphens() {
        assertFalse(SurveyText.clean("01012345678").contains("01012345678"));
    }

    @Test
    void stripsEmails() {
        assertFalse(SurveyText.clean("me@example.com 으로 보내줘").contains("@example.com"));
    }

    @Test
    void stripsResidentNumbers() {
        assertFalse(SurveyText.clean("900101-1234567").contains("1234567"));
    }

    @Test
    void capsAt200Characters() {
        String out = SurveyText.clean("가".repeat(500));
        assertEquals(200, out.length());
    }

    @Test
    void nullStaysNull() {
        assertNull(SurveyText.clean(null));
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests '*SurveyTextTest'`
Expected: 컴파일 실패 — `cannot find symbol: class SurveyText`

- [ ] **Step 3: 구현한다**

`api/src/main/java/com/discounttracker/analytics/SurveyText.java`:

```java
package com.discounttracker.analytics;

import java.util.regex.Pattern;

/**
 * 설문 직접 입력을 원장에 적기 전에 거른다.
 *
 * <p>이 서비스는 자유 입력 원문을 안 남겨 왔다 — 검색 계측이 {@code query}를
 * 버리고 {@code inputLength}·{@code resultCount}만 적는다. 이유는 자유
 * 텍스트라서가 아니라 전화번호·주소가 섞여 들어올 수 있어서였다.
 *
 * <p>설문은 우리가 무엇을 물을지 정하므로 특정성이 들어올 통로를 좁힐 수
 * 있다. 그래도 사용자는 실수한다. 마지막 겹이 여기다 — 사용자가 넣어도
 * 원장에 안 닿는다.
 */
final class SurveyText {

    /** 스펙이 정한 상한. 긴 사연이 들어올 자리를 주지 않는다. */
    static final int MAX = 200;

    // 주민번호를 전화번호보다 먼저 지운다. 순서를 바꾸면 앞 6자리가 전화번호
    // 꼴에 안 걸려 뒷자리만 지워지고 생년월일이 남는다.
    private static final Pattern RESIDENT = Pattern.compile("\\d{6}\\s*[-\\s]\\s*\\d{7}");
    private static final Pattern EMAIL =
            Pattern.compile("[\\w.+-]+@[\\w-]+\\.[\\w.-]+");
    // 하이픈이 있든 없든, 국번이 3자리든 4자리든 잡는다.
    private static final Pattern PHONE =
            Pattern.compile("0\\d{1,2}\\s*[-.\\s]?\\s*\\d{3,4}\\s*[-.\\s]?\\s*\\d{4}");

    private static final String MASK = "[삭제]";

    private SurveyText() {
    }

    static String clean(String raw) {
        if (raw == null) return null;
        String out = raw.trim();
        out = RESIDENT.matcher(out).replaceAll(MASK);
        out = EMAIL.matcher(out).replaceAll(MASK);
        out = PHONE.matcher(out).replaceAll(MASK);
        return out.length() <= MAX ? out : out.substring(0, MAX);
    }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests '*SurveyTextTest'`
Expected: PASS (7개)

- [ ] **Step 5: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/analytics/SurveyText.java \
        api/src/test/java/com/discounttracker/analytics/SurveyTextTest.java
git commit -m "feat: 설문 직접 입력에서 전화·이메일·주민번호를 지운다"
```

---

### Task 4: 설문 엔드포인트

**Files:**
- Create: `api/src/main/java/com/discounttracker/analytics/SurveyService.java`
- Create: `api/src/main/java/com/discounttracker/analytics/SurveyController.java`
- Test: `api/src/test/java/com/discounttracker/analytics/SurveyControllerTest.java`

**Interfaces:**
- Consumes:
  - `SurveyEligibility#count(String)` → `SurveyEligibility.Counts(int days, int conversions, boolean answered)`
  - `SurveyEligibility.qualifies(Counts)` → `boolean`
  - `GifticonStore#remaining()` → `int`, `GifticonStore#issue(String)` → `Optional<String>`
  - `SurveyText.clean(String)` → `String`
  - `AnalyticsEventService#append(List<VisitEvent>)`
  - `VisitEvent` 생성자 — 17개 인자: `ts, event, visitorId, sessionId, visitCount, path, referrer, device, viewport, dwellMs, props, clientTs, ipHash, dev, variant, eventId, bot`
  - `ClientFingerprint#hash(HttpServletRequest)` → `String`
- Produces:
  - `GET /api/survey?visitorId=v_x` → `{"eligible": true|false}`
  - `POST /api/survey` 본문 `{"visitorId","choice","text"}` → `{"ok": true, "code": "..."}` 또는 `{"ok": false, "reason": "not_eligible"|"no_stock"}`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`api/src/test/java/com/discounttracker/analytics/SurveyControllerTest.java`:

```java
package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "discount.event-log-path=build/tmp/survey-events.jsonl",
        "discount.gifticons-path=build/tmp/survey-gifticons.yml",
})
class SurveyControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;

    @Value("${discount.event-log-path}") String logPath;
    @Value("${discount.gifticons-path}") String gifticonPath;

    /** 이 사람은 8일 접속·전환 6회 — 대상이다. */
    private static final String QUALIFIED = "v_qualified";
    /** 이 사람은 3일 접속·전환 1회 — 대상이 아니다. */
    private static final String SHORT = "v_short";

    @BeforeEach
    void seed() throws Exception {
        List<String> lines = new ArrayList<>();
        for (int d = 1; d <= 8; d++) {
            String day = String.format("2026-08-%02d", d);
            lines.add(line(day, "page_view", QUALIFIED));
            if (d <= 6) lines.add(line(day, "offer_link_click", QUALIFIED));
        }
        for (int d = 1; d <= 3; d++) {
            lines.add(line(String.format("2026-08-%02d", d), "page_view", SHORT));
        }
        lines.add(line("2026-08-01", "offer_link_click", SHORT));

        Path log = Path.of(logPath);
        Files.createDirectories(log.getParent());
        Files.write(log, lines, StandardCharsets.UTF_8);

        Path g = Path.of(gifticonPath);
        Files.writeString(g, """
            gifticons:
              - code: "AAAA-1111"
            """, StandardCharsets.UTF_8);
    }

    private String line(String day, String event, String visitorId) {
        return "{\"ts\":\"" + day + "T10:00:00+09:00\",\"event\":\"" + event
                + "\",\"visitorId\":\"" + visitorId + "\"}";
    }

    @Test
    void qualifiedVisitorIsEligible() throws Exception {
        mvc.perform(get("/api/survey").param("visitorId", QUALIFIED))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.eligible").value(true));
    }

    @Test
    void shortVisitorIsNotEligible() throws Exception {
        mvc.perform(get("/api/survey").param("visitorId", SHORT))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.eligible").value(false));
    }

    @Test
    void answeringReturnsCodeAndWritesLedger() throws Exception {
        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"visitorId":"v_qualified","choice":"save_money"}
                            """))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.ok").value(true))
           .andExpect(jsonPath("$.code").value("AAAA-1111"));

        String logged = Files.readString(Path.of(logPath)).lines()
                .filter(l -> l.contains("survey_answer"))
                .findFirst().orElseThrow();
        assertTrue(logged.contains("save_money"));
    }

    /** 대상이 아닌 사람에게는 코드가 안 나간다 — 조건 자체가 방어다. */
    @Test
    void shortVisitorGetsNoCode() throws Exception {
        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"visitorId":"v_short","choice":"compare"}
                            """))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.ok").value(false))
           .andExpect(jsonPath("$.reason").value("not_eligible"));
    }

    /** 1인 1회. 두 번째는 원장에 survey_answer가 이미 있어 대상에서 빠진다. */
    @Test
    void sameVisitorCannotAnswerTwice() throws Exception {
        String body = """
            {"visitorId":"v_qualified","choice":"compare"}
            """;
        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON).content(body))
           .andExpect(jsonPath("$.ok").value(true));
        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON).content(body))
           .andExpect(jsonPath("$.ok").value(false))
           .andExpect(jsonPath("$.reason").value("not_eligible"));
    }

    /** 모르는 선택지는 안 받는다 — choice가 토큰이라야 세는 것이 안전하다. */
    @Test
    void rejectsUnknownChoice() throws Exception {
        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"visitorId":"v_qualified","choice":"자유롭게 아무거나"}
                            """))
           .andExpect(status().isBadRequest());
    }

    /** 실수로 넣은 전화번호가 원장에 닿으면 안 된다. */
    @Test
    void neverStoresPhoneNumberFromFreeText() throws Exception {
        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"visitorId":"v_qualified","choice":"other",
                             "text":"연락처 010-1234-5678 입니다"}
                            """))
           .andExpect(jsonPath("$.ok").value(true));

        String all = Files.readString(Path.of(logPath));
        assertFalse(all.contains("010-1234-5678"));
    }

    /** 코드가 소진되면 설문 자체가 내려가야 한다. */
    @Test
    void noStockMakesSurveyIneligible() throws Exception {
        Files.writeString(Path.of(gifticonPath), "gifticons: []\n", StandardCharsets.UTF_8);

        mvc.perform(get("/api/survey").param("visitorId", QUALIFIED))
           .andExpect(jsonPath("$.eligible").value(false));
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd api && ./gradlew test --tests '*SurveyControllerTest'`
Expected: 컴파일 실패 — `cannot find symbol: class SurveyController`

- [ ] **Step 3: 서비스를 구현한다**

`api/src/main/java/com/discounttracker/analytics/SurveyService.java`:

```java
package com.discounttracker.analytics;

import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * 설문 대상 판정과 응답 처리. 순서만 정하고 실제 일은 셋에게 맡긴다.
 *
 * <p>{@link SurveyEligibility}는 원장을 훑고, {@link GifticonStore}는 코드를
 * 꺼내고, {@link SurveyText}는 자유 입력을 거른다. 여기서는 어떤 순서로
 * 부를지만 정한다 — 대상인가, 코드가 남았나, 그다음에 발급이다. 순서를
 * 바꾸면 대상이 아닌 사람에게 코드가 나간다.
 */
@Service
public class SurveyService {

    /** 스펙이 정한 네 토큰. 자유 문자열을 받으면 세는 것이 안전하지 않다. */
    static final Set<String> CHOICES = Set.of("discount_info", "save_money", "compare", "other");

    private final SurveyEligibility eligibility;
    private final GifticonStore gifticons;
    private final AnalyticsEventService events;

    public SurveyService(SurveyEligibility eligibility, GifticonStore gifticons,
                         AnalyticsEventService events) {
        this.eligibility = eligibility;
        this.gifticons = gifticons;
        this.events = events;
    }

    /**
     * 지금 이 사람에게 설문을 띄울까.
     *
     * <p>남은 코드도 같이 본다. 줄 것이 없는데 묻는 일이 없어야 한다 —
     * 리워드를 걸어 놓고 못 주면 안 묻느니만 못하다.
     */
    public boolean eligible(String visitorId) {
        if (gifticons.remaining() <= 0) return false;
        return SurveyEligibility.qualifies(eligibility.count(visitorId));
    }

    /** 응답 결과. {@code code}는 성공했을 때만 채워진다. */
    public record Answer(boolean ok, String reason, String code) {
        static Answer fail(String reason) {
            return new Answer(false, reason, null);
        }
    }

    /**
     * 응답을 받아 코드를 내준다.
     *
     * <p>대상 판정을 여기서 다시 한다. {@code GET}에서 통과했다고 믿으면
     * 그 사이에 답한 사람이 한 번 더 받는다 — 판정은 쓰는 쪽에서 해야 한다.
     */
    public Answer answer(String visitorId, String choice, String text, String ipHash) {
        if (!eligible(visitorId)) {
            // 코드가 없어서인지 대상이 아니라서인지 갈라 준다. 프론트는
            // 어느 쪽이든 카드를 내리지만, 로그를 보는 사람이 알아야 한다.
            return Answer.fail(gifticons.remaining() <= 0 ? "no_stock" : "not_eligible");
        }
        Optional<String> code = gifticons.issue(visitorId);
        if (code.isEmpty()) return Answer.fail("no_stock");

        record(visitorId, choice, text, ipHash);
        return new Answer(true, null, code.get());
    }

    /**
     * 원장에 {@code survey_answer} 한 줄.
     *
     * <p>프론트가 {@code /api/events}로 쏘지 않고 서버가 직접 적는다. 그
     * 경로는 인증이 없어 누구나 위조할 수 있고, 그러면 응답 수와 발급 수가
     * 어긋나 설문 결과를 못 믿게 된다.
     */
    private void record(String visitorId, String choice, String text, String ipHash) {
        Map<String, String> props = new LinkedHashMap<>();
        props.put("choice", choice);
        String cleaned = SurveyText.clean(text);
        if ("other".equals(choice) && cleaned != null && !cleaned.isBlank()) {
            props.put("text", cleaned);
        }
        events.append(List.of(new VisitEvent(
                OffsetDateTime.now().toString(), "survey_answer", visitorId,
                null, null, null, null, null, null, null, props, null,
                ipHash, null, null, UUID.randomUUID().toString(), null)));
    }
}
```

- [ ] **Step 4: 컨트롤러를 구현한다**

`api/src/main/java/com/discounttracker/analytics/SurveyController.java`:

```java
package com.discounttracker.analytics;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 설문 대상 조회와 응답 접수.
 *
 * <p>판정이 전부 여기 뒤에 있다. 프론트는 "띄울까"를 묻고 답을 그대로 따른다 —
 * 리워드가 걸린 판정을 브라우저에 두면 {@code localStorage}를 고쳐 아무나
 * 받아간다.
 */
@RestController
@RequestMapping("/api/survey")
public class SurveyController {

    private final SurveyService survey;
    private final ClientFingerprint fingerprint;

    public SurveyController(SurveyService survey, ClientFingerprint fingerprint) {
        this.survey = survey;
        this.fingerprint = fingerprint;
    }

    @GetMapping
    public Map<String, Object> status(@RequestParam(required = false) String visitorId) {
        return Map.of("eligible", survey.eligible(visitorId));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> answer(@RequestBody Submission body,
                                                      HttpServletRequest request) {
        if (body == null || body.choice() == null
                || !SurveyService.CHOICES.contains(body.choice())) {
            return ResponseEntity.badRequest().build();
        }
        SurveyService.Answer result = survey.answer(
                body.visitorId(), body.choice(), body.text(), fingerprint.hash(request));

        // Map.of는 null 값을 못 담는다. 실패 응답에는 code가 없다.
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", result.ok());
        if (result.code() != null) out.put("code", result.code());
        if (result.reason() != null) out.put("reason", result.reason());
        return ResponseEntity.ok(out);
    }

    /** 프론트가 보내는 모양. */
    public record Submission(String visitorId, String choice, String text) {
    }
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `cd api && ./gradlew test --tests '*SurveyControllerTest'`
Expected: PASS (8개)

- [ ] **Step 6: 서버 전체 테스트가 여전히 통과하는지 본다**

Run: `cd api && ./gradlew test`
Expected: BUILD SUCCESSFUL

- [ ] **Step 7: 커밋한다**

```bash
git add api/src/main/java/com/discounttracker/analytics/SurveyService.java \
        api/src/main/java/com/discounttracker/analytics/SurveyController.java \
        api/src/test/java/com/discounttracker/analytics/SurveyControllerTest.java
git commit -m "feat: 설문 대상 조회와 응답 접수 엔드포인트"
```

---

### Task 5: 닫기 상태

**Files:**
- Create: `web/src/surveyDismiss.js`
- Test: `web/src/surveyDismiss.test.js`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `shouldShow(now = Date.now())` → `boolean`
  - `markDismissed(now = Date.now())` → `void`
  - `markAnswered()` → `void`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/src/surveyDismiss.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

// node:test에는 localStorage가 없다. 규칙만 검사하면 되므로 최소한으로 세운다.
function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  }
}

globalThis.localStorage = fakeStorage()

const { shouldShow, markDismissed, markAnswered } = await import('./surveyDismiss.js')

const DAY = 24 * 60 * 60 * 1000

test('처음에는 띄운다', () => {
  globalThis.localStorage = fakeStorage()
  assert.equal(shouldShow(), true)
})

test('답하면 영구히 안 띄운다', () => {
  globalThis.localStorage = fakeStorage()
  markAnswered()
  assert.equal(shouldShow(), false)
  assert.equal(shouldShow(Date.now() + 365 * DAY), false)
})

test('한 번 닫으면 3일 뒤에 다시 띄운다', () => {
  globalThis.localStorage = fakeStorage()
  const t0 = Date.parse('2026-09-01T00:00:00Z')
  markDismissed(t0)

  assert.equal(shouldShow(t0 + 2 * DAY), false, '이틀 뒤에는 아직')
  assert.equal(shouldShow(t0 + 3 * DAY), true, '사흘 뒤에는 다시')
})

test('두 번 닫으면 영구히 안 띄운다', () => {
  globalThis.localStorage = fakeStorage()
  const t0 = Date.parse('2026-09-01T00:00:00Z')
  markDismissed(t0)
  markDismissed(t0 + 3 * DAY)

  assert.equal(shouldShow(t0 + 100 * DAY), false)
})

test('localStorage가 막혀도 앱이 멈추지 않는다', () => {
  globalThis.localStorage = {
    getItem() { throw new Error('막힘') },
    setItem() { throw new Error('막힘') },
  }
  assert.equal(shouldShow(), true)
  assert.doesNotThrow(() => markDismissed())
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && node --test src/surveyDismiss.test.js`
Expected: FAIL — `Cannot find module './surveyDismiss.js'`

- [ ] **Step 3: 구현한다**

`web/src/surveyDismiss.js`:

```js
// 설문을 다시 띄울지 말지. 개인 상태라 브라우저에 둔다 — visitorId가 이미
// 지는 한계(지우면 초기화)를 같이 진다. 서버에 두지 않는 이유는 이것이
// 리워드 조건이 아니기 때문이다. 지워 봐야 설문이 한 번 더 뜰 뿐, 대상
// 판정과 1인 1회는 서버가 원장으로 따로 막는다.
const DISMISS_KEY = 'dk_survey_dismissed'   // 닫은 시각들(콤마로 이어 붙인다)
const ANSWERED_KEY = 'dk_survey_answered'

const DAY = 24 * 60 * 60 * 1000
const COOLDOWN = 3 * DAY
const MAX_DISMISSALS = 2

function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    // 사파리 프라이빗 등. 못 읽으면 아무것도 안 한 것으로 본다.
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 못 적으면 다음에 또 뜬다 — 리워드는 서버가 막으므로 손해가 없다 */
  }
}

function dismissals() {
  const raw = read(DISMISS_KEY)
  if (!raw) return []
  return raw.split(',').map(Number).filter((n) => Number.isFinite(n))
}

export function shouldShow(now = Date.now()) {
  if (read(ANSWERED_KEY)) return false

  const times = dismissals()
  if (times.length === 0) return true
  // 두 번 닫았으면 관심이 없다는 뜻이다. 더 묻지 않는다.
  if (times.length >= MAX_DISMISSALS) return false
  return now - times[times.length - 1] >= COOLDOWN
}

export function markDismissed(now = Date.now()) {
  write(DISMISS_KEY, [...dismissals(), now].join(','))
}

export function markAnswered() {
  write(ANSWERED_KEY, '1')
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && node --test src/surveyDismiss.test.js`
Expected: `# pass 5`

- [ ] **Step 5: 이 검사를 `npm test`에 넣는다**

`web/package.json`의 `scripts`에서 `test:autocomplete` 바로 아래에 한 줄을 넣고, `test`의 사슬에도 끼운다:

```json
    "test": "npm run test:autocomplete && npm run test:survey-dismiss && npm run test:analytics && npm run test:posthog && npm run test:event-contract && npm run test:filters && npm run test:brand-route",
    "test:autocomplete": "node --test src/brandAutocomplete.test.js",
    "test:survey-dismiss": "node --test src/surveyDismiss.test.js",
```

- [ ] **Step 6: 사슬이 도는지 본다**

Run: `cd web && npm test`
Expected: 모든 단계 PASS

- [ ] **Step 7: 커밋한다**

```bash
git add web/src/surveyDismiss.js web/src/surveyDismiss.test.js web/package.json
git commit -m "feat: 설문 다시 안 띄우는 규칙"
```

---

### Task 6: 설문 카드

**Files:**
- Create: `web/src/SurveyCard.jsx`
- Modify: `web/src/App.css` (파일 끝에 추가)
- Modify: `web/scripts/verify-analytics-event-contract.mjs`
- Modify: `api/src/main/java/com/discounttracker/analytics/EventController.java:38-44` (`ALLOWED_EVENTS`)

**Interfaces:**
- Consumes: `track(event, props)` — `web/src/analytics.js`; `shouldShow`, `markDismissed`, `markAnswered` — `web/src/surveyDismiss.js`
- Produces: `export default function SurveyCard({ visitorId, onClose })` — 기본 내보내기

- [ ] **Step 1: 카드를 만든다**

`web/src/SurveyCard.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { track } from './analytics.js'
import { markAnswered, markDismissed } from './surveyDismiss.js'

// 스펙이 정한 네 토큰과 화면 문구. 토큰은 원장에 그대로 들어가므로 바꾸면
// 이전 응답과 못 합친다.
const CHOICES = [
  { token: 'discount_info', label: '할인 정보 보려고' },
  { token: 'save_money', label: '배달비 아끼려고' },
  { token: 'compare', label: '앱끼리 비교하려고' },
]

const MAX_TEXT = 200

export default function SurveyCard({ visitorId, onClose }) {
  const [choice, setChoice] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [code, setCode] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    track('survey_impression')
  }, [])

  function close() {
    markDismissed()
    track('survey_dismiss')
    onClose()
  }

  async function submit(token) {
    if (sending) return
    setSending(true)
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, choice: token, text: token === 'other' ? text : undefined }),
      })
      const body = await res.json()
      if (body.ok) {
        // 답한 사람에게는 다시 안 묻는다. 서버도 원장으로 막지만, 여기서
        // 막아야 화면이 바로 조용해진다.
        markAnswered()
        setCode(body.code)
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  if (code) {
    return (
      <div className="survey-card survey-card--done">
        <p className="survey-thanks">답해주셔서 고맙습니다.</p>
        <p className="survey-code-label">기프티콘 번호</p>
        {/* 화면에 바로 보여준다 — 연락처를 안 받기로 했으니 이 자리가
            사용자가 번호를 받는 유일한 곳이다. */}
        <p className="survey-code">{code}</p>
        <button type="button" className="survey-close-btn" onClick={onClose}>닫기</button>
      </div>
    )
  }

  return (
    <div className="survey-card">
      <button type="button" className="survey-x" onClick={close} aria-label="설문 닫기">×</button>
      <h3 className="survey-q">어떻게 쓰고 계신가요?</h3>

      <ul className="survey-choices">
        {CHOICES.map((c) => (
          <li key={c.token}>
            <button type="button" className="survey-choice" disabled={sending}
                    onClick={() => submit(c.token)}>
              {c.label}
            </button>
          </li>
        ))}
      </ul>

      {choice === 'other' ? (
        <div className="survey-other">
          <label className="survey-other-label" htmlFor="survey-other-input">직접 입력</label>
          <textarea id="survey-other-input" className="survey-other-input"
                    maxLength={MAX_TEXT} rows={3} value={text}
                    onChange={(e) => setText(e.target.value)} />
          <button type="button" className="survey-send" disabled={sending || !text.trim()}
                  onClick={() => submit('other')}>
            보내기
          </button>
        </div>
      ) : (
        <button type="button" className="survey-choice survey-choice--other"
                onClick={() => setChoice('other')}>
          직접 입력
        </button>
      )}

      {failed && <p className="survey-failed">지금은 참여할 수 없습니다.</p>}
    </div>
  )
}
```

- [ ] **Step 2: 서버 허용 목록에 두 이벤트를 넣는다**

`api/src/main/java/com/discounttracker/analytics/EventController.java`의 `ALLOWED_EVENTS` 마지막 줄을 이렇게 고친다:

```java
            "banner_impression", "banner_dismiss", "brand_search_submitted",
            // 설문 노출·닫기는 프론트가 쏜다. 응답(survey_answer)은 SurveyService가
            // 직접 적는다 — 이 경로는 인증이 없어 위조하면 응답 수와 코드 발급
            // 수가 어긋난다.
            "survey_impression", "survey_dismiss");
```

- [ ] **Step 3: 계약 검사에 `SurveyCard.jsx`를 넣는다**

`web/scripts/verify-analytics-event-contract.mjs`에서 `topBarASource` 아래에 붙인다:

```js
// 설문 카드. 이 파일이 목록에서 빠지면 survey_impression·survey_dismiss가
// 서버 허용 목록에 없어도 검사를 통과하고, 서버가 조용히 버린다.
const surveyCardSource = await source('web/src/SurveyCard.jsx')
```

그리고 `emittedEvents`의 `staticTrackEvents(...TopBarA...)` 줄 아래에 붙인다:

```js
  ...staticTrackEvents('web/src/SurveyCard.jsx', surveyCardSource),
```

- [ ] **Step 4: 계약 검사가 통과하는지 본다**

Run: `cd web && npm run test:event-contract`
Expected: `analytics frontend/API event contract: PASS`

- [ ] **Step 5: 카드 모양을 브랜드 카드와 맞춘다**

`web/src/App.css` 맨 아래에 붙인다:

```css
/* 설문 카드. 크기와 모서리를 브랜드 카드와 같게 해서 그리드 첫 줄에
   끼워도 이물감이 없게 한다 — 배너 슬롯에 안 넣은 이유가 이것이다.
   배너는 4.3초마다 넘어가는데 설문은 머물러야 한다. */
.survey-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--card-border, #eaeaea);
  border-radius: 12px;
  background: var(--card-bg, #fff);
}

.survey-q {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.survey-choices {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.survey-choice {
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  font: inherit;
  font-size: 14px;
  border: 1px solid var(--card-border, #eaeaea);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}

.survey-choice:hover { background: rgba(0, 0, 0, 0.03); }
.survey-choice:disabled { opacity: 0.5; cursor: default; }

.survey-other { display: flex; flex-direction: column; gap: 6px; }
.survey-other-label { font-size: 12px; opacity: 0.7; }

.survey-other-input {
  width: 100%;
  padding: 8px;
  font: inherit;
  font-size: 14px;
  border: 1px solid var(--card-border, #eaeaea);
  border-radius: 8px;
  resize: vertical;
}

.survey-send, .survey-close-btn {
  align-self: flex-start;
  padding: 8px 14px;
  font: inherit;
  font-size: 14px;
  border: 0;
  border-radius: 6px;
  background: #111;
  color: #fff;
  cursor: pointer;
}

.survey-send:disabled { opacity: 0.4; cursor: default; }

.survey-x {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  font-size: 18px;
  line-height: 1;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.survey-thanks { margin: 0; font-size: 14px; }
.survey-code-label { margin: 0; font-size: 12px; opacity: 0.7; }

.survey-code {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  user-select: all;
}

.survey-failed { margin: 0; font-size: 13px; color: #9f2f2d; }
```

- [ ] **Step 6: 카드가 실제로 파싱되는지 본다**

`npm run build`만으로는 부족하다 — 이 시점에 `SurveyCard.jsx`를 부르는 곳이 아직 없어서 번들러가 파일을 아예 안 읽고 지나간다. 문법 오류가 Task 7까지 숨는다. 파일을 직접 변환해 본다.

Run:

```bash
cd web && node -e "
const esbuild = require('esbuild')
esbuild.buildSync({ entryPoints: ['src/SurveyCard.jsx'], bundle: false,
                    outfile: '/dev/null', loader: { '.jsx': 'jsx' } })
console.log('SurveyCard.jsx: 파싱 OK')
"
```

Expected: `SurveyCard.jsx: 파싱 OK`

(esbuild는 vite가 이미 끌고 오는 의존성이라 따로 설치할 것이 없다. 이 명령이 `Cannot find module 'esbuild'`로 실패하면 `npx esbuild src/SurveyCard.jsx --loader:.jsx=jsx --outfile=/dev/null`로 대신한다.)

- [ ] **Step 7: 커밋한다**

```bash
git add web/src/SurveyCard.jsx web/src/App.css \
        web/scripts/verify-analytics-event-contract.mjs \
        api/src/main/java/com/discounttracker/analytics/EventController.java
git commit -m "feat: 설문 카드와 노출·닫기 계측"
```

---

### Task 7: 그리드 첫 줄에 끼운다

**Files:**
- Modify: `web/src/api.js` (끝에 추가)
- Modify: `web/src/App.jsx:1146-1158` (그리드 렌더)

**Interfaces:**
- Consumes: `SurveyCard` (기본 내보내기), `shouldShow` — `./surveyDismiss`, `getAnalyticsContext()` — `./analytics-context`
- Produces: `fetchSurveyStatus(visitorId)` — `web/src/api.js`, `Promise<{eligible: boolean}>`

- [ ] **Step 1: API 호출을 더한다**

`web/src/api.js` 끝에 붙인다:

```js
// 설문을 띄울지 서버에 묻는다. 판정이 서버에 있는 이유는 리워드다 —
// 브라우저가 정하면 localStorage를 고쳐 아무나 기프티콘을 받아간다.
export async function fetchSurveyStatus(visitorId) {
  const res = await fetch(`${API_BASE}/api/survey?visitorId=${encodeURIComponent(visitorId)}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: App.jsx에 불러오기를 더한다**

`web/src/App.jsx` 맨 위 import 묶음을 고친다. 2번째 줄이 지금 이렇다:

```jsx
import { fetchBanners, fetchBrands } from './api.js'
```

그 줄에 `fetchSurveyStatus`를 더하고, 아래 세 줄을 묶음 끝에 붙인다 — 같은 파일을 두 번 불러오지 않는다. 이 프로젝트의 import는 확장자를 붙여 쓴다.

```jsx
import { fetchBanners, fetchBrands, fetchSurveyStatus } from './api.js'
import SurveyCard from './SurveyCard.jsx'
import { shouldShow as surveyShouldShow } from './surveyDismiss.js'
import { getAnalyticsContext } from './analytics-context.js'
```

- [ ] **Step 3: 상태와 조회를 더한다**

`App.jsx`에서 `visibleBrands`를 만드는 곳과 같은 컴포넌트 안, 다른 `useState` 선언들 옆에 붙인다:

```jsx
  // 설문을 띄울지. null이면 아직 서버 답을 못 받은 것 — 그 사이엔 안 그린다.
  const [surveyOn, setSurveyOn] = useState(false)

  useEffect(() => {
    // 브라우저가 이미 답했거나 두 번 닫았으면 서버에 묻지도 않는다.
    if (!surveyShouldShow()) return
    let alive = true
    const { visitorId } = getAnalyticsContext()
    fetchSurveyStatus(visitorId)
      .then((s) => { if (alive) setSurveyOn(Boolean(s.eligible)) })
      // 못 물어보면 안 띄운다. 설문이 안 뜨는 것은 사용자에게 아무 손해가 없다.
      .catch(() => {})
    return () => { alive = false }
  }, [])
```

- [ ] **Step 4: 그리드 첫 줄에 끼운다**

`App.jsx:1146` 근처의 그리드를 이렇게 고친다 — 카드 목록 **앞에** 설문 카드를 둔다:

```jsx
        <div className="brand-grid" key={gridKey}>
          {/* 첫 줄 한 칸. 진입 즉시 보인다 — 대상 판정이 이미 필터라
              시점으로 또 거를 이유가 없고, 재방문 세션의 63.1%는 어차피
              아무것도 안 하고 나간다. */}
          {surveyOn && (
            <SurveyCard
              visitorId={getAnalyticsContext().visitorId}
              onClose={() => setSurveyOn(false)}
            />
          )}
          {visibleBrands.map((b) => (
            <BrandCard
              key={b.name}
              brand={b}
              highlighted={linkedBrand === brandCardId(b.name)}
              onInteract={() => setLinkedBrand(null)}
              checked={CART_ENABLED && cart.has(b.name)}
              onToggleCheck={toggleCart}
            />
          ))}
        </div>
```

- [ ] **Step 5: 프론트 검사를 전부 돌린다**

Run: `cd web && npm test && npm run build`
Expected: 모두 PASS, 빌드 성공

- [ ] **Step 6: 서버를 띄우고 손으로 확인한다**

Run:

```bash
cd api && ./gradlew bootRun \
  --args='--discount.event-log-path=build/tmp/manual-events.jsonl --discount.gifticons-path=build/tmp/manual-gifticons.yml'
```

다른 창에서 대상이 아닌 사람을 먼저 확인한다:

```bash
curl -s 'http://localhost:8080/api/survey?visitorId=v_nobody'
```

Expected: `{"eligible":false}`

- [ ] **Step 7: 대상이 되는 원장을 심고 다시 확인한다**

```bash
cd api
python - <<'EOF'
import io, pathlib
p = pathlib.Path("build/tmp/manual-events.jsonl")
p.parent.mkdir(parents=True, exist_ok=True)
lines = []
for d in range(1, 9):
    day = f"2026-08-{d:02d}"
    lines.append('{"ts":"%sT10:00:00+09:00","event":"page_view","visitorId":"v_me"}' % day)
    if d <= 6:
        lines.append('{"ts":"%sT10:01:00+09:00","event":"offer_link_click","visitorId":"v_me"}' % day)
io.open(p, "w", encoding="utf-8").write("\n".join(lines) + "\n")
io.open("build/tmp/manual-gifticons.yml", "w", encoding="utf-8").write(
    'gifticons:\n  - code: "TEST-0001"\n')
print("심었다")
EOF
curl -s 'http://localhost:8080/api/survey?visitorId=v_me'
```

Expected: `{"eligible":true}`

- [ ] **Step 8: 응답과 발급을 확인한다**

```bash
curl -s -X POST http://localhost:8080/api/survey \
  -H 'Content-Type: application/json' \
  -d '{"visitorId":"v_me","choice":"other","text":"연락처 010-1234-5678"}'
```

Expected: `{"ok":true,"code":"TEST-0001"}`

이어서 세 가지를 본다.

```bash
grep survey_answer api/build/tmp/manual-events.jsonl     # 한 줄 있어야 한다
grep -c '010-1234-5678' api/build/tmp/manual-events.jsonl # 0이어야 한다
curl -s 'http://localhost:8080/api/survey?visitorId=v_me' # {"eligible":false}
```

- [ ] **Step 9: 커밋한다**

```bash
git add web/src/api.js web/src/App.jsx
git commit -m "feat: 대상 세션에만 브랜드 그리드 첫 줄에 설문 카드를 띄운다"
```

---

### Task 8: 운영 준비와 문서

**Files:**
- Modify: `api/src/main/resources/application.yml`
- Modify: `docs/CAPABILITIES.md`

**Interfaces:**
- Consumes: Task 1~7이 만든 전부
- Produces: 없음 (문서와 설정)

- [ ] **Step 1: 기프티콘 경로를 배너와 같은 자리에 둔다**

`api/src/main/resources/application.yml`의 `discount:` 아래, `banners-path` 바로 다음 줄에 붙인다. 이 파일은 기본값을 환경변수로 덮게 `${VAR:기본값}` 꼴을 쓴다 — 서버(systemd)가 그 변수로 실파일을 가리킨다.

```yaml
  # 기프티콘 코드. 값을 가진 문자열이라 저장소에 안 두고 서버에 직접 올린다.
  # 파일이 없으면 남은 코드 0으로 보고 설문이 저절로 안 뜬다.
  gifticons-path: ${DISCOUNT_GIFTICONS_PATH:data/gifticons.yml}
```

고친 뒤 세 줄이 나란히 있어야 한다:

Run: `grep -n "export-path\|banners-path\|gifticons-path" api/src/main/resources/application.yml`
Expected: 세 줄 모두 `${...}` 꼴

- [ ] **Step 2: 설정이 실제로 물리는지 본다**

Run: `cd api && ./gradlew test`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 지금 대상이 몇 명인지 실측한다**

서버 원장을 받아 `SurveyEligibility`와 같은 규칙으로 센다. `experiments.py power`는 표본 크기 계산이라 이 용도가 아니다.

```bash
cd scripts && python - <<'EOF'
import collections, json, urllib.request

CONV = {"offer_link_click", "banner_click"}
# 서버에서 원장을 받는다. 로컬 사본이 있으면 이 두 줄 대신
# lines = open("events.jsonl", encoding="utf-8") 를 쓴다.
src = "https://bebeggars.duckdns.org/api/events.jsonl"
lines = urllib.request.urlopen(src, timeout=60).read().decode("utf-8").splitlines()

days, conv, answered = collections.defaultdict(set), collections.Counter(), set()
for line in lines:
    try:
        e = json.loads(line)
    except ValueError:
        continue
    if e.get("dev") or e.get("bot"):
        continue
    v, ts, ev = e.get("visitorId"), e.get("ts") or "", e.get("event")
    if not v:
        continue
    if ev == "survey_answer":
        answered.add(v)
    if len(ts) >= 10:
        days[v].add(ts[:10])
    if ev in CONV:
        conv[v] += 1

n = sum(1 for v in days
        if len(days[v]) >= 7 and conv[v] >= 5 and v not in answered)
print("대상", n, "명")
EOF
```

Expected: 사람 수가 나온다. 스펙이 실측한 41명과 자릿수가 다르면(0~5명이거나 수백 명이면) 대상 조건을 다시 볼 신호다 — 그때는 계획을 멈추고 사람에게 알린다.

- [ ] **Step 4: `docs/CAPABILITIES.md`에 한 항목을 더한다**

"지금 없는 것 (의도적)" 섹션 **위쪽**, 돌아가는 것들 목록 끝에 붙인다:

```markdown
### 리워드 설문

접속일 7일 이상·전환 5회 이상인 사람에게만 브랜드 그리드 첫 줄에 한 문항
설문 카드를 띄운다. 답하면 기프티콘 번호를 화면에 바로 준다.

- 판정과 발급은 전부 서버가 한다 — 리워드가 걸린 판정을 브라우저에 두면
  `localStorage`를 고쳐 누구나 받아간다.
- `GET /api/survey?visitorId=` 로 띄울지 묻고, `POST /api/survey` 로 답한다.
- 코드는 `gifticons.yml`(jar 밖, 저장소에 없음). 소진되면 설문이 저절로 내려간다.
- 원장에 `survey_impression`·`survey_dismiss`(프론트)와 `survey_answer`(서버)가 쌓인다.
- 자유 입력은 200자 상한에 전화·이메일·주민번호를 서버가 지운다.

**배포할 때:** 서버 `data/gifticons.yml`에 코드를 먼저 올린다. 안 올리면
남은 코드 0이라 설문이 아무에게도 안 뜬다. 그리고 이 배포에는 다른 변경을
같이 싣지 않는다 — 전환율 추이가 갈릴 때 원인이 하나여야 한다.
```

- [ ] **Step 5: 커밋한다**

```bash
git add api/src/main/resources/application.yml docs/CAPABILITIES.md
git commit -m "docs: 리워드 설문 운영 절차와 기프티콘 경로"
```

---

## 되돌리는 법

설문만 내리려면 서버에서 `gifticons.yml`을 치우거나 비운다.

```bash
ssh -i ~/key_turbom_v0.key ubuntu@bebeggars.duckdns.org \
  'mv /home/ubuntu/delivery-discount-api/data/gifticons.yml{,.off}'
```

남은 코드가 0이 되어 `GET /api/survey`가 `eligible: false`를 답하고, 프론트가 카드를 안 그린다. 재배포도 재시작도 필요 없다. 이미 발급된 코드는 파일에 남아 있으므로 되돌릴 때 그대로 쓴다.
