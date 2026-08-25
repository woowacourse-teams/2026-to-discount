package com.discounttracker.brand;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class BrandCatalogTest {

    private static final String YAML = """
        brands:
          멕시카나:
            category: chicken
            aliases: [멕시카나치킨]
            searchAliases: [멕시카나 치킨, mexicana, "  "]
            links:
              ddangyo: https://example.test/mexicana
              baemin: https://s.baemin.com/mexicana
          BBQ:
            category: chicken
            aliases: [BBQ치킨]
          하남돼지집: {}
        """;

    private BrandCatalog catalogFor(String yaml) {
        return new BrandCatalog(new ByteArrayResource(yaml.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void mapsAliasToCanonical() {
        BrandCatalog c = catalogFor(YAML);
        assertEquals("멕시카나", c.canonical("멕시카나치킨"));
        assertEquals("BBQ", c.canonical("BBQ치킨"));
    }

    @Test
    void canonicalNameMapsToItself() {
        // 원장에 대표명이 그대로 찍히는 경우가 대부분이라 이게 깨지면 전부 어긋난다.
        assertEquals("멕시카나", catalogFor(YAML).canonical("멕시카나"));
    }

    @Test
    void unknownBrandReturnedAsIs() {
        assertEquals("도미노피자", catalogFor(YAML).canonical("도미노피자"));
    }

    @Test
    void exposesCategoryAndLinksByPlatform() {
        Brand mexicana = catalogFor(YAML).find("멕시카나");
        assertEquals(java.util.List.of("멕시카나 치킨", "mexicana"), mexicana.searchAliases());
        assertEquals(Category.CHICKEN, mexicana.category());
        assertEquals("https://example.test/mexicana", mexicana.links().get("ddangyo"));
        assertEquals("https://s.baemin.com/mexicana", mexicana.links().get("baemin"));
    }

    @Test
    void brandWithoutAttributesHasNoCategoryOrLinks() {
        Brand hanam = catalogFor(YAML).find("하남돼지집");
        assertTrue(hanam.searchAliases().isEmpty());
        assertNull(hanam.category());
        assertTrue(hanam.links().isEmpty());
    }

    @Test
    void brandMissingFromCatalogStillResolves() {
        // 원장에는 있는데 brands.yml에 아직 안 넣은 브랜드도 화면에는 떠야 한다.
        Brand unknown = catalogFor(YAML).find("굽네치킨");
        assertEquals("굽네치킨", unknown.name());
        assertTrue(unknown.searchAliases().isEmpty());
        assertNull(unknown.category());
    }

    @Test
    void emptyYamlIsHarmless() {
        assertEquals("굽네치킨", catalogFor("").canonical("굽네치킨"));
    }

    @Test
    void unknownCategoryFallsBackToNull() {
        BrandCatalog c = catalogFor("""
            brands:
              뭔가:
                category: 존재하지않는분류
            """);
        assertNull(c.find("뭔가").category());
    }

    @Test
    void matchesAliasesRegardlessOfCase() {
        // 배너와 캡처 원장 양쪽 다 사람이 손으로 적는 값이 들어온다.
        // 표기마다 별칭을 한 줄씩 적게 하면 언젠가 하나를 빠뜨린다.
        String yaml = """
                brands:
                  굽네치킨:
                    category: chicken
                    aliases: [goobne]
                """;
        BrandCatalog catalog = catalogFor(yaml);
        assertEquals("굽네치킨", catalog.canonical("goobne"));
        assertEquals("굽네치킨", catalog.canonical("Goobne"));
        assertEquals("굽네치킨", catalog.canonical("GOOBNE"));
        assertEquals("굽네치킨", catalog.canonical(" goobne "));
        // 모르는 이름은 손대지 않는다 — 적힌 그대로 돌려준다.
        assertEquals("BBQ", catalog.canonical("BBQ"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void everyBrandHasKoreanAndEnglishSearchAliasesWithoutConflicts() throws Exception {
        Map<String, List<String>> owners = new HashMap<>();

        try (InputStream in = new ClassPathResource("brands.yml").getInputStream()) {
            Map<String, Object> root = new Yaml().load(in);
            Map<String, Map<String, Object>> brands =
                    (Map<String, Map<String, Object>>) root.get("brands");

            brands.forEach((name, attrs) -> {
                List<String> searchAliases = ((List<?>) attrs.getOrDefault("searchAliases", List.of()))
                        .stream().map(String::valueOf).toList();

                assertTrue(searchAliases.size() >= 3 && searchAliases.size() <= 5,
                        () -> name + "의 searchAliases는 3~5개여야 한다");
                assertTrue(searchAliases.stream().anyMatch(value -> value.matches(".*[가-힣].*")),
                        () -> name + "에 한국어 searchAliases가 없다");
                assertTrue(searchAliases.stream().anyMatch(value -> value.matches(".*[A-Za-z].*")),
                        () -> name + "에 영문 searchAliases가 없다");

                searchAliases.forEach(alias -> owners
                        .computeIfAbsent(alias.trim().toLowerCase(Locale.ROOT), ignored ->
                                new java.util.ArrayList<>())
                        .add(name));
            });
        }

        owners.forEach((alias, names) -> assertEquals(1, names.stream().distinct().count(),
                () -> "searchAliases 충돌: " + alias + " -> " + names));
    }
}
