package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;

import static org.junit.jupiter.api.Assertions.*;

class SurveySettingsTest {

    @TempDir Path tmp;

    private static final SurveySettings.Values ENV = new SurveySettings.Values(false, 7, 5, 0, 0, null, null);
    private static final String GOOD = """
            {"open":true,"minDays":12,"minConversions":5,"recentDays":14,"minSpanDays":30,
             "updatedAt":"2026-11-04T15:20:00+09:00","updatedBy":"kim"}""";

    private Path file() { return tmp.resolve("survey-settings.json"); }

    private SurveySettings settings() { return new SurveySettings(file(), ENV); }

    private void write(String json) throws Exception {
        Files.writeString(file(), json, StandardCharsets.UTF_8);
    }

    @Test
    void missingFileUsesEnvDefaults() {
        var s = settings().current();
        assertEquals("env", s.source());
        assertEquals(ENV, s.values());
        assertEquals("env", s.version());
        assertNull(s.problem());
    }

    @Test
    void validFileWins() throws Exception {
        write(GOOD);
        var s = settings().current();
        assertEquals("file", s.source());
        assertTrue(s.values().open());
        assertEquals(12, s.values().minDays());
        assertEquals(14, s.values().recentDays());
        assertEquals("kim", s.values().updatedBy());
    }

    /** 깨진 파일은 닫힘이다. 파일 없음(env)과 구분되고, 문턱은 환경변수. 사유에 칸 이름이 든다. */
    @Test
    void brokenFilesCloseTheSurveyAndSayWhy() throws Exception {
        String[][] cases = {
                {"{not json", "JSON"},
                {"{\"open\":true,\"minDays\":12,\"minConversions\":5,\"recentDays\":14}", "minSpanDays"},
                {"{\"open\":true,\"minDays\":0,\"minConversions\":5,\"recentDays\":14,\"minSpanDays\":30}", "minDays"},
                {"{\"open\":true,\"minDays\":\"12\",\"minConversions\":5,\"recentDays\":14,\"minSpanDays\":30}", "minDays"},
                {"{\"open\":\"true\",\"minDays\":12,\"minConversions\":5,\"recentDays\":14,\"minSpanDays\":30}", "open"},
                {"{\"open\":true,\"minDays\":12,\"minConversions\":5,\"recentDays\":14,\"minSpanDays\":3.5}", "minSpanDays"},
        };
        for (String[] c : cases) {
            write(c[0]);
            var s = new SurveySettings(file(), new SurveySettings.Values(true, 9, 5, 0, 0, null, null)).current();
            assertEquals("broken", s.source(), c[0]);
            assertFalse(s.values().open(), c[0]);
            assertEquals(9, s.values().minDays(), "문턱은 환경변수");
            assertTrue(s.problem().contains(c[1]), s.problem());
        }
    }

    /** 재시작 없이: 파일 내용과 수정 시각이 바뀌면 다음 current()가 새 값. */
    @Test
    void picksUpFileChangesWithoutRestart() throws Exception {
        write(GOOD);
        var s = settings();
        assertTrue(s.current().values().open());

        write(GOOD.replace("\"open\":true", "\"open\":false"));
        Files.setLastModifiedTime(file(), FileTime.fromMillis(System.currentTimeMillis() + 5000));
        assertFalse(s.current().values().open());

        Files.delete(file());
        assertEquals("env", s.current().source());
    }

    @Test
    void saveWritesFileAndOneLogLine() throws Exception {
        var s = settings();
        var next = new SurveySettings.Values(true, 12, 5, 14, 30, null, null);
        var after = s.save(next, "env", "kim");

        assertEquals("file", after.source());
        assertTrue(after.values().open());
        assertEquals("kim", after.values().updatedBy());
        assertNotEquals("env", after.version());
        assertEquals("file", new SurveySettings(file(), ENV).current().source(), "파일이 정본");

        var lines = Files.readAllLines(tmp.resolve("survey-settings.log.jsonl"));
        assertEquals(1, lines.size());
        var n = new tools.jackson.databind.ObjectMapper().readTree(lines.get(0));
        assertEquals("kim", n.get("by").asString());
        assertEquals("env", n.get("beforeSource").asString(), "처음 저장은 파일 없음");
        assertFalse(n.get("before").get("open").asBoolean());
        assertEquals(7, n.get("before").get("minDays").asInt(), "이전 7 → 이후 12");
        assertTrue(n.get("after").get("open").asBoolean());
        assertEquals(12, n.get("after").get("minDays").asInt());
        assertTrue(n.get("applied").asBoolean());
    }

    @Test
    void saveWithStaleVersionIsRejectedAndChangesNothing() throws Exception {
        write(GOOD);
        var s = settings();
        assertThrows(SurveySettings.VersionConflict.class,
                () -> s.save(new SurveySettings.Values(false, 3, 1, 0, 0, null, null), "env", "kim"));
        assertTrue(s.current().values().open());
        assertFalse(Files.exists(tmp.resolve("survey-settings.log.jsonl")));
    }

    /** 깨진 파일 위에도 콘솔에서 다시 저장할 수 있어야 한다(복구 길). */
    @Test
    void canSaveOverBrokenFile() throws Exception {
        write("{broken");
        var s = settings();
        var cur = s.current();
        var after = s.save(new SurveySettings.Values(false, 7, 5, 0, 0, null, null), cur.version(), "kim");
        assertEquals("file", after.source());
        var line = Files.readAllLines(tmp.resolve("survey-settings.log.jsonl")).get(0);
        assertTrue(line.contains("\"beforeSource\":\"broken\""), line);
    }
}
