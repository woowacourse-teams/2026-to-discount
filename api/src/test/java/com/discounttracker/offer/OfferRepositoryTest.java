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
    void ignoresUnknownFieldsInsteadOfThrowing() {
        // 트래커가 API보다 먼저 export.json에 새 필드를 얹어 배포하는
        // 순서 문제(channel/badge/soldOut 필드 추가 때 세 번 재현,
        // 2026-08-01~08-03)로 reload가 500 나던 걸 막는다 — API가 아직
        // 모르는 필드는 무시하고 나머지는 정상 로드돼야 한다.
        OfferRepository repo = repositoryFor("""
            [{"platform":"baemin","brand":"도미노피자","amount":5000,"qualifier":null,
              "needsReview":false,"offerType":"discount","section":"오늘의 할인",
              "rawText":"5,000원 브랜드 할인","capturedAt":"2026-07-27T14:20:00+09:00",
              "screenshotPath":"ref/delivery/baemin_2026-07-27.jpg",
              "aFieldThisApiDoesNotKnowYet":"whatever"}]
            """);
        assertEquals(1, repo.findAll().size());
        assertEquals("도미노피자", repo.findAll().get(0).brand());
    }

    @Test
    void nullSoldOutDoesNotBreakReload() {
        // 실측(2026-08-04, 사용자가 export.json에 브랜드를 수동으로 추가):
        // "soldOut": null을 넣었더니 reload가 통째로 실패해 그 브랜드는커녕
        // 원장 전체가 안 떴다. soldOut이 primitive boolean이라 JSON null을
        // 못 받아 MismatchedInputException이 났다 — 사람이 손으로 채우는
        // 값이니 null도 받아야 한다.
        OfferRepository repo = repositoryFor("""
            [{"platform":"baemin","brand":"호식이두마리치킨","amount":4000,"qualifier":"최대",
              "needsReview":false,"offerType":"discount","section":null,
              "rawText":"알뜰배달 4,000원 할인","capturedAt":"2026-08-04T13:25:00+09:00",
              "screenshotPath":"x.jpg","minOrderAmount":21000,"tiers":null,"conditions":null,
              "expiresAt":null,"badge":"배민클럽 전용쿠폰","soldOut":null}]
            """);
        assertEquals(1, repo.findAll().size());
        assertEquals("호식이두마리치킨", repo.findAll().get(0).brand());
        assertNull(repo.findAll().get(0).soldOut());
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
