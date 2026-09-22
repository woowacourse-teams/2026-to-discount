package com.discounttracker.push;

import com.discounttracker.banner.Banner;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PushMessageFactoryTest {
    private final PushMessageFactory factory = new PushMessageFactory(new ObjectMapper());

    @Test
    void createsSingleAndDigestCopy() {
        String single = factory.payload(List.of(banner("a", "BBQ")), "display", "click", "n1", "digest");
        String multiple = factory.payload(List.of(banner("a", "BBQ"), banner("b", "교촌치킨")),
                "display", "click", "n2", "digest");

        assertThat(single).contains("오늘의 새로운 배달 쿠폰 소식", "BBQ 할인을 확인해 보세요.");
        assertThat(multiple).contains("오늘의 새로운 할인 소식", "BBQ 외 1개의 새로운 할인이 있어요.");
    }

    private Banner banner(String id, String brand) {
        return new Banner(id, brand, "baemin", "https://example.com", "5,000원", "오늘",
                null, null, null, LocalDate.parse("2026-09-21"), LocalDate.parse("2026-09-22"),
                false, null, 1, null, null, true, false);
    }
}
