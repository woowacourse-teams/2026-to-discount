package com.discounttracker.sharing;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import tools.jackson.databind.ObjectMapper;
import java.util.UUID;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"discount.share-links-path=build/tmp/test-share-links.jsonl", "discount.event-log-path=build/tmp/short-link-events.jsonl"})
class ShareLinkControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Test void createsAndLooksUpWithoutLosingAttribution() throws Exception {
        String id = UUID.randomUUID().toString().replace("-", "");
        String body = mapper.writeValueAsString(new ShareLinkStore.Target(id, "도미노피자", "v1_" + "b".repeat(64)));
        String response = mvc.perform(post("/api/share-links").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsString();
        String code = mapper.readTree(response).path("code").asString();
        mvc.perform(get("/api/share-links/" + code)).andExpect(status().isOk())
                .andExpect(jsonPath("$.shareId").value(id)).andExpect(jsonPath("$.brand").value("도미노피자"))
                .andExpect(jsonPath("$.offerKey").value("v1_" + "b".repeat(64)));
    }
    @Test void invalidTargetsAndUnknownCodesAreRejected() throws Exception {
        mvc.perform(post("/api/share-links").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/share-links/aaaaaaaaaaaaaaaa")).andExpect(status().isNotFound());
    }
    @Test void localCorsPreflightAllowsCreation() throws Exception {
        mvc.perform(options("/api/share-links").header("Origin", "http://localhost:5173")
                .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
    }
}
