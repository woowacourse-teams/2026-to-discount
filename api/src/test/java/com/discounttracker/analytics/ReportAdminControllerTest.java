package com.discounttracker.analytics;

import com.discounttracker.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
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
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ReportAdminControllerTest {

    private static final String PATH = "/api/admin/reports";
    private static final String A = "v_aaaaaaaaaaaaaaaa";
    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir Path tmp;
    Path statusFile;
    MockMvc mvc;
    String id;

    @BeforeEach
    void setUp() throws Exception {
        Path reports = tmp.resolve("reports.jsonl");
        Files.copy(Path.of("src/test/resources/reports/legacy-reports.jsonl"), reports);
        statusFile = tmp.resolve("report-status.jsonl");
        ReportLedger ledger = new ReportLedger(JSON, reports);
        id = ledger.mine(A, 50).get(0).id();
        var reportController = new ReportController(mock(SlackReporter.class), new ClientFingerprint(), JSON, ledger);
        mvc = MockMvcBuilders.standaloneSetup(new ReportAdminController(ledger), reportController)
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    private static MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder b) {
        return b.header("X-Ops-Authenticated", "1").header("X-Ops-User", "kim");
    }

    private static MockHttpServletRequestBuilder setStatus(String path, String json) {
        return auth(put(path).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private long statusLines() throws Exception {
        return Files.exists(statusFile) ? Files.readAllLines(statusFile, StandardCharsets.UTF_8).size() : 0;
    }

    private static MockHttpServletRequestBuilder mine() {
        return get("/api/reports/mine").header("X-Visitor-Id", A).header("X-Forwarded-For", "10.2.0.1");
    }

    @Test
    void changingStatusChangesMine() throws Exception {
        mvc.perform(setStatus(PATH + "/" + id, "{\"status\":\"reviewing\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("reviewing"));
        mvc.perform(mine()).andExpect(jsonPath("$.reports[0].status").value("reviewing"));
        mvc.perform(setStatus(PATH + "/" + id, "{\"status\":\"applied\"}")).andExpect(status().isOk());
        mvc.perform(mine()).andExpect(jsonPath("$.reports[0].status").value("applied"));
    }

    @Test
    void requiresAuth() throws Exception {
        String b = "{\"status\":\"applied\"}";
        mvc.perform(get(PATH)).andExpect(status().isForbidden());
        mvc.perform(put(PATH + "/" + id).header("X-Ops-User", "kim").contentType(MediaType.APPLICATION_JSON).content(b))
                .andExpect(status().isForbidden());
        mvc.perform(auth(get(PATH)).with(r -> { r.setRemoteAddr("203.0.113.5"); return r; }))
                .andExpect(status().isForbidden());
        mvc.perform(setStatus(PATH + "/" + id, b).with(r -> { r.setRemoteAddr("203.0.113.5"); return r; }))
                .andExpect(status().isForbidden());
        assertEquals(0, statusLines());
    }

    @Test
    void validatesInput() throws Exception {
        mvc.perform(put(PATH + "/" + id).header("X-Ops-Authenticated", "1").contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"applied\"}")).andExpect(status().isBadRequest());
        mvc.perform(setStatus(PATH + "/" + id, "{\"status\":\"done\"}")).andExpect(status().isBadRequest());
        mvc.perform(setStatus(PATH + "/" + id, "{\"status\":3}")).andExpect(status().isBadRequest());
        mvc.perform(auth(put(PATH + "/" + id))).andExpect(status().isBadRequest());
        mvc.perform(setStatus(PATH + "/r_xyz", "{\"status\":\"applied\"}")).andExpect(status().isBadRequest());
        mvc.perform(setStatus(PATH + "/r_0000000000000000", "{\"status\":\"applied\"}"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.ok").value(false));
        assertEquals(0, statusLines());
    }

    @Test
    void listHasTheAdminKeys() throws Exception {
        String out = mvc.perform(auth(get(PATH))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = JSON.readTree(out).get("reports");
        assertEquals(3, rows.size()); // visitorId "-" 행도 나온다
        Set<String> keys = new TreeSet<>();
        rows.get(0).propertyNames().forEach(keys::add);
        assertEquals(new TreeSet<>(Set.of("id", "at", "type", "platform", "brand", "text", "status")), keys);
        assertFalse(out.contains("visitorId") || out.contains("client"));
    }
}
