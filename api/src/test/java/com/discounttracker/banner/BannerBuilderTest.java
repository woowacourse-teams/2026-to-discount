package com.discounttracker.banner;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 배너를 이름으로 짓는다. 2026-09-22에 같은 날 두 사람이 이 record에 칸을 더해
 * (웹 푸시 notify 둘, 화면용 brandLabels 하나) 호출부가 줄줄이 깨졌다.
 */
class BannerBuilderTest {

    @Test
    void onlyIdAndUrlAreRequiredAndTheRestDefaultToNothing() {
        Banner b = Banner.of("id", "https://example.test").build();
        assertEquals("id", b.id());
        assertEquals("https://example.test", b.url());
        assertNull(b.brand());
        assertNull(b.brands());
        assertEquals(Banner.DEFAULT_PRIORITY, b.priority());
        assertTrue(b.isOwn());                       // platform이 없으면 자체 행사다
    }

    @Test
    void toBuilderKeepsEveryFieldItDidNotTouch() {
        Banner before = Banner.of("id", "https://example.test")
                .brand("교촌치킨").platform("baemin").amount("5,000원").period("오늘")
                .extra("16,000원↑").minOrder(16000).color("#c8102e")
                .startsOn(LocalDate.parse("2026-09-22")).endsOn(LocalDate.parse("2026-09-22"))
                .priority(2).brands(List.of("교촌치킨")).brandLabels(List.of("교촌"))
                .notify(true).notifyImmediately(true)
                .build();

        Banner after = before.toBuilder().priority(9).build();
        assertEquals(9, after.priority());
        assertEquals(before.brandLabels(), after.brandLabels());
        assertEquals(before.notificationEnabled(), after.notificationEnabled());
        assertEquals(before.immediateNotificationRequested(), after.immediateNotificationRequested());
        assertEquals(before.toBuilder().build(), before);
    }

    @Test
    void resolvingSoldOutForTodayKeepsTheRest() {
        Banner b = Banner.of("id", "https://example.test")
                .brand("교촌치킨").brandLabels(List.of("교촌")).notify(true)
                .soldOutOn(LocalDate.parse("2026-09-22"))
                .build();
        Banner resolved = b.resolvedFor(LocalDate.parse("2026-09-22"));
        assertEquals(Boolean.TRUE, resolved.soldOut());
        assertNull(resolved.soldOutOn());
        assertEquals(List.of("교촌"), resolved.brandLabels());
        assertTrue(resolved.notificationEnabled());
    }
}
