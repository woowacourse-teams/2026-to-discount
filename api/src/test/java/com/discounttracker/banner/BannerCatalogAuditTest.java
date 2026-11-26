package com.discounttracker.banner;

import com.discounttracker.brand.BrandCatalog;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.*;

class BannerCatalogAuditTest {

    private static final String ONE = """
            %s:
              - id: ddangyo-first-order
                platform: ddangyo
                url: https://ddangyo.example/first
                amount: {won: 5000}
                startsAt: '2026-08-01T00:00:00'
                endsAt: '2026-08-31T23:59:59'
            """;

    private static BannerCatalog catalog(String yaml) {
        Clock clock = Clock.fixed(Instant.parse("2026-08-11T00:00:00Z"), ZoneId.of("Asia/Seoul"));
        var brands = new BrandCatalog(new ByteArrayResource("brands: {}".getBytes(StandardCharsets.UTF_8)));
        return new BannerCatalog(new ByteArrayResource(yaml.getBytes(StandardCharsets.UTF_8)), clock, brands);
    }

    @Test
    void readsBannersKey() {
        var c = catalog(ONE.formatted("banners"));
        assertTrue(c.reload());
        assertEquals(1, c.active().size());
    }

    @Disabled("audit: 02-api-b.md BannerCatalog 최상위 banners 키 오타면 빈 목록인데 reload()가 true")
    @Test
    void typoInTopLevelKeyFailsReload() {
        var c = catalog(ONE.formatted("banner"));
        assertFalse(c.reload());
    }

    @Disabled("audit: 02-api-b.md BannerCatalog banners가 리스트가 아니면 빈 목록인데 reload()가 true")
    @Test
    void nonListBannersFailsReload() {
        assertFalse(catalog("banners: 3").reload());
    }
}
