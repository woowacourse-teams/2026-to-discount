package com.discounttracker.web;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class InsightAdminControllerTest {

    private MockMvc mvc(Resource r) {
        return MockMvcBuilders.standaloneSetup(new InsightAdminController(r))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    private static Resource json(String s) {
        return new ByteArrayResource(s.getBytes(StandardCharsets.UTF_8)) {
            @Override public long lastModified() { return 1L; }
        };
    }

    @Test
    void withoutOpsMarkerIs403() throws Exception {
        mvc(json("{\"minN\":30}")).perform(get("/api/admin/insight/behavior")).andExpect(status().isForbidden());
    }

    @Test
    void forgedMarkerFromExternalPeerIs403() throws Exception {
        mvc(json("{\"minN\":30}")).perform(get("/api/admin/insight/behavior").header("X-Ops-Authenticated", "1")
                .with(r -> { r.setRemoteAddr("203.0.113.5"); return r; })).andExpect(status().isForbidden());
    }

    @Test
    void authenticatedGetsFileAsIs() throws Exception {
        mvc(json("{\"minN\":30,\"platforms\":[\"baemin\"]}")).perform(get("/api/admin/insight/behavior")
                .header("X-Ops-Authenticated", "1").with(r -> { r.setRemoteAddr("127.0.0.1"); return r; }))
                .andExpect(status().isOk()).andExpect(jsonPath("$.minN").value(30));
    }

    @Test
    void missingFileIsUnavailableNotError() throws Exception {
        Resource none = new ByteArrayResource(new byte[0]) {
            @Override public boolean exists() { return false; }
        };
        mvc(none).perform(get("/api/admin/insight/behavior").header("X-Ops-Authenticated", "1")
                .with(r -> { r.setRemoteAddr("127.0.0.1"); return r; }))
                .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
    }
}
