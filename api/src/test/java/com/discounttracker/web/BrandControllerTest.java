package com.discounttracker.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 실제 리소스(src/main/resources의 export.json, brands.yml)를 그대로 태우는
 * 통합 테스트. 최소 한 건 이상 있다고 가정한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class BrandControllerTest {

    @Autowired MockMvc mvc;

    @Test
    void getBrandsReturnsList() throws Exception {
        mvc.perform(get("/api/brands"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$").isArray())
           .andExpect(jsonPath("$[0].name").exists())
           .andExpect(jsonPath("$[0].offers").isArray());
    }

    /**
     * 프론트가 의존하는 응답 스키마를 못박는다. 도메인 구조를 바꿔도 이
     * 모양이 유지돼야 하고, 특히 내부용 필드(brand 중첩 객체, maxHeldAmount)가
     * 새어 나가면 안 된다.
     */
    @Test
    void brandResponseKeepsFlatContract() throws Exception {
        mvc.perform(get("/api/brands"))
           .andExpect(jsonPath("$[0].name").isString())
           .andExpect(jsonPath("$[0].maxConfirmedAmount").exists())
           .andExpect(jsonPath("$[0].offers[0].platform").isString())
           .andExpect(jsonPath("$[0].offers[0].status").isString())
           // 상세 패널이 읽는 키는 값이 비어 있어도 자리는 있어야 한다
           .andExpect(jsonPath("$[0].offers[0].capturedAt").exists())
           .andExpect(jsonPath("$[0].offers[0]", org.hamcrest.Matchers.hasKey("minOrderAmount")))
           .andExpect(jsonPath("$[0].offers[0]", org.hamcrest.Matchers.hasKey("tiers")))
           .andExpect(jsonPath("$[0].offers[0]", org.hamcrest.Matchers.hasKey("conditions")))
           // 내부 표현이 응답에 새면 안 된다
           .andExpect(jsonPath("$[0].brand").doesNotExist())
           .andExpect(jsonPath("$[0].maxHeldAmount").doesNotExist());
    }

    /** 카테고리·바로가기가 프론트 하드코딩에서 API로 넘어왔는지 확인. */
    @Test
    void brandResponseCarriesCatalogFields() throws Exception {
        mvc.perform(get("/api/brands"))
           .andExpect(jsonPath("$[?(@.category == 'chicken')]").isNotEmpty())
           .andExpect(jsonPath("$[?(@.link =~ /.*ddangyo.*/)]").isNotEmpty());
    }

    @Test
    void reloadReturnsCount() throws Exception {
        mvc.perform(post("/api/reload"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.reloaded").isNumber());
    }
}
