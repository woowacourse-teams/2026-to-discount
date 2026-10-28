package com.discounttracker.brand;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
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

    @SuppressWarnings("unchecked")
    private static Map<String, Map<String, Object>> loadBrandsFile() throws Exception {
        try (InputStream in = new ClassPathResource("brands.yml").getInputStream()) {
            Map<String, Object> root = new Yaml().load(in);
            return (Map<String, Map<String, Object>>) root.get("brands");
        }
    }

    @Test
    void everyBrandHasNonBlankSearchAliases() throws Exception {
        loadBrandsFile().forEach((name, attrs) -> {
            List<String> searchAliases = ((List<?>) attrs.getOrDefault("searchAliases", List.of()))
                    .stream().map(String::valueOf).toList();

            assertFalse(searchAliases.isEmpty(),
                    () -> name + "의 searchAliases가 비어 있다");
            assertTrue(searchAliases.stream().noneMatch(String::isBlank),
                    () -> name + "의 searchAliases에 빈 값이 있다");
        });
    }

    record LinkRule(String scheme, String host) {}

    // 알려진 앱의 스킴과 호스트 정본. 이 목록에 없는 키는 구조만 본다(이슈 댓글: 키를 고정 목록으로 강제하지 않는다).
    private static final Map<String, LinkRule> LINK_RULES = Map.of(
            "baemin", new LinkRule("https", "s.baemin.com"),
            "ddangyo", new LinkRule("https", "fdofd.ddangyo.com"),
            "yogiyo", new LinkRule("yogiyolink", "push.page"));

    /** 어긋난 곳마다 "<브랜드>의 links.<키>: <사유> (값: <값>)" 한 줄을 돌려준다. 비면 통과. */
    static List<String> linkProblems(Map<String, Map<String, Object>> brands) {
        List<String> problems = new ArrayList<>();
        brands.forEach((name, attrs) -> {
            Object links = attrs == null ? null : attrs.get("links");
            if (links == null) {
                return;
            }
            if (!(links instanceof Map<?, ?> map)) {
                problems.add(name + "의 links: 맵이 아니다 (값: " + links + ")");
                return;
            }
            map.forEach((key, value) -> {
                String at = name + "의 links." + key + ": ";
                String tail = " (값: " + value + ")";
                if (!(key instanceof String k) || k.isBlank()) {
                    problems.add(at + "키가 비어 있거나 문자열이 아니다" + tail);
                } else if (!(value instanceof String v)) {
                    problems.add(at + "문자열이 아니다" + tail);
                } else {
                    String problem = linkProblem(LINK_RULES.get(k), v);
                    if (problem != null) {
                        problems.add(at + problem + tail);
                    }
                }
            });
        });
        return problems;
    }

    private static String linkProblem(LinkRule rule, String value) {
        URI uri;
        try {
            uri = new URI(value);
        } catch (URISyntaxException e) {
            return "URI로 읽을 수 없다";
        }
        if (uri.getScheme() == null || uri.getHost() == null) {
            return "스킴이나 호스트가 없다";
        }
        if (rule == null) {
            return null;
        }
        if (!rule.scheme().equals(uri.getScheme())) {
            return "스킴이 " + rule.scheme() + "이 아니다";
        }
        if (!rule.host().equalsIgnoreCase(uri.getHost())) {
            return "호스트가 " + rule.host() + "이 아니다";
        }
        if ("https".equals(rule.scheme()) && (uri.getPort() != -1 || uri.getUserInfo() != null)) {
            return "포트나 사용자 정보가 붙어 있다";
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Map<String, Object>> brandsOf(String yaml) {
        return (Map<String, Map<String, Object>>) ((Map<String, Object>) new Yaml().load(yaml)).get("brands");
    }

    private static String onlyProblem(String linksLine) {
        List<String> problems = linkProblems(brandsOf("brands:\n  A:\n    links:\n      " + linksLine + "\n"));
        assertEquals(1, problems.size(), problems::toString);
        return problems.get(0);
    }

    @Test
    void everyBrandLinkMatchesItsAppShareHost() throws Exception {
        Map<String, Map<String, Object>> brands = loadBrandsFile();
        // 양성 신호: 파일을 못 읽거나 links 키 이름이 바뀌어 아무것도 안 훑어도 초록이 되는 것을 막는다.
        long checked = brands.values().stream()
                .filter(a -> a != null && a.get("links") instanceof Map)
                .mapToLong(a -> ((Map<?, ?>) a.get("links")).size()).sum();
        assertTrue(checked > 0, "brands.yml에서 검사한 links가 하나도 없다");

        List<String> problems = linkProblems(brands);
        assertTrue(problems.isEmpty(), () -> String.join("\n", problems));
    }

    @Test
    void validLinksPass() {
        assertTrue(linkProblems(brandsOf("""
                brands:
                  A:
                    links:
                      baemin: https://s.baemin.com/abc
                      ddangyo: https://fdofd.ddangyo.com/x?k
                      yogiyo: yogiyolink://push.page/franchise?fr_id=31
                """)).isEmpty());
    }

    @Test
    void wrongHostFailsWithBrandKeyAndValue() {
        String msg = onlyProblem("baemin: https://example.test/abc");
        assertTrue(msg.contains("A") && msg.contains("baemin") && msg.contains("https://example.test/abc"), msg);
    }

    @Test
    void hostWithOnlyMatchingPrefixFails() {
        onlyProblem("baemin: https://s.baemin.com.example.test/abc");
    }

    @Test
    void httpSchemeFails() {
        assertTrue(onlyProblem("baemin: http://s.baemin.com/abc").contains("스킴"));
    }

    @Test
    void portOrUserInfoOnHttpsFails() {
        onlyProblem("baemin: https://s.baemin.com:8443/abc");
        onlyProblem("baemin: https://user@s.baemin.com/abc");
    }

    @Test
    void nonStringValueFails() {
        assertTrue(onlyProblem("baemin: 12345").contains("문자열이 아니다"));
    }

    @Test
    void unknownKeyWithValidUrlPasses() {
        // 이슈 댓글: 앱 키를 고정 목록으로 강제하지 않는다. 구조만 본다.
        assertTrue(linkProblems(brandsOf("""
                brands:
                  A:
                    links:
                      selfbrand: https://example.test/abc
                """)).isEmpty());
    }

    @Test
    void unknownKeyWithMalformedValueFails() {
        assertTrue(onlyProblem("coupangeats: not a url").contains("URI로 읽을 수 없다"));
        assertTrue(onlyProblem("coupangeats: abc").contains("스킴이나 호스트가 없다"));
    }

    @Test
    void allProblemsAcrossBrandsAreReported() {
        List<String> problems = linkProblems(brandsOf("""
                brands:
                  A:
                    links: {baemin: "http://s.baemin.com/a"}
                  B:
                    links: {ddangyo: "https://example.test/b"}
                """));
        assertEquals(2, problems.size(), problems::toString);
    }

    @Test
    void missingOrEmptyLinksPass() {
        assertTrue(linkProblems(brandsOf("brands:\n  A: {}\n  B:\n    links: {}\n")).isEmpty());
    }
}
