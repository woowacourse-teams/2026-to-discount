package com.discounttracker.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class InsightControllerTest {

    @Autowired MockMvc mvc;

    @Test
    void insightReturnsContractTopLevelKeys() throws Exception {
        ResultActions r = mvc.perform(get("/api/insight")).andExpect(status().isOk());
        for (String key : new String[]{"generatedAt", "range", "platforms", "today", "trend", "heatmap",
                "compare", "offers", "changes", "coverage"}) {
            r.andExpect(jsonPath("$." + key).exists());
        }
    }
}
