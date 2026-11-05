package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"discount.pmf.enabled=true", "discount.event-log-path=build/tmp/pmf-http-events.jsonl", "analytics.snapshot.enabled=false"})
class PmfSurveyControllerTest {
    @Autowired MockMvc mvc;
    @Autowired EventLog events;
    @Autowired ObjectMapper mapper;
    private String seed() {
        String v = "v_" + UUID.randomUUID();
        events.append(List.of(event(v, "old", "offer_link_click", Instant.now().minusSeconds(3600)), event(v, "new", "page_view", Instant.now().minusSeconds(10))));
        return v;
    }
    private VisitEvent event(String v, String s, String type, Instant at) {
        return new VisitEvent(at.toString(), type, v, s, null, null, null, null, null, null, Map.of(), null, null, null, null, UUID.randomUUID().toString(), null);
    }
    private String body(String v) { return mapper.writeValueAsString(Map.of("visitorId", v, "sessionId", "new", "surveyId", PmfSurveyService.ID, "choice", "very_disappointed")); }
    @Test void usesExistingEndpointAndStoresUnrewardedAnswerOnce() throws Exception {
        String v = seed();
        mvc.perform(get("/api/survey").param("surveyId", PmfSurveyService.ID).param("visitorId", v).param("sessionId", "new"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.eligible").value(true));
        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON).content(body(v)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true)).andExpect(jsonPath("$.code").doesNotExist());
        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON).content(body(v)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.state").value("answered"));
    }
    @Test void permanentCloseStopsFurtherExposure() throws Exception {
        String v = seed();
        mvc.perform(post("/api/survey/dismiss").contentType(MediaType.APPLICATION_JSON).content(body(v))).andExpect(status().isOk());
        mvc.perform(get("/api/survey").param("surveyId", PmfSurveyService.ID).param("visitorId", v).param("sessionId", "new"))
                .andExpect(jsonPath("$.eligible").value(false)).andExpect(jsonPath("$.state").value("dismissed"));
    }
    @Test void localDemoIsNotRegisteredInNormalProfile() throws Exception {
        mvc.perform(post("/api/survey/demo").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
    }
    @Test void unknownCampaignAndMalformedChoicesAreRejected() throws Exception {
        mvc.perform(get("/api/survey").param("surveyId", "unknown").param("visitorId", "v").param("sessionId", "s")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/survey").contentType(MediaType.APPLICATION_JSON).content(body(seed()).replace("very_disappointed", "made_up"))).andExpect(status().isBadRequest());
    }
}
