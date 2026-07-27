package com.discounttracker.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class BrandControllerTest {

    @Autowired MockMvc mvc;

    // 이 테스트는 src/main/resources/data/export.json(실제 복사본)과
    // brand-aliases.yml을 그대로 쓴다. 최소 한 건 이상 있다고 가정한다.

    @Test
    void getBrandsReturnsList() throws Exception {
        mvc.perform(get("/api/brands"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$").isArray())
           .andExpect(jsonPath("$[0].name").exists())
           .andExpect(jsonPath("$[0].offers").isArray());
    }

    @Test
    void reloadReturnsCount() throws Exception {
        mvc.perform(post("/api/reload"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.reloaded").isNumber());
    }
}
