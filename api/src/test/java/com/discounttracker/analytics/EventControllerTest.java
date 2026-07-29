package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "discount.event-log-path=build/tmp/test-events.jsonl")
class EventControllerTest {

    @Autowired MockMvc mvc;

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
    void malformedBodyIsIgnoredNotAnError() throws Exception {
        mvc.perform(post("/api/events").contentType(MediaType.TEXT_PLAIN).content("not json{{"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0));
    }
}
