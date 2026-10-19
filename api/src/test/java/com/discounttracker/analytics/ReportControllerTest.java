package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import org.springframework.test.context.TestPropertySource;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "discount.report.path=build/tmp/reports-test.jsonl")
class ReportControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ReportController controller;
    @MockitoBean SlackReporter slack;

    private static MockHttpServletRequestBuilder report(String ip, String json) {
        return post("/api/reports").header("X-Forwarded-For", ip)
                .contentType(MediaType.APPLICATION_JSON).content(json);
    }

    @Test
    void sendsToSlackWithContext() throws Exception {
        when(slack.send(anyString())).thenReturn(true);
        mvc.perform(report("10.0.0.1", """
                {"text":"BBQ 쿠폰 끝남","brand":"BBQ","url":"https://x/?q=1","filters":"배민"}"""))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        verify(slack).send(contains("BBQ 쿠폰 끝남"));
        verify(slack).send(contains("필터: 배민"));
    }

    @Test
    void slackFailureStillSavesAndSucceeds() throws Exception {
        when(slack.send(anyString())).thenReturn(false);
        mvc.perform(report("10.0.0.2", "{\"text\":\"슬랙실패-저장확인\",\"brand\":\"BHC\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        String saved = Files.readString(Path.of("build/tmp/reports-test.jsonl"), StandardCharsets.UTF_8);
        assertTrue(saved.lines().anyMatch(l -> l.contains("\"text\":\"슬랙실패-저장확인\"") && l.contains("\"brand\":\"BHC\"")));
    }

    @Test
    void rejectsBlankAndTooLong() throws Exception {
        mvc.perform(report("10.0.0.3", "{\"text\":\"   \"}")).andExpect(status().isBadRequest());
        mvc.perform(report("10.0.0.3", "{}")).andExpect(status().isBadRequest());
        mvc.perform(report("10.0.0.3", "{\"text\":\"" + "가".repeat(501) + "\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(report("10.0.0.3", "{\"text\":\"" + "가".repeat(500) + "\"}"))
                .andExpect(status().isOk());
        verify(slack, never()).send(contains("   "));
    }

    @Test
    void limitsPerMinute() throws Exception {
        for (int i = 0; i < 3; i++) {
            mvc.perform(report("10.0.0.4", "{\"text\":\"a\"}")).andExpect(status().isOk());
        }
        mvc.perform(report("10.0.0.4", "{\"text\":\"a\"}")).andExpect(status().isTooManyRequests());
        mvc.perform(report("10.0.0.5", "{\"text\":\"a\"}")).andExpect(status().isOk());
    }

    @Test
    void limitsPerDay() {
        Instant t = Instant.parse("2026-10-19T00:00:00Z");
        for (int i = 0; i < 20; i++) assertTrue(controller.allow("day", t.plusSeconds(60L * i)));
        assertFalse(controller.allow("day", t.plusSeconds(60L * 30)));
        assertTrue(controller.allow("day", t.plusSeconds(86_400 + 60)));
    }

    @Test
    void escapesSlackMarkup() {
        assertEquals("&lt;!channel&gt; &amp;", SlackReporter.escape("<!channel> &"));
    }
}
