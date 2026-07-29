package com.discounttracker.offer;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class OfferRepositoryTest {

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

    private OfferRepository repositoryFor(String json) {
        OfferRepository repo = new OfferRepository(
                new ByteArrayResource(json.getBytes(StandardCharsets.UTF_8)));
        repo.reload();
        return repo;
    }

    @Test
    void parsesAllRecords() {
        assertEquals(2, repositoryFor(JSON).findAll().size());
    }

    @Test
    void mapsFieldsIncludingNulls() {
        List<OfferRecord> records = repositoryFor(JSON).findAll();

        OfferRecord domino = records.stream()
                .filter(r -> r.brand().equals("도미노피자")).findFirst().orElseThrow();
        assertEquals("baemin", domino.platform());
        assertEquals(5000, domino.amount());
        assertNull(domino.qualifier());
        assertFalse(domino.needsReview());

        OfferRecord goobne = records.stream()
                .filter(r -> r.brand().equals("굽네치킨")).findFirst().orElseThrow();
        assertEquals("최대", goobne.qualifier());
        assertTrue(goobne.needsReview());
    }

    @Test
    void missingFileGivesEmptyList() {
        OfferRepository repo = new OfferRepository(
                new ClassPathResource("data/does-not-exist.json"));
        repo.reload();
        assertTrue(repo.findAll().isEmpty());
    }

    @Test
    void amountWithoutReviewIsConfirmed() {
        OfferRecord r = repositoryFor(JSON).findAll().stream()
                .filter(x -> x.brand().equals("도미노피자")).findFirst().orElseThrow();
        assertEquals(OfferStatus.CONFIRMED, r.status());
    }

    @Test
    void needsReviewIsHeldEvenWithAmount() {
        OfferRecord r = repositoryFor(JSON).findAll().stream()
                .filter(x -> x.brand().equals("굽네치킨")).findFirst().orElseThrow();
        assertEquals(OfferStatus.HELD, r.status());
    }

    @Test
    void readsDetailFieldsWhenPresent() {
        OfferRepository repo = repositoryFor("""
            [{"platform":"yogiyo","brand":"굽네치킨","amount":7000,"qualifier":"최대",
              "needsReview":true,"offerType":"discount","section":null,
              "rawText":"최대 7,000원 할인","capturedAt":"2026-07-27T14:25:00+09:00",
              "screenshotPath":"x.jpg","minOrderAmount":15000,"conditions":"1일 1회",
              "tiers":[{"minOrder":15000,"amount":3000},{"minOrder":25000,"amount":7000}]}]
            """);
        OfferRecord r = repo.findAll().get(0);
        assertEquals(15000, r.minOrderAmount());
        assertEquals("1일 1회", r.conditions());
        assertEquals(2, r.tiers().size());
        assertEquals(25000, r.tiers().get(1).minOrder());
        assertEquals(7000, r.tiers().get(1).amount());
    }

    @Test
    void detailFieldsAreNullWhenAbsentFromLedger() {
        // 지금 원장 대부분이 이 상태다. 없다고 터지면 안 된다.
        OfferRecord r = repositoryFor(JSON).findAll().get(0);
        assertNull(r.minOrderAmount());
        assertNull(r.tiers());
        assertNull(r.conditions());
    }

    @Test
    void missingAmountIsHeld() {
        OfferRepository repo = repositoryFor("""
            [{"platform":"yogiyo","brand":"맥도날드","amount":null,"qualifier":"최대",
              "needsReview":true,"offerType":"discount","section":null,
              "rawText":"최대 9% 할인","capturedAt":"2026-07-27T14:25:00+09:00",
              "screenshotPath":"x.jpg"}]
            """);
        assertEquals(OfferStatus.HELD, repo.findAll().get(0).status());
    }
}
