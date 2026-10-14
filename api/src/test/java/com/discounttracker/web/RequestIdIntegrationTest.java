package com.discounttracker.web;

import com.discounttracker.comparison.BrandComparisonService;
import com.discounttracker.offer.OfferRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class RequestIdIntegrationTest {
    @Autowired MockMvc mvc;
    @MockitoBean BrandComparisonService service;
    @MockitoBean OfferRepository offers;

    @Test
    void exceptionLogAndCompletionLogCarryResponseId(CapturedOutput output) throws Exception {
        String id = "b".repeat(32);
        given(service.compare()).willThrow(new IllegalStateException("test failure"));
        mvc.perform(get("/api/brands").header("X-Request-ID", id))
                .andExpect(status().isInternalServerError())
                .andExpect(header().string("X-Request-ID", id))
                .andExpect(jsonPath("$.error").value("internal_error"));
        var lines = output.getAll().lines().toList();
        assertTrue(lines.stream().anyMatch(line -> line.contains(" ERROR ")
                && line.contains("[request_id=" + id + "]") && line.contains("처리되지 않은 예외")));
        assertTrue(lines.stream().anyMatch(line -> line.contains("[request_id=" + id + "]")
                && line.contains("HTTP 요청 완료: method=GET path=/api/brands status=500")));
    }

    @Test
    void normalResponseExposesIdToBrowserAndOmitsQueryFromCompletion(CapturedOutput output) throws Exception {
        String id = "c".repeat(32);
        mvc.perform(get("/api/brands?secret=do-not-log")
                .header("X-Request-ID", id).header("Origin", "http://localhost:5173"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Request-ID", id))
                .andExpect(header().string("Access-Control-Expose-Headers", "X-Request-ID"));
        assertTrue(output.getAll().contains("[request_id=" + id + "]"));
        assertTrue(output.getAll().contains("method=GET path=/api/brands status=200"));
        assertFalse(output.getAll().contains("do-not-log"));
    }

    @Test
    void notFoundAndMethodNotAllowedKeepTheirStatusesAndId() throws Exception {
        var missing = mvc.perform(get("/missing")).andExpect(status().isNotFound()).andReturn();
        assertTrue(missing.getResponse().getHeader("X-Request-ID").matches("[0-9a-f]{32}"));
        var wrongMethod = mvc.perform(post("/api/brands"))
                .andExpect(status().isMethodNotAllowed()).andReturn();
        assertTrue(wrongMethod.getResponse().getHeader("X-Request-ID").matches("[0-9a-f]{32}"));
    }
}
