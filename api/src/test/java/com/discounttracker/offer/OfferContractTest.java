package com.discounttracker.offer;

import com.discounttracker.comparison.BrandComparison;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.io.InputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 오퍼 계약({@code contracts/offer-cases.json}). export.json 한 줄을 서버가 읽는 길
 * (OfferRepository와 같은 설정)으로 읽고, 응답 직렬화기로 써서 계약의 offer와 글자까지 견준다.
 * 같은 파일을 웹(offerContract.test.js)과 tracker(export 칸)가 읽는다(감사 R3).
 */
class OfferContractTest {

    private static final ObjectMapper READ = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private static final ObjectMapper JSON = Jackson2ObjectMapperBuilder.json()
            .featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).build();

    private static JsonNode contract() throws Exception {
        try (InputStream in = OfferContractTest.class.getResourceAsStream("/contracts/offer-cases.json")) {
            return JSON.readTree(in);
        }
    }

    private static TreeSet<String> keys(JsonNode node) {
        TreeSet<String> out = new TreeSet<>();
        node.fieldNames().forEachRemaining(out::add);
        return out;
    }

    private static TreeSet<String> list(JsonNode arr) {
        TreeSet<String> out = new TreeSet<>();
        arr.forEach(n -> out.add(n.asText()));
        return out;
    }

    @TestFactory
    Stream<DynamicTest> recordBecomesTheContractOffer() throws Exception {
        JsonNode c = contract();
        LocalDate asOf = LocalDate.parse(c.get("asOf").asText());
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode k : c.get("cases")) {
            tests.add(DynamicTest.dynamicTest(k.get("name").asText(), () -> {
                OfferRecord r = READ.treeToValue(k.get("record"), OfferRecord.class);
                JsonNode got = JSON.readTree(JSON.writeValueAsString(Offer.from(r, asOf)));
                // 칸 순서는 보지 않는다. @JsonProperty 게터(status, membership)의 순서는 실행마다
                // 바뀐다(리플렉션 순서). 값과 칸 이름만 견준다.
                assertEquals(k.get("offer"), got, got.toString());
                assertEquals(list(c.get("offerKeys")), keys(got));
                for (JsonNode t : got.path("tiers")) assertEquals(list(c.get("tierKeys")), keys(t));
            }));
        }
        return tests.stream();
    }

    @Test
    void brandCardKeysAreTheContractKeys() throws Exception {
        JsonNode c = contract();
        OfferRecord r = READ.treeToValue(c.get("cases").get(0).get("record"), OfferRecord.class);
        Offer offer = Offer.from(r, LocalDate.parse(c.get("asOf").asText()));
        BrandComparison card = new BrandComparison(new com.discounttracker.brand.Brand("bhc", List.of(), null, null, java.util.Map.of(), List.of()),
                offer.amount(), null, List.of(offer), 0);
        assertEquals(list(c.get("brandKeys")), keys(JSON.readTree(JSON.writeValueAsString(card))));
    }
}
