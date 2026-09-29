package com.discounttracker.banner;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 플랫폼 계약({@code contracts/platforms.json}). 같은 파일을 웹(platformsContract.test.js),
 * 콘솔(beggars-ops), 수집기(tracker)가 읽는다. 목록이 네 곳에 따로 적혀 있었다(감사 R3).
 */
class PlatformContractTest {

    private static JsonNode read(String name) throws Exception {
        try (InputStream in = PlatformContractTest.class.getResourceAsStream("/contracts/" + name)) {
            return new ObjectMapper().readTree(in);
        }
    }

    @Test
    void ownIsTheContractValue() throws Exception {
        assertEquals(read("platforms.json").get("own").asText(), Banner.OWN);
    }

    @Test
    void bannerOptionsAreOwnThenEveryDeliveryApp() throws Exception {
        JsonNode c = read("platforms.json");
        List<String> expected = new ArrayList<>(List.of(Banner.OWN));
        c.get("delivery").forEach(p -> expected.add(p.get("key").asText()));
        List<String> options = new ArrayList<>();
        c.get("bannerOptions").forEach(p -> options.add(p.asText()));
        assertEquals(expected, options);
    }

    @Test
    void everyPlatformInTheBannerContractIsABannerOption() throws Exception {
        List<String> options = new ArrayList<>();
        read("platforms.json").get("bannerOptions").forEach(p -> options.add(p.asText()));
        List<String> seen = read("banner-cases.json").findValuesAsText("platform");
        assertTrue(seen.size() > 0);
        for (String p : seen) assertTrue(options.contains(p), p);
    }
}
