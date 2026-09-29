package com.discounttracker.brand;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 브랜드 별칭 해석 계약({@code contracts/brand-alias-cases.json}). 같은 표를 tracker의
 * export_data/check_brands와 콘솔(beggars-ops)이 돈다. 해석이 갈리면 콘솔의 "카탈로그에 없는
 * 이름" 판정과 서버의 unknownBrands가 갈린다(감사 R3).
 */
class BrandAliasContractTest {

    private static JsonNode contract() throws Exception {
        try (InputStream in = BrandAliasContractTest.class.getResourceAsStream("/contracts/brand-alias-cases.json")) {
            return new ObjectMapper().readTree(in);
        }
    }

    @TestFactory
    Stream<DynamicTest> resolvesEveryCase() throws Exception {
        JsonNode c = contract();
        BrandCatalog catalog = new BrandCatalog(new ByteArrayResource(
                c.get("brandsYml").asText().getBytes(StandardCharsets.UTF_8)));
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode k : c.get("cases")) {
            tests.add(DynamicTest.dynamicTest(k.get("name").asText(), () -> {
                String raw = k.get("raw").asText();
                assertEquals(k.get("canonical").asText(), catalog.canonical(raw), raw);
                assertEquals(k.get("known").asBoolean(), catalog.knows(raw), raw);
            }));
        }
        return tests.stream();
    }

    /** 표본이 지어낸 값이 아니다 - 라이브 brands.yml에 같은 대표명과 별칭이 있다. */
    @Test
    @SuppressWarnings("unchecked")
    void sampleIsDrawnFromTheLiveCatalog() throws Exception {
        Map<String, Map<String, Object>> sample = (Map<String, Map<String, Object>>)
                new Yaml().<Map<String, Object>>load(contract().get("brandsYml").asText()).get("brands");
        Map<String, Map<String, Object>> live;
        try (InputStream in = new ClassPathResource("brands.yml").getInputStream()) {
            live = (Map<String, Map<String, Object>>) new Yaml().<Map<String, Object>>load(in).get("brands");
        }
        for (var e : sample.entrySet()) {
            assertTrue(live.containsKey(e.getKey()), e.getKey());
            List<Object> want = (List<Object>) e.getValue().getOrDefault("aliases", List.of());
            List<Object> got = (List<Object>) live.get(e.getKey()).getOrDefault("aliases", List.of());
            assertTrue(got.containsAll(want), e.getKey() + " aliases");
        }
    }
}
