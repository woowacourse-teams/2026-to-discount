package com.discounttracker.banner;

import com.discounttracker.brand.BrandCatalog;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * 배너 계약({@code contracts/banner-cases.json})의 yml 예시를 파서와 직렬화기에 통과시켜 응답
 * JSON이 계약과 글자까지 같은지 본다.
 *
 * <p>같은 파일을 웹 테스트(bannerContract.test.js), 수집기 테스트(tracker), 콘솔 테스트
 * (beggars-ops)가 읽는다. 여기서 응답 모양을 바꾸면 계약을 같이 고쳐야 하고, 그러면 웹
 * 테스트가 새 모양을 소비하는지 바로 드러난다. 2026-09-29 감사 전에는 저장소마다 자기 단계만
 * 봐서 전부 초록인 채로 수집기 제안이 콘솔에서 거부되고 있었다.
 */
class BannerContractTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    /** 스프링 부트가 응답에 쓰는 것과 같은 설정. 부트는 날짜를 숫자 배열이 아니라 문자열로 쓴다. */
    private static final ObjectMapper JSON = Jackson2ObjectMapperBuilder.json()
            .featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).build();

    private static JsonNode contract() throws Exception {
        try (InputStream in = BannerContractTest.class.getResourceAsStream("/contracts/banner-cases.json")) {
            assertNotNull(in, "contracts/banner-cases.json이 없다. 건너뛰지 않는다");
            return JSON.readTree(in);
        }
    }

    private static List<Banner> activeFor(JsonNode banners, String now) {
        Object list = JSON.convertValue(banners, List.class);
        String yml = new Yaml().dump(Map.of("banners", list));
        Clock clock = Clock.fixed(LocalDateTime.parse(now).atZone(SEOUL).toInstant(), SEOUL);
        BrandCatalog brands = new BrandCatalog(new ByteArrayResource(new byte[0]));
        return new BannerCatalog(new ByteArrayResource(yml.getBytes(StandardCharsets.UTF_8)), clock, brands).active();
    }

    @TestFactory
    Stream<DynamicTest> everyCaseSerializesToTheContractResponse() throws Exception {
        JsonNode doc = contract();
        String now = doc.get("now").asText();
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : doc.get("cases")) {
            tests.add(DynamicTest.dynamicTest(c.get("name").asText(), () -> {
                JsonNode actual = JSON.valueToTree(activeFor(c.get("banners"), now));
                assertEquals(c.get("response"), actual,
                        "응답이 계약과 다르다. 의도한 변경이면 계약을 고치고 웹 테스트를 같이 돌린다.\n실제: " + actual);
            }));
        }
        return tests.stream();
    }

    @Test
    void everyResponseCarriesExactlyTheContractKeys() throws Exception {
        JsonNode doc = contract();
        TreeSet<String> keys = new TreeSet<>();
        doc.get("responseKeys").forEach(k -> keys.add(k.asText()));
        TreeSet<String> specKeys = new TreeSet<>();
        doc.get("specKeys").forEach(k -> specKeys.add(k.asText()));
        TreeSet<String> memberKeys = new TreeSet<>();
        doc.get("memberKeys").forEach(k -> memberKeys.add(k.asText()));
        int seen = 0;
        for (JsonNode c : doc.get("cases")) {
            for (JsonNode item : JSON.valueToTree(activeFor(c.get("banners"), doc.get("now").asText()))) {
                TreeSet<String> got = new TreeSet<>();
                item.fieldNames().forEachRemaining(got::add);
                assertEquals(keys, got, "응답 칸이 계약(responseKeys)과 다르다: " + c.get("name"));
                if (item.get("spec").isObject()) {
                    TreeSet<String> s = new TreeSet<>();
                    item.get("spec").fieldNames().forEachRemaining(s::add);
                    assertEquals(specKeys, s, "spec 칸이 계약과 다르다");
                }
                if (item.get("members").isArray()) {
                    for (JsonNode m : item.get("members")) {
                        TreeSet<String> s = new TreeSet<>();
                        m.fieldNames().forEachRemaining(s::add);
                        assertEquals(memberKeys, s, "members 칸이 계약과 다르다");
                    }
                }
                seen++;
            }
        }
        assertEquals(true, seen >= 3, "계약 예시가 응답을 셋 이상 내야 칸 검사가 뜻이 있다");
    }
}
