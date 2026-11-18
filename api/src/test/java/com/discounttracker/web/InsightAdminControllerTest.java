package com.discounttracker.web;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class InsightAdminControllerTest {

    @TempDir Path dir;

    /** behavior-path를 비우고 원장 옆 behavior.json을 쓰는 서버 기본 설정과 같은 모양. */
    private MockMvc mvc(String content) throws Exception {
        if (content != null) Files.writeString(dir.resolve("behavior.json"), content);
        return MockMvcBuilders.standaloneSetup(new InsightAdminController("", dir.resolve("events.jsonl").toString()))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor loopback() {
        return r -> { r.setRemoteAddr("127.0.0.1"); return r; };
    }

    @Test
    void withoutOpsMarkerIs403() throws Exception {
        mvc("{\"minN\":30}").perform(get("/api/admin/insight/behavior")).andExpect(status().isForbidden());
    }

    @Test
    void forgedMarkerFromExternalPeerIs403() throws Exception {
        mvc("{\"minN\":30}").perform(get("/api/admin/insight/behavior").header("X-Ops-Authenticated", "1")
                .with(r -> { r.setRemoteAddr("203.0.113.5"); return r; })).andExpect(status().isForbidden());
    }

    @Test
    void authenticatedGetsFileBesideEventLog() throws Exception {
        mvc("{\"minN\":30,\"platforms\":[\"baemin\"]}").perform(get("/api/admin/insight/behavior")
                .header("X-Ops-Authenticated", "1").with(loopback()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.minN").value(30));
    }

    @Test
    void emptyFileIsUnavailable() throws Exception {
        mvc("").perform(get("/api/admin/insight/behavior").header("X-Ops-Authenticated", "1").with(loopback()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
    }

    @Test
    void missingFileIsUnavailableNotError() throws Exception {
        mvc(null).perform(get("/api/admin/insight/behavior").header("X-Ops-Authenticated", "1").with(loopback()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
    }
}
