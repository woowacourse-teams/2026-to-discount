package com.discounttracker.data;

import com.discounttracker.model.OfferRecord;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ExportDataLoaderTest {

    private static final String JSON = """
        [
          {"platform":"baemin","brand":"도미노피자","amount":5000,"qualifier":null,
           "needsReview":false,"offerType":"discount","section":"오늘의 할인",
           "rawText":"5,000원 브랜드 할인","capturedAt":"2026-07-27T14:20:00+09:00",
           "screenshotPath":"ref/delivery/baemin_2026-07-27.jpg"},
          {"platform":"yogiyo","brand":"굽네치킨","amount":7000,"qualifier":"최대",
           "needsReview":true,"offerType":"discount","section":null,
           "rawText":"최대 7,000원 할인","capturedAt":"2026-07-27T14:25:00+09:00",
           "screenshotPath":"ref/delivery/yogiyo_2026-07-27 (1).jpg"}
        ]
        """;

    private ExportDataLoader loaderFor(String json) {
        return new ExportDataLoader(new ByteArrayResource(json.getBytes(
                java.nio.charset.StandardCharsets.UTF_8)));
    }

    @Test
    void parsesAllRecords() {
        ExportDataLoader loader = loaderFor(JSON);
        loader.reload();
        List<OfferRecord> records = loader.records();
        assertEquals(2, records.size());
    }

    @Test
    void mapsFieldsIncludingNulls() {
        ExportDataLoader loader = loaderFor(JSON);
        loader.reload();
        OfferRecord domino = loader.records().stream()
                .filter(r -> r.brand().equals("도미노피자")).findFirst().orElseThrow();
        assertEquals("baemin", domino.platform());
        assertEquals(5000, domino.amount());
        assertNull(domino.qualifier());
        assertFalse(domino.needsReview());

        OfferRecord goobne = loader.records().stream()
                .filter(r -> r.brand().equals("굽네치킨")).findFirst().orElseThrow();
        assertEquals("최대", goobne.qualifier());
        assertTrue(goobne.needsReview());
    }

    @Test
    void missingFileGivesEmptyList() {
        ExportDataLoader loader = new ExportDataLoader(
                new org.springframework.core.io.ClassPathResource("data/does-not-exist.json"));
        loader.reload();
        assertTrue(loader.records().isEmpty());
    }
}
