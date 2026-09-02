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
        "discount.survey.test-visitors=v_tester, v_spare",
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

    /**
     * 코드가 소진돼도 설문은 그대로 뜬다 — 응답 자체는 재고와 무관하게
     * 값이 있다. 예전엔 여기서 막아 다섯 문항 채운 사람 답조차 못 받았다.
     */
    @Test
    void noStockStillLeavesSurveyEligible() throws Exception {
        Files.writeString(Path.of(gifticonPath), "gifticons: []\n", StandardCharsets.UTF_8);

        mvc.perform(get("/api/survey").param("visitorId", QUALIFIED))
           .andExpect(jsonPath("$.eligible").value(true));
    }

    /**
     * 테스트 id는 접속일·전환수를 건너뛴다.
     *
     * <p>배포한 화면에서 개발자가 확인할 길이 없으면, 남의 visitorId를
     * 빌려 쓰거나 원장에 가짜 방문을 심게 된다. 둘 다 되돌릴 수 없다.
     */
    @Test
    void testVisitorSkipsThresholds() throws Exception {
        mvc.perform(get("/api/survey").param("visitorId", "v_tester"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.eligible").value(true));
    }

    /** 목록에 없는 사람에게는 아무것도 안 열린다. */
    @Test
    void unlistedVisitorStaysBlocked() throws Exception {
        mvc.perform(get("/api/survey").param("visitorId", "v_stranger"))
           .andExpect(jsonPath("$.eligible").value(false));
    }

    /** 문턱만 건너뛴다. 1인 1회는 테스트 id에도 그대로 걸린다. */
    @Test
    void testVisitorStillAnswersOnlyOnce() throws Exception {
        String body = """
            {"visitorId":"v_tester","choice":"compare"}
            """;
        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON).content(body))
           .andExpect(jsonPath("$.ok").value(true))
           .andExpect(jsonPath("$.code").value("AAAA-1111"));
        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON).content(body))
           .andExpect(jsonPath("$.ok").value(false))
           .andExpect(jsonPath("$.reason").value("not_eligible"));
    }

    /** 재고가 없어도 테스트 id에는 뜬다(실제 사람과 마찬가지로). */
    @Test
    void testVisitorSeesSurveyWithoutStock() throws Exception {
        Files.writeString(Path.of(gifticonPath), "gifticons: []\n", StandardCharsets.UTF_8);

        mvc.perform(get("/api/survey").param("visitorId", "v_tester"))
           .andExpect(jsonPath("$.eligible").value(true));
    }

    /**
     * 없는 코드를 지어내지는 않지만, 응답 자체는 받는다(ok=true) —
     * 재고가 없다고 다섯 문항 채운 답을 버리지 않는다.
     */
    @Test
    void testVisitorStillGetsNoCodeWithoutStock() throws Exception {
        Files.writeString(Path.of(gifticonPath), "gifticons: []\n", StandardCharsets.UTF_8);

        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"visitorId":"v_tester","choice":"compare"}
                            """))
           .andExpect(jsonPath("$.ok").value(true))
           .andExpect(jsonPath("$.reason").value("no_stock"));
    }
}
