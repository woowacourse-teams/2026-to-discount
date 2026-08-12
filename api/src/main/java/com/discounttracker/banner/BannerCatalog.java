package com.discounttracker.banner;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * banners.yml을 읽어 오늘 띄울 배너를 제공한다. {@code BrandCatalog}를 본뜬다.
 *
 * <p>경로를 열어두는 이유({@code discount.banners-path})는 배너가 매일 바뀔 수
 * 있는 내용이기 때문이다. classpath 안에만 두면 행사 하나 바꾸는 데 jar를 다시
 * 빌드해 배포해야 한다. jar 밖 파일을 물려두면 파일만 갈아끼우고
 * {@code POST /api/reload}로 반영할 수 있다.
 *
 * <p>날짜 판정은 여기서만 한다. 프론트는 받은 것을 그대로 띄우기만 한다 —
 * 프론트에서 판정하면 사용자 기기 시계를 따라가 시차 문제가 생긴다.
 */
@Component
public class BannerCatalog {

    private final Resource source;
    private final Clock clock;

    /** 기간 밖인 것까지 전부. 걸러내는 건 {@link #active()}에서 한다. */
    private volatile List<Banner> all = List.of();

    public BannerCatalog(@Value("${discount.banners-path:classpath:banners.yml}") Resource source,
                         Clock clock) {
        this.source = source;
        this.clock = clock;
        reload();
    }

    /** 파일을 갈아끼웠을 때 다시 읽는다. 읽기에 실패하면 이전 목록을 그대로 둔다. */
    public final void reload() {
        all = read();
    }

    /**
     * 오늘 띄울 배너. priority 오름차순, 동률이면 endsOn이 가까운 순.
     *
     * <p>캐러셀 순서를 프론트가 정하지 않게 서버에서 정렬해 내려준다.
     */
    public List<Banner> active() {
        LocalDate today = LocalDate.now(clock);
        return all.stream()
                .filter(b -> b.activeOn(today))
                .sorted(Comparator.comparingInt(Banner::priority).thenComparing(Banner::endsOn))
                .toList();
    }

    @SuppressWarnings("unchecked")
    private List<Banner> read() {
        if (!source.exists()) return List.of();

        try (InputStream in = source.getInputStream()) {
            Map<String, Object> root = new Yaml().load(in);
            if (root == null) return List.of();
            Object raw = root.get("banners");
            if (!(raw instanceof List<?> list)) return List.of();

            List<Banner> parsed = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Banner banner = toBanner((Map<String, Object>) map);
                    if (banner != null) parsed.add(banner);
                }
            }
            return List.copyOf(parsed);
        } catch (IOException e) {
            throw new IllegalStateException("banners.yml 읽기 실패", e);
        }
    }

    /**
     * 필수 값이 빠진 항목은 통째로 건너뛴다.
     *
     * <p>사람이 손으로 고치는 파일이고 그 파일이 jar 밖에 있다 — 오타 하나가
     * 기동을 막거나 reload를 500으로 만들면 나머지 배너까지 같이 죽는다.
     * 몇 건이 올라갔는지는 {@code POST /api/reload} 응답으로 확인한다.
     */
    private static Banner toBanner(Map<String, Object> attrs) {
        String id = text(attrs.get("id"));
        String platform = text(attrs.get("platform"));
        String url = text(attrs.get("url"));
        String amount = text(attrs.get("amount"));
        String period = text(attrs.get("period"));
        LocalDate startsOn = date(attrs.get("startsOn"));
        LocalDate endsOn = date(attrs.get("endsOn"));
        if (id == null || platform == null || url == null
                || amount == null || period == null || startsOn == null || endsOn == null) {
            return null;
        }

        Object priority = attrs.get("priority");
        return new Banner(
                id,
                text(attrs.get("brand")),
                platform,
                url,
                amount,
                period,
                text(attrs.get("extra")),
                text(attrs.get("color")),
                startsOn,
                endsOn,
                priority instanceof Number n ? n.intValue() : Banner.DEFAULT_PRIORITY);
    }

    private static String text(Object value) {
        if (value == null) return null;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? null : s;
    }

    /**
     * 따옴표 없는 {@code 2026-08-11}을 snakeyaml이 {@link Date}(UTC 자정)로
     * 만들어 준다 — 문자열로 적었을 때와 같은 날짜가 나오게 UTC로 되돌린다.
     */
    private static LocalDate date(Object value) {
        if (value instanceof Date d) return d.toInstant().atZone(ZoneOffset.UTC).toLocalDate();
        String s = text(value);
        if (s == null) return null;
        try {
            return LocalDate.parse(s);
        } catch (java.time.format.DateTimeParseException e) {
            return null;
        }
    }
}
