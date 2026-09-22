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

    /**
     * 필수 필드가 빠져 버린 항목의 id. {@link #reload()}가 채운다.
     *
     * <p>2026-09-18 새벽에 {@code platform}이 없는 뚜레쥬르 배너가 조용히 빠졌고
     * {@code POST /api/reload}는 {@code bannersOk: true}를 돌려줬다. 08-22와 같은
     * 실수다: 걸러내면서 알리지 않았다.
     */
    private volatile List<String> dropped = List.of();

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
                    .flatMap(b -> b.allBrands().stream())
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
                // 매진 여부를 여기서 오늘 기준으로 굳혀 내려보낸다 — 프론트가
                // 날짜를 다시 따지면 시계가 두 곳이 되고, 자정을 넘길 때 갈린다.
                .map(b -> b.resolvedFor(today))
                .toList();
    }

    /** 기간 필터 전 전체 배너. reload 전후 알림 대상 판정에 사용한다. */
    public List<Banner> all() {
        return List.copyOf(all);
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

    /** 필수 필드(id, url, amount, period, startsOn, endsOn)가 빠져 버린 항목의 id. */
    public List<String> dropped() {
        return dropped;
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
            List<String> skipped = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Banner banner = toBanner((Map<String, Object>) map, brands);
                    if (banner != null) parsed.add(banner);
                    else skipped.add(map.get("id") == null ? "(id 없음)" : String.valueOf(map.get("id")));
                }
            }
            dropped = List.copyOf(skipped);
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
        // 비우면 "own"으로 통일한다 — 응답에서 null과 값을 섞지 않는다(2026-09-18 사용자 결정).
        String platform = text(attrs.get("platform"));
        if (platform == null) platform = Banner.OWN;
        String url = text(attrs.get("url"));
        LocalDate startsOn = date(attrs.get("startsOn"));
        LocalDate endsOn = date(attrs.get("endsOn"));
        // 구조 필드(설계 25, 2026-09-18). 문장 칸(amount, period, extra)이 비어 있으면
        // 여기서 만든다. 적혀 있으면 그 문장이 이긴다(이행 기간 규칙).
        BannerSpec spec;
        try {
            spec = spec(attrs);
        } catch (IllegalArgumentException e) {
            return null;
        }
        String amount = text(attrs.get("amount"));
        String period = text(attrs.get("period"));
        if (spec != null) {
            if (amount == null) amount = BannerText.amount(spec);
            if (period == null) period = BannerText.period(spec, startsOn, endsOn);
        }
        // platform은 선택이다(2026-09-18). 없거나 "own"이면 브랜드 자체 앱이나
        // 사이트의 행사다 — 뚜레쥬르 네이버페이 적립처럼 배달앱 밖에서 여는 행사가
        // 얼마든지 있다. 나중에 다른 플랫폼을 더할 때도 이 자리는 그대로다.
        if (id == null || url == null
                || amount == null || period == null || startsOn == null || endsOn == null) {
            return null;
        }

        Object priority = attrs.get("priority");
        // 별칭표에 없는 이름은 canonical이 그대로 돌려준다 — 대표명을 직접
        // 적은 배너(BBQ, bhc, 파파존스)는 지금처럼 그냥 통과한다. 표기가
        // 대소문자만 다르면 여전히 못 잡는다. 그때는 brands.yml에 그 표기를
        // 별칭으로 한 줄 더 적는다.
        String brand = text(attrs.get("brand"));
        // brands: [a, b, c] — 한 장에 묶인 브랜드. 대표(brand)를 안 적었으면
        // 첫 번째가 대표다.
        List<String> many = null;
        if (attrs.get("brands") instanceof List<?> raw) {
            many = raw.stream().map(BannerCatalog::text)
                    .filter(s -> s != null).map(brands::canonical).toList();
            if (many.isEmpty()) many = null;
        }
        if (many == null && spec != null && BannerText.brands(spec) != null) {
            many = BannerText.brands(spec).stream().map(brands::canonical).toList();
        }
        if (brand == null && many != null) brand = many.get(0);
        Integer minOrder = number(attrs.get("minOrder"));
        if (minOrder == null && spec != null) minOrder = BannerText.minOrder(spec);
        String extra = text(attrs.get("extra"));
        if (extra == null && spec != null) extra = BannerText.extra(spec, minOrder);
        return Banner.of(id, url)
                .brand(brand == null ? null : brands.canonical(brand))
                .platform(platform)
                .amount(amount)
                .period(period)
                .extra(extra)
                .minOrder(minOrder)
                .color(text(attrs.get("color")))
                .startsOn(startsOn)
                .endsOn(endsOn)
                .soldOut(flag(attrs.get("soldOut")))
                .soldOutOn(date(attrs.get("soldOutOn")))
                .priority(priority instanceof Number n ? n.intValue() : Banner.DEFAULT_PRIORITY)
                .brands(many)
                .spec(spec)
                .notify(flag(attrs.get("notify")))
                .notifyImmediately(flag(attrs.get("notifyImmediately")))
                // 화면에 쓸 짧은 이름. 로고와 비교는 대표명(many)을 그대로 쓴다.
                .brandLabels(many == null ? null
                        : many.stream().map(b -> brands.find(b).display()).toList())
                .build();
    }

    /** yml의 구조 필드를 읽는다. 하나도 없으면 null. 형이 틀리면 IllegalArgumentException. */
    @SuppressWarnings("unchecked")
    private static BannerSpec spec(Map<String, Object> attrs) {
        List<BannerSpec.BannerItem> items = null;
        if (attrs.get("items") instanceof List<?> raw) {
            items = new ArrayList<>();
            for (Object o : raw) {
                if (o instanceof Map<?, ?> m) {
                    Map<String, Object> it = (Map<String, Object>) m;
                    items.add(new BannerSpec.BannerItem(text(it.get("brand")), number(it.get("amount")),
                            number(it.get("minOrder")), text(it.get("opensAt"))));
                }
            }
            if (items.isEmpty()) items = null;
        }
        List<Integer> range = null;
        if (attrs.get("amountRange") instanceof List<?> raw) {
            range = new ArrayList<>();
            for (Object o : raw) range.add(number(o));
        }
        BannerSpec spec = new BannerSpec(items, range, text(attrs.get("opensAt")), text(attrs.get("limit")),
                text(attrs.get("usage")), text(attrs.get("channel")), text(attrs.get("membership")),
                text(attrs.get("event")), text(attrs.get("note")));
        return spec.isEmpty() ? null : spec;
    }

    /** yes/true/1 무엇으로 적어도 참으로 읽는다. 손으로 고치는 파일이다. */
    private static Boolean flag(Object value) {
        if (value instanceof Boolean b) return b;
        if (value == null) return null;
        String t = String.valueOf(value).trim().toLowerCase(java.util.Locale.ROOT);
        if (t.isEmpty()) return null;
        return t.equals("true") || t.equals("yes") || t.equals("y") || t.equals("1");
    }

    /** 선택 필드라 못 읽으면 null이다 — 항목을 통째로 버리지 않는다. */
    private static Integer number(Object value) {
        if (value instanceof Number n) return n.intValue();
        String s = text(value);
        if (s == null) return null;
        try {
            return Integer.valueOf(s.replace(",", "").replace("원", "").trim());
        } catch (NumberFormatException e) {
            return null;
        }
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
