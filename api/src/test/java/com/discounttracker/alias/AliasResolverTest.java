package com.discounttracker.alias;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AliasResolverTest {

    private static final String YAML = """
        멕시카나:
          - 멕시카나
          - 멕시카나치킨
        BBQ:
          - BBQ
          - BBQ치킨
        """;

    private AliasResolver resolverFor(String yaml) {
        return new AliasResolver(new ByteArrayResource(yaml.getBytes(
                java.nio.charset.StandardCharsets.UTF_8)));
    }

    @Test
    void mapsAliasToCanonical() {
        AliasResolver r = resolverFor(YAML);
        assertEquals("멕시카나", r.canonical("멕시카나치킨"));
        assertEquals("멕시카나", r.canonical("멕시카나"));
        assertEquals("BBQ", r.canonical("BBQ치킨"));
    }

    @Test
    void unknownBrandReturnedAsIs() {
        AliasResolver r = resolverFor(YAML);
        assertEquals("도미노피자", r.canonical("도미노피자"));
    }

    @Test
    void emptyYamlReturnsInputAsIs() {
        AliasResolver r = resolverFor("");
        assertEquals("굽네치킨", r.canonical("굽네치킨"));
    }
}
