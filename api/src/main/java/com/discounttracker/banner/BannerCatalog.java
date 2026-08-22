package com.discounttracker.banner;

import com.discounttracker.brand.BrandCatalog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 *
 * <p>브랜드명도 여기서 대표명으로 맞춰 내려보낸다. 프론트는 배너 브랜드명을
 * 그대로 로고 파일명으로 쓰는데(BrandLogo), 손으로 적는 파일이라 앱에서
 * 복사한 표기가 그대로 들어온다 — 2026-08-21 배너에 {@code goobne}라고
 * 적혀 로고 파일(굽네치킨.png)을 못 찾고 폴백 글자만 떴다. brands.yml의
 * 별칭표가 이미 서버에 있으니 여기서 한 번 통과시킨다.
 */
@Component
public class BannerCatalog {

    private static final Logger log = LoggerFactory.getLogger(BannerCatalog.class);

    private final Resource source;
    private final Clock clock;
    private final BrandCatalog brands;

    /** 기간 밖인 것까지 전부. 걸러내는 건 {@link #active()}에서 한다. */
    private volatile List<Banner> all = List.of();

    /** brands.yml이 모르는 배너 브랜드 표기. {@link #reload()}가 채운다. */
    private volatile List<String> unknownBrands = List.of();

    public BannerCatalog(@Value("${discount.banners-path:classpath:banners.yml}") Resource source,
                         Clock clock, BrandCatalog brands) {
        this.source = source;
        this.clock = clock;
        this.brands = brands;
        reload();
    }

    /**
     * 파일을 갈아끼웠을 때 다시 읽는다. 읽기에 실패하면 이전 목록을 그대로 둔다.
     *
     * <p>실패를 삼키는 이유: 배너는 부가 정보인데, 이 파일 하나가 깨지면
     * 생성자에서 예외가 올라가 스프링 컨텍스트가 못 뜨고 브랜드·통계·이벤트
     * 수집까지 통째로 죽는다. 2026-08-21 새벽에 배너 항목 사이 콤마 하나가
     * 빠져 API가 502였고 systemd가 재시작을 네 번 반복했다.
     *
     * <p>항목 단위 오류는 {@link #toBanner}가 이미 건너뛰고 있었는데, 파일
     * 전체가 파싱 안 되는 경우는 막혀 있지 않았다.
     *
     * <p>배너만 안 보이고 나머지는 살아야 한다. 다만 조용히 살면 안 된다 —
     * 2026-08-22에 URL의 {@code ?}를 따옴표로 안 감싸 파일 전체가 깨졌는데,
     * {@code POST /api/reload}가 200에 건수까지 돌려주는 바람에 배너를 넣은
     * 사람은 반영된 줄 알았다. 성공 여부를 돌려줘 부르는 쪽이 알리게 한다.
     *
     * @return 파일을 다시 읽었으면 {@code true}, 실패해 이전 목록을 유지하면
     *         {@code false}
     */
    public final boolean reload() {
        try {
            all = read();
            unknownBrands = all.stream()
                    .map(Banner::brand)
                    .filter(b -> b != null && !brands.knows(b))
                    .distinct()
                    .toList();
            return true;
        } catch (RuntimeException e) {
            log.error("banners.yml을 읽지 못해 이전 목록을 유지한다(배너 {}건). "
                    + "파일을 고친 뒤 POST /api/reload로 다시 시도한다.", all.size(), e);
            return false;
        }
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

    /**
     * brands.yml이 모르는 배너 브랜드 표기.
     *
     * <p>이 목록에 이름이 있으면 그 배너는 뜨긴 뜨지만 로고를 못 찾아 폴백
     * 글자가 나오고, 오퍼로 세워도 기존 브랜드 카드와 안 합쳐진다. 파일을
     * 고친 사람이 바로 알 수 있게 {@code POST /api/reload} 응답에 싣는다 —
     * 2026-08-22에 goobne·hosigi가 그렇게 폴백 글자로 떴다.
     */
    public List<String> unknownBrands() {
        return unknownBrands;
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
                    Banner banner = toBanner((Map<String, Object>) map, brands);
                    if (banner != null) parsed.add(banner);
                }
            }
            return List.copyOf(parsed);
        } catch (IOException e) {
            // 파일이 사라졌거나 못 읽는 경우. 부르는 쪽(reload)이 이전 목록을
            // 유지하도록 예외 종류를 맞춘다.
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
    private static Banner toBanner(Map<String, Object> attrs, BrandCatalog brands) {
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
        // 별칭표에 없는 이름은 canonical이 그대로 돌려준다 — 대표명을 직접
        // 적은 배너(BBQ, bhc, 파파존스)는 지금처럼 그냥 통과한다. 표기가
        // 대소문자만 다르면 여전히 못 잡는다. 그때는 brands.yml에 그 표기를
        // 별칭으로 한 줄 더 적는다.
        String brand = text(attrs.get("brand"));
        return new Banner(
                id,
                brand == null ? null : brands.canonical(brand),
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
