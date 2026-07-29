package com.discounttracker.brand;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

class BrandCatalogTest {

    private static final String YAML = """
        brands:
          멕시카나:
            category: chicken
            aliases: [멕시카나치킨]
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
        assertEquals(Category.CHICKEN, mexicana.category());
        assertEquals("https://example.test/mexicana", mexicana.links().get("ddangyo"));
        assertEquals("https://s.baemin.com/mexicana", mexicana.links().get("baemin"));
    }

    @Test
    void brandWithoutAttributesHasNoCategoryOrLinks() {
        Brand hanam = catalogFor(YAML).find("하남돼지집");
        assertNull(hanam.category());
        assertTrue(hanam.links().isEmpty());
    }

    @Test
    void brandMissingFromCatalogStillResolves() {
        // 원장에는 있는데 brands.yml에 아직 안 넣은 브랜드도 화면에는 떠야 한다.
        Brand unknown = catalogFor(YAML).find("굽네치킨");
        assertEquals("굽네치킨", unknown.name());
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
}
