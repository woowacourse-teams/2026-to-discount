package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "discount.event-log-path=build/tmp/test-events.jsonl")
class EventControllerTest {

    @Autowired MockMvc mvc;

    @Value("${discount.event-log-path}")
    String logPath;

    private String batch(String body) {
        return "[" + body + "]";
    }

    @Test
    void acceptsKnownEvent() throws Exception {
        mvc.perform(post("/api/events").contentType(MediaType.APPLICATION_JSON)
                        .content(batch("""
                            {"event":"page_view","visitorId":"v_1","sessionId":"s_1",
                             "visitCount":1,"path":"/","device":"mobile"}
                            """)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(1));
    }

    @Test
    void recordsExperimentVariantAndRejectsJunk() throws Exception {
        mvc.perform(post("/api/events").contentType(MediaType.APPLICATION_JSON)
                        .content(batch("""
                            {"event":"page_view","visitorId":"v_var","sessionId":"s_var",
                             "visitCount":1,"path":"/","device":"mobile","variant":"b"}
                            """)))
           .andExpect(status().isOk());

        // 갈래를 못 남기면 A/B를 나눠도 나중에 가를 수가 없다.
        assertTrue(Files.readString(Path.of(logPath)).contains("\"variant\":\"b\""));

        mvc.perform(post("/api/events").contentType(MediaType.APPLICATION_JSON)
                        .content(batch("""
                            {"event":"page_view","visitorId":"v_junk","sessionId":"s_junk",
                             "visitCount":1,"path":"/","device":"mobile",
                             "variant":"<script>alert(1)</script>"}
                            """)))
           .andExpect(status().isOk());

        // 자유 문자열로 열어두면 무엇이 진짜 갈래인지 알 수 없게 된다.
        assertFalse(Files.readString(Path.of(logPath)).contains("script"));
    }

    @Test
    void preservesValidClientEventIdAcrossRepeatedRequests() throws Exception {
        String eventId = UUID.randomUUID().toString();
        String body = batch("""
                {"event":"page_view","visitorId":"v_stable","sessionId":"s_stable",
                 "visitCount":1,"path":"/","device":"mobile","eventId":"%s"}
                """.formatted(eventId));

        mvc.perform(post("/api/events").contentType(MediaType.APPLICATION_JSON).content(body))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(1));
        mvc.perform(post("/api/events").contentType(MediaType.APPLICATION_JSON).content(body))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(1));

        String logged = Files.readString(Path.of(logPath));
        String serializedId = "\"eventId\":\"" + eventId + "\"";
        assertTrue(logged.indexOf(serializedId) != logged.lastIndexOf(serializedId));
    }

    @Test
    void invalidClientEventIdFallsBackToServerUuid() throws Exception {
        mvc.perform(post("/api/events").contentType(MediaType.APPLICATION_JSON)
                        .content(batch("""
                            {"event":"page_view","visitorId":"v_invalid_event_id",
                             "sessionId":"s_1","eventId":"not-a-uuid"}
                            """)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(1));

        String loggedEvent = Files.readString(Path.of(logPath)).lines()
                .filter(line -> line.contains("\"visitorId\":\"v_invalid_event_id\""))
                .reduce((first, second) -> second)
                .orElseThrow();
        assertTrue(loggedEvent.matches(".*\"eventId\":\"[0-9a-f-]{36}\".*"));
        assertFalse(loggedEvent.contains("not-a-uuid"));
    }

    @Test
    void dropsUnknownEventName() throws Exception {
        // 화이트리스트에 없는 이름으로 로그를 채우지 못하게 한다.
        mvc.perform(post("/api/events").contentType(MediaType.APPLICATION_JSON)
                        .content(batch("""
                            {"event":"arbitrary_junk","visitorId":"v_1"}
                            """)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0));
    }

    @Test
    void emptyBatchIsAccepted() throws Exception {
        mvc.perform(post("/api/events").contentType(MediaType.APPLICATION_JSON).content("[]"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0));
    }

    @Test
    void acceptsTextPlainBecauseSendBeaconCannotPreflight() throws Exception {
        // 이탈 시점(체류 시간)은 sendBeacon으로 오는데, 비콘은 CORS 프리플라이트를
        // 못 해서 application/json이면 조용히 유실된다. text/plain을 못 받으면
        // 체류 데이터가 통째로 사라지므로 이 계약을 테스트로 고정한다.
        mvc.perform(post("/api/events").contentType(MediaType.TEXT_PLAIN)
                        .content(batch("""
                            {"event":"page_exit","visitorId":"v_1","sessionId":"s_1",
                             "visitCount":1,"path":"/","device":"mobile","dwellMs":4200}
                            """)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(1));
    }

    @Test
    void devFlagPassesThroughToLog() throws Exception {
        // ?dev=1로 켠 테스트 트래픽은 dev:true로 남아야 집계에서 걸러낼 수 있다.
        mvc.perform(post("/api/events").contentType(MediaType.APPLICATION_JSON)
                        .content(batch("""
                            {"event":"page_view","visitorId":"v_dev","sessionId":"s_dev",
                             "visitCount":1,"path":"/","device":"mobile","dev":true}
                            """)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(1));

        String logged = Files.readString(Path.of(logPath));
        assertTrue(logged.contains("\"visitorId\":\"v_dev\""));
        assertTrue(logged.contains("\"dev\":true"));
        assertTrue(logged.matches("(?s).*\"eventId\":\"[0-9a-f-]{36}\".*"));
    }

    @Test
    void malformedBodyIsIgnoredNotAnError() throws Exception {
        mvc.perform(post("/api/events").contentType(MediaType.TEXT_PLAIN).content("not json{{"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0));
    }
}
