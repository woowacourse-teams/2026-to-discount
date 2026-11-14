package com.discounttracker.web;

import com.discounttracker.analytics.GifticonStore;
import com.discounttracker.analytics.SurveyAdminController;
import com.discounttracker.analytics.SurveyService;
import com.discounttracker.analytics.SurveySettings;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SurveyAdminController.class)
@Import(WebConfig.class)
class SurveyAdminCorsTest {
    private static final String PATH = "/api/admin/survey-settings";
    @Autowired MockMvc mvc;
    @MockitoBean SurveySettings settings;
    @MockitoBean SurveyService survey;
    @MockitoBean GifticonStore gifticons;

    @Test
    void allowsPutPreflightFromOpsOrigin() throws Exception {
        mvc.perform(options(PATH).header("Origin", "https://bebeggars.duckdns.org")
                .header("Access-Control-Request-Method", "PUT")
                .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://bebeggars.duckdns.org"));
    }

    @Test
    void rejectsPutPreflightFromPublicWebOrigin() throws Exception {
        mvc.perform(options(PATH).header("Origin", "https://beggars-five.vercel.app")
                .header("Access-Control-Request-Method", "PUT"))
                .andExpect(status().isForbidden());
    }
}
