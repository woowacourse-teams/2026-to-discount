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
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SurveyAdminControllerTest {

    private static final String PATH = "/api/admin/survey-settings";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final SurveySettings.Values ENV = new SurveySettings.Values(false, 7, 5, 0, 0, null, null);

    @TempDir Path tmp;
    MockMvc mvc;

    private MockMvc mvcWith(SurveyEligibility.Audience audience, GifticonStore store) {
        var survey = mock(SurveyService.class);
        when(survey.audience(anyInt(), anyInt(), anyInt(), anyInt())).thenReturn(audience);
        var controller = new SurveyAdminController(new SurveySettings(tmp.resolve("survey-settings.json"), ENV),
                survey, store);
        return MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @BeforeEach
    void setUp() throws Exception {
        Path yml = tmp.resolve("gifticons.yml");
        Files.writeString(yml, "gifticons:\n  - code: \"A\"\n  - code: \"B\"\n    issuedTo: v_1\n",
                StandardCharsets.UTF_8);
        mvc = mvcWith(new SurveyEligibility.Audience(true, 97, 5210, 41, 6), new GifticonStore(yml.toString()));
    }

    private static MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder b) {
        return b.header("X-Ops-Authenticated", "1").header("X-Ops-User", "kim");
    }

    private static String body(String open, String minDays, String version) {
        return "{\"open\":" + open + ",\"minDays\":" + minDays
                + ",\"minConversions\":5,\"recentDays\":14,\"minSpanDays\":30,\"version\":\"" + version + "\"}";
    }

    private static void keys(String prefix, JsonNode n, Set<String> out) {
        if (!n.isObject()) return;
        n.properties().forEach(e -> {
            out.add(prefix + e.getKey());
            keys(prefix + e.getKey() + ".", e.getValue(), out);
        });
    }

    /** 콘솔과 맞대는 자리. 키 집합이 계약 파일과 같아야 한다. 콘솔 테스트가 같은 파일을 쓴다. */
    @Test
    void getResponseHasTheContractKeys() throws Exception {
        String actual = mvc.perform(auth(get(PATH))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode contract = JSON.readTree(Files.readString(
                Path.of("src/test/resources/contracts/survey-settings-response.json")));

        Set<String> want = new TreeSet<>(), got = new TreeSet<>();
        keys("", contract, want);
        keys("", JSON.readTree(actual), got);
        assertEquals(want, got);

        JsonNode n = JSON.readTree(actual);
        assertEquals("env", n.get("source").asString());
        assertEquals("ok", n.get("stock").get("state").asString());
        assertEquals(1, n.get("stock").get("remaining").asInt());
        assertEquals(2, n.get("stock").get("total").asInt());
        assertEquals(97, n.get("audience").get("eligible").asInt());
    }

    @Test
    void rejectsWithoutOpsMarker() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isForbidden());
        mvc.perform(get(PATH + "/preview")).andExpect(status().isForbidden());
        mvc.perform(put(PATH).header("X-Ops-User", "kim").contentType(MediaType.APPLICATION_JSON)
                .content(body("true", "12", "env"))).andExpect(status().isForbidden());
    }

    @Test
    void rejectsNonLoopbackPeerEvenWithMarker() throws Exception {
        mvc.perform(auth(get(PATH)).with(r -> { r.setRemoteAddr("203.0.113.5"); return r; }))
                .andExpect(status().isForbidden());
    }

    @Test
    void putWithoutOpsUserIsRejected() throws Exception {
        mvc.perform(put(PATH).header("X-Ops-Authenticated", "1").contentType(MediaType.APPLICATION_JSON)
                .content(body("true", "12", "env"))).andExpect(status().isBadRequest());
        assertFalse(Files.exists(tmp.resolve("survey-settings.json")));
    }

    @Test
    void putValidates() throws Exception {
        // 칸 빠짐
        mvc.perform(auth(put(PATH)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"open\":true,\"minDays\":12,\"version\":\"env\"}"))
                .andExpect(status().isBadRequest());
        // 범위 밖은 400, 칸 이름이 사유에 든다
        String res = mvc.perform(auth(put(PATH)).contentType(MediaType.APPLICATION_JSON)
                        .content(body("true", "0", "env")))
                .andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertTrue(res.contains("minDays"), res);
        // 옛 version
        mvc.perform(auth(put(PATH)).contentType(MediaType.APPLICATION_JSON)
                .content(body("true", "12", "123-45"))).andExpect(status().isConflict());
        assertFalse(Files.exists(tmp.resolve("survey-settings.json")));
    }

    @Test
    void putSavesFileAndLogAndReturnsNewVersion() throws Exception {
        String res = mvc.perform(auth(put(PATH)).contentType(MediaType.APPLICATION_JSON)
                        .content(body("true", "12", "env")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("file"))
                .andExpect(jsonPath("$.settings.open").value(true))
                .andExpect(jsonPath("$.settings.updatedBy").value("kim"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String version = JSON.readTree(res).get("version").asString();
        assertNotEquals("env", version);

        var lines = Files.readAllLines(tmp.resolve("survey-settings.log.jsonl"));
        assertEquals(1, lines.size());
        JsonNode line = JSON.readTree(lines.get(0));
        assertEquals("kim", line.get("by").asString());
        assertEquals("env", line.get("beforeSource").asString());
        assertFalse(line.get("before").get("open").asBoolean());
        assertTrue(line.get("after").get("open").asBoolean());

        // 받은 version으로 다시 저장은 되고, 옛 version("env")은 이제 409
        mvc.perform(auth(put(PATH)).contentType(MediaType.APPLICATION_JSON)
                .content(body("false", "12", version))).andExpect(status().isOk());
        mvc.perform(auth(put(PATH)).contentType(MediaType.APPLICATION_JSON)
                .content(body("true", "12", "env"))).andExpect(status().isConflict());
        assertEquals(2, Files.readAllLines(tmp.resolve("survey-settings.log.jsonl")).size());
    }

    @Test
    void previewCountsWithoutSavingAndValidatesParams() throws Exception {
        mvc.perform(auth(get(PATH + "/preview?minDays=12&minConversions=5&recentDays=14&minSpanDays=30")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eligible").value(97))
                .andExpect(jsonPath("$.visitors").value(5210))
                .andExpect(jsonPath("$.excluded.answered").value(41))
                .andExpect(jsonPath("$.excluded.dev").value(6))
                .andExpect(jsonPath("$.ledger").value("ok"));
        assertFalse(Files.exists(tmp.resolve("survey-settings.json")));

        mvc.perform(auth(get(PATH + "/preview?minDays=12"))).andExpect(status().isBadRequest());
        mvc.perform(auth(get(PATH + "/preview?minDays=999&minConversions=5&recentDays=14&minSpanDays=30")))
                .andExpect(status().isBadRequest());
    }

    /** 원장을 못 읽으면 대상 0명이 아니라 "셀 수 없음". 기프티콘 파일이 없으면 0이 아니라 missing. */
    @Test
    void previewSaysUnreadableInsteadOfZero() throws Exception {
        MockMvc m = mvcWith(new SurveyEligibility.Audience(false, null, null, 0, 0),
                new GifticonStore(tmp.resolve("none.yml").toString()));
        m.perform(auth(get(PATH + "/preview?minDays=7&minConversions=5&recentDays=0&minSpanDays=0")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eligible").doesNotExist())
                .andExpect(jsonPath("$.ledger").value("unreadable"));
        m.perform(auth(get(PATH))).andExpect(jsonPath("$.stock.state").value("missing"));
    }
}
