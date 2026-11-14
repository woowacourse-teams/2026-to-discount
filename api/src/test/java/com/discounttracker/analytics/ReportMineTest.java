package com.discounttracker.analytics;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ReportMineTest {

    private static final String A = "v_aaaaaaaaaaaaaaaa";
    private static final String B = "v_bbbbbbbbbbbbbbbb";
    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir Path tmp;
    Path reports;
    SlackReporter slack;
    MockMvc mvc;

    @BeforeEach
    void setUp() {
        reports = tmp.resolve("reports.jsonl");
        slack = mock(SlackReporter.class);
        when(slack.send(anyString())).thenReturn(true);
        var controller = new ReportController(slack, new ClientFingerprint(), JSON, new ReportLedger(JSON, reports));
        mvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    private static MockHttpServletRequestBuilder send(String ip, String visitor, String text) {
        return post("/api/reports").header("X-Forwarded-For", ip).contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"amount\",\"platform\":\"baemin\",\"text\":\"" + text
                        + "\",\"brand\":\"BBQ\",\"url\":\"https://x/?q=secret\",\"filters\":\"f1\",\"visitorId\":\""
                        + visitor + "\"}");
    }

    private static MockHttpServletRequestBuilder mine(String ip, String visitor) {
        MockHttpServletRequestBuilder b = get("/api/reports/mine").header("X-Forwarded-For", ip);
        return visitor == null ? b : b.header("X-Visitor-Id", visitor);
    }

    private String body(MockHttpServletRequestBuilder b) throws Exception {
        return mvc.perform(b).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    @Test
    void sentReportShowsUp() throws Exception {
        mvc.perform(send("10.1.0.1", A, "하나")).andExpect(status().isOk());
        mvc.perform(mine("10.1.0.1", A)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.reports.length()").value(1))
                .andExpect(jsonPath("$.reports[0].type").value("amount"))
                .andExpect(jsonPath("$.reports[0].brand").value("BBQ"))
                .andExpect(jsonPath("$.reports[0].status").value("received"));
    }

    @Test
    void othersAreNotListed() throws Exception {
        mvc.perform(send("10.1.0.2", A, "에이")).andExpect(status().isOk());
        mvc.perform(send("10.1.0.3", B, "비")).andExpect(status().isOk());
        // 양성 신호: B의 목록에는 B의 번호가 있다.
        String idB = JSON.readTree(body(mine("10.1.0.3", B))).get("reports").get(0).get("id").asString();
        String listA = body(mine("10.1.0.2", A));
        assertFalse(listA.contains(idB));
        assertEquals(1, JSON.readTree(listA).get("reports").size());
    }

    @Test
    void badVisitorIdIs400WithoutReadingLedger() throws Exception {
        Files.createDirectory(reports); // 읽으면 500이 난다
        mvc.perform(mine("10.1.0.4", null)).andExpect(status().isBadRequest());
        for (String v : new String[]{"-", "v_123", "v_" + "A".repeat(16), "v_" + "a".repeat(17)}) {
            mvc.perform(mine("10.1.0.4", v)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.ok").value(false));
        }
    }

    @Test
    void responseCarriesNoPersonalData() throws Exception {
        mvc.perform(send("10.1.0.5", A, "010-1234-5678")).andExpect(status().isOk());
        String out = body(mine("10.1.0.5", A));
        JsonNode row = JSON.readTree(out).get("reports").get(0);
        Set<String> keys = new TreeSet<>();
        row.propertyNames().forEach(keys::add);
        assertEquals(new TreeSet<>(Set.of("id", "at", "type", "brand", "status")), keys);
        for (String s : new String[]{"010-1234-5678", "secret", "visitorId", "client", "platform"}) {
            assertFalse(out.contains(s), s);
        }
    }

    @Test
    void slackLineHasTheReportId() throws Exception {
        mvc.perform(send("10.1.0.6", A, "슬랙")).andExpect(status().isOk());
        ArgumentCaptor<String> msg = ArgumentCaptor.forClass(String.class);
        verify(slack).send(msg.capture());
        String id = JSON.readTree(body(mine("10.1.0.6", A))).get("reports").get(0).get("id").asString();
        assertTrue(msg.getValue().endsWith("\n번호: " + id));
    }

    @Test
    void slackLineAbsentWhenNotSaved() throws Exception {
        Files.createDirectory(reports);
        mvc.perform(send("10.1.0.7", A, "실패")).andExpect(status().isInternalServerError());
        ArgumentCaptor<String> msg = ArgumentCaptor.forClass(String.class);
        verify(slack).send(msg.capture());
        assertFalse(msg.getValue().contains("번호:"));
    }

    @Test
    void readLimitIsSeparateFromWriteLimit() throws Exception {
        for (int i = 0; i < 10; i++) mvc.perform(mine("10.1.0.8", A)).andExpect(status().isOk());
        mvc.perform(mine("10.1.0.8", A)).andExpect(status().isTooManyRequests());
        mvc.perform(send("10.1.0.8", A, "쓰기")).andExpect(status().isOk());
        mvc.perform(mine("10.1.0.9", A)).andExpect(status().isOk());
    }

    @Test
    void unreadableIs500AndMissingIsEmpty() throws Exception {
        mvc.perform(mine("10.1.0.10", A)).andExpect(status().isOk())
                .andExpect(jsonPath("$.reports.length()").value(0));
        Files.createDirectory(reports);
        mvc.perform(mine("10.1.0.10", A)).andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.ok").value(false));
    }
}
