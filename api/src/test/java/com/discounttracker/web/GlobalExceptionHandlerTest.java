package com.discounttracker.web;

import com.discounttracker.comparison.BrandComparisonService;
import com.discounttracker.offer.OfferRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 예외가 상태코드에 맞게 나가는지, 그리고 진짜 장애만 500이 되는지 고정한다.
 *
 * <p>핸들러가 하는 일의 본질은 로그를 남기는 것이라 눈에 안 보인다 —
 * 테스트가 없으면 다음 리팩터링에서 조용히 사라져도 아무도 모른다. 특히
 * 아래 404 테스트는 이 핸들러가 처음 배포됐을 때 실제로 깨졌던 부분이다
 * (봇 스캔 요청까지 500으로 바꿔 로그를 채웠다, 2026-08-07).
 */
@SpringBootTest
@AutoConfigureMockMvc
class GlobalExceptionHandlerTest {

    @Autowired MockMvc mvc;
    @MockBean BrandComparisonService service;
    @MockBean OfferRepository offers;

    @Test
    void unhandledExceptionBecomes500WithoutLeakingTheMessage() throws Exception {
        given(service.compare()).willThrow(new IllegalStateException("export.json 읽기 실패: /home/ubuntu/..."));

        mvc.perform(get("/api/brands"))
           .andExpect(status().isInternalServerError())
           .andExpect(jsonPath("$.error").value("internal_error"))
           // 내부 경로·파일명이 응답으로 새면 안 된다
           .andExpect(jsonPath("$.message").doesNotExist());
    }

    /** 봇이 긁는 경로는 404로 나가야 한다 — 500으로 바꾸면 로그가 스캔으로 찬다. */
    @Test
    void missingPathStays404() throws Exception {
        mvc.perform(get("/.env")).andExpect(status().isNotFound());
        mvc.perform(get("/.git/config")).andExpect(status().isNotFound());
    }

    /** 없는 경로 응답에 요청 정보를 되돌려주지 않는다. */
    @Test
    void notFoundBodyIsEmpty() throws Exception {
        mvc.perform(get("/.env"))
           .andExpect(status().isNotFound())
           .andExpect(jsonPath("$.detail").doesNotExist())
           .andExpect(jsonPath("$.instance").doesNotExist());
    }

    /** 메서드가 틀린 요청은 405다 — 이것도 우리 장애가 아니다. */
    @Test
    void wrongMethodStays405() throws Exception {
        mvc.perform(post("/api/brands")).andExpect(status().isMethodNotAllowed());
    }
}
