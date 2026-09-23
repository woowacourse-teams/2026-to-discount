package com.discounttracker.banner;

import com.discounttracker.brand.BrandCatalog;
import com.discounttracker.offer.AmountKind;
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
 *
 * <p><b>두 모양 읽기는 옛 모양 전용이다(RULES 11, Task 19).</b> {@link #toBanner}가
 * {@code amount}가 문자열인지 지도인지, {@code startsOn}/{@code endsOn}(날짜)인지
 * {@code startsAt}/{@code endsAt}(시각)인지를 매번 나눠 읽는다. 지울 수 있는 조건은
 * 라이브 {@code banners.yml}에 옛 모양(문자열 {@code amount}, 옛 {@code limit}/{@code usage}/
 * {@code items}/{@code amountRange})을 쓰는 행이 0건일 때다 - 그 전에는 만료된 95장이라도
 * 다시 읽혀야 한다(RULES 9). 몇 건 남았는지는 이미 있는
 * {@code python tools/convert_banners.py --file <banners.yml>}(beggars-ops, Task 11이
 * 만든 것, 새로 만들지 않는다)로 센다 - "N장 중 M장 새 모양, K장 옛 모양 그대로"를
 * 찍어 준다. K가 0이면 지울 수 있다.
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

    /** 옛 칸과 새 칸을 같이 적은 배너의 id. reload 응답에 실어 사람이 바로 안다. */
    private volatile List<String> mixed = List.of();

    /**
     * 둘 이상이 나눠 쓴 id. {@link #reload()}가 채운다.
     *
     * <p>콘솔로 올릴 때는 {@code ops_apply.duplicate_id_problem}이 막지만, 파일을
     * 손으로 고치면 그 검사를 지나간다. id가 겹치면 "이 id의 배너"가 파일 순서로
     * 정해진다 - API는 맵을 id로 찾고 콘솔도 id로 찾는다. 읽을 때 한 번 더 본다.
     */
    private volatile List<String> duplicateIds = List.of();

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
            Map<String, Long> byId = all.stream()
                    .map(Banner::id)
                    .filter(java.util.Objects::nonNull)
                    .collect(java.util.stream.Collectors.groupingBy(id -> id,
                            java.util.stream.Collectors.counting()));
            duplicateIds = byId.entrySet().stream()
                    .filter(e -> e.getValue() > 1)
                    .map(Map.Entry::getKey)
                    .sorted()
                    .toList();
            return true;
        } catch (RuntimeException e) {
            log.error("banners.yml을 읽지 못해 이전 목록을 유지한다(배너 {}건). "
                    + "파일을 고친 뒤 POST /api/reload로 다시 시도한다.", all.size(), e);
            return false;
        }
    }

    /**
     * 오늘 이 시각에 띄울 배너. 묶음은 한 장으로 접는다.
     *
     * <p>대표(카드의 amount·url·minOrder·color를 대는 쪽, brands의 첫 자리)는 구성원 중
     * <b>원래</b> priority가 가장 작은 쪽이다. {@link #activeMembers()}는 카드 자신이
     * 다른 배너 사이에서 어디에 설지 정하려고 그룹 구성원의 priority를 그룹
     * 최솟값으로 덮어쓰므로, 대표를 고를 때는 그 전의 원래 값을 따로 봐야 한다 -
     * 안 그러면 동률로 묶인 구성원들이 id 알파벳 순으로만 갈려, priority를 가장
     * 작게 적은 사람이 아니라 id가 앞선 사람이 대표가 된다.
     *
     * <p>원래 priority도 같으면 종료 시각, 그래도 같으면 id로 가른다 - 파일에 적은
     * 순서에 기대지 않는다.
     */
    public List<Banner> active() {
        List<Banner> members = activeMembers();
        java.util.Map<String, Integer> originalPriority = all.stream()
                .collect(java.util.stream.Collectors.toMap(Banner::id, Banner::priority, (a, b) -> a));
        Comparator<Banner> byOriginalPriority = Comparator
                .comparingInt((Banner b) -> originalPriority.getOrDefault(b.id(), Banner.DEFAULT_PRIORITY))
                .thenComparing(Banner::endsAt)
                .thenComparing(Banner::id);

        List<Banner> out = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (Banner b : members) {
            if (b.group() == null) {
                out.add(b);
                continue;
            }
            if (!seen.add(b.group())) continue;
            List<Banner> mates = members.stream().filter(m -> b.group().equals(m.group()))
                    .sorted(byOriginalPriority).toList();
            Banner lead = mates.get(0);
            List<String> names = mates.stream().map(Banner::brand).filter(java.util.Objects::nonNull).toList();
            out.add(lead.toBuilder()
                    .brands(names)
                    .brandLabels(names.stream().map(n -> brands.find(n).display()).toList())
                    .build());
        }
        return List.copyOf(out);
    }

    /** 묶음을 안 접은 구성원 전부. 오퍼는 브랜드마다 하나씩 서므로 이쪽을 쓴다. */
    public List<Banner> activeMembers() {
        java.time.LocalDateTime now = java.time.LocalDateTime.now(clock);
        java.util.Map<String, Integer> groupPriority = new java.util.HashMap<>();
        List<Banner> live = all.stream().filter(b -> b.activeAt(now)).toList();
        for (Banner b : live) {
            if (b.group() != null) {
                groupPriority.merge(b.group(), b.priority(), Math::min);
            }
        }
        return live.stream()
                .map(b -> b.group() == null ? b
                        : b.toBuilder().priority(groupPriority.get(b.group())).build())
                .sorted(Comparator.comparingInt(Banner::priority).thenComparing(Banner::endsAt)
                        .thenComparing(Banner::id))
                .map(b -> b.resolvedFor(now.toLocalDate()))
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

    /**
     * 필수 필드(id, url, 시작·종료 시각)가 빠져 버린 항목의 id.
     *
     * <p>Task 6부터 amount·period는 더는 필수가 아니다 - 문장 칸이 비어도 구조 칸
     * ({@code amount:} 덩이)에서 만들 수 있기 때문이다.
     */
    /** 둘 이상이 나눠 쓴 id. 비어 있어야 정상이다. */
    public List<String> duplicateIds() {
        return duplicateIds;
    }

    public List<String> dropped() {
        return dropped;
    }

    public List<String> mixedShape() {
        return mixed;
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
            List<String> mixedIds = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    if (mixedShape((Map<String, Object>) map)) {
                        mixedIds.add(map.get("id") == null ? "(id 없음)" : String.valueOf(map.get("id")));
                    }
                    Banner banner = toBanner((Map<String, Object>) map, brands);
                    if (banner != null) parsed.add(banner);
                    else skipped.add(map.get("id") == null ? "(id 없음)" : String.valueOf(map.get("id")));
                }
            }
            dropped = List.copyOf(skipped);
            mixed = List.copyOf(mixedIds);
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
        // 구조 필드(설계 25, 2026-09-18). 문장 칸(amount, period, extra)이 비어 있으면
        // 여기서 만든다. 적혀 있으면 그 문장이 이긴다(이행 기간 규칙).
        BannerSpec spec;
        try {
            spec = spec(attrs);
        } catch (IllegalArgumentException e) {
            return null;
        }
        java.time.LocalDateTime startsAt = moment(attrs.get("startsAt"), attrs.get("startsOn"), false);
        java.time.LocalDateTime endsAt = moment(attrs.get("endsAt"), attrs.get("endsOn"), true);
        BannerAmount amountSpec;
        try {
            amountSpec = BannerAmount.of(attrs.get("amount"));
        } catch (IllegalArgumentException e) {
            return null;
        }
        String amount = attrs.get("amount") instanceof String s ? s : null;
        String period = text(attrs.get("period"));
        String extraForLegacy = text(attrs.get("extra"));
        // 옛 배너(RULES 8·9로 그대로 남은, 문장 칸뿐인 배너들)는 firstCome/targeted/
        // amountSpec이 비어 있을 수 있다. 웹의 bannerTag는 이제 그 세 칸만 읽으므로
        // (Task 18) 여기서 한 번만 옛 limit/usage 칸으로 채운다. 새로 적는 배너가
        // firstCome/targeted를 직접 쓰면 그 값이 이긴다.
        //
        // period·extra 문장을 정규식으로 되짚는 길은 만들지 않는다(fix round 2,
        // 리뷰어 지적). "적립금은 본 행사에 사용 불가", "가을맞이 신규 오픈 매장
        // 한정" 같은 문장이 오탐을 낸다 - 이 재설계 자체가 생성 문구를 다시 파싱해서
        // 틀린 답을 내던 자리를 없애려는 것이었고, RULES 9로 옛 모양 배너가 무기한
        // 남으므로 "이행기용" 파서는 만료되지 않는다. 실측(운영 파일 확인, fix round
        // 2)으로 확인한 살아있는 배너 9장은 운영자가 firstCome/limit을 직접 적어서
        // 해결했다 - 문장 파싱 없이도 표식이 산다.
        String legacyLimit = text(attrs.get("limit"));
        String firstCome = text(attrs.get("firstCome"));
        if (firstCome == null && "first_come".equals(legacyLimit)) {
            String usage = text(attrs.get("usage"));
            firstCome = usage != null ? usage : "use";
        }
        Boolean targeted = flag(attrs.get("targeted"));
        if (targeted == null && "targeted".equals(legacyLimit)) targeted = true;
        // 캐시백·랜덤은 amountSpec.kind/amountSpec.random에 산다 - bannerTag가 거기서
        // 읽는다. 옛 배너는 amount가 문자열이라 amountSpec이 아예 null로 오므로, limit만
        // 남아 있으면 표식이 필요로 하는 최소한의 값만 채운 amountSpec을 만든다.
        if (amountSpec == null && "cashback".equals(legacyLimit)) {
            amountSpec = new BannerAmount(null, null, null, false, AmountKind.CASHBACK);
        } else if (amountSpec == null && "random".equals(legacyLimit)) {
            amountSpec = new BannerAmount(null, null, null, true, AmountKind.DISCOUNT);
        }
        // platform은 선택이다(2026-09-18). 없거나 "own"이면 브랜드 자체 앱이나
        // 사이트의 행사다 — 뚜레쥬르 네이버페이 적립처럼 배달앱 밖에서 여는 행사가
        // 얼마든지 있다. 나중에 다른 플랫폼을 더할 때도 이 자리는 그대로다.
        if (id == null || url == null || startsAt == null || endsAt == null) return null;

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
        if (brand == null && many != null) brand = many.get(0);
        Integer minOrder = number(attrs.get("minOrder"));
        String extra = extraForLegacy;
        Banner banner = Banner.of(id, url)
                .brand(brand == null ? null : brands.canonical(brand))
                .platform(platform)
                .minOrder(minOrder)
                .color(text(attrs.get("color")))
                .startsAt(startsAt)
                .endsAt(endsAt)
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
                .group(text(attrs.get("group")))
                .via(text(attrs.get("via")))
                .amountSpec(amountSpec)
                .targeted(targeted)
                .firstCome(firstCome)
                .untilSoldOut(flag(attrs.get("untilSoldOut")))
                .amount(amount)
                .period(period)
                .extra(extra)
                .build();
        // 문장 칸이 비면 구조 칸에서 만든다. 적혀 있으면 그 문장이 이긴다(이행 기간 규칙).
        return banner.toBuilder()
                .amount(amount != null ? amount : BannerText.amount(amountSpec))
                .period(period != null ? period : BannerText.period(banner))
                .extra(banner.extra() != null ? banner.extra() : BannerText.extra(banner))
                .build();
    }

    /** yml의 문구 칸을 읽는다. 하나도 없으면 null. */
    private static BannerSpec spec(Map<String, Object> attrs) {
        BannerSpec spec = new BannerSpec(text(attrs.get("opensAt")), text(attrs.get("channel")),
                text(attrs.get("membership")), text(attrs.get("event")), text(attrs.get("note")));
        return spec.isEmpty() ? null : spec;
    }

    /** 옛 날짜 칸과 새 시각 칸을 다 받는다. 날짜만 있으면 하루의 시작과 끝으로 채운다. */
    private static java.time.LocalDateTime moment(Object at, Object on, boolean endOfDay) {
        // 따옴표 없는 2026-09-24T09:00:00을 snakeyaml이 Date로 만든다. 그 toString은
        // "Thu Sep 24 09:00:00 KST 2026"이라 LocalDateTime.parse가 못 읽고, 배너가
        // 통째로 버려졌다 - 날짜 칸(date)은 이미 이 처리를 하는데 시각 칸만 빠져
        // 있었다(2026-09-24). yml은 시각을 UTC로 읽으므로 같은 시간대로 되돌린다.
        if (at instanceof Date d) {
            return d.toInstant().atZone(ZoneOffset.UTC).toLocalDateTime();
        }
        String s = text(at);
        if (s != null) {
            try {
                return java.time.LocalDateTime.parse(s.replace(" ", "T"));
            } catch (java.time.format.DateTimeParseException e) {
                return null;
            }
        }
        LocalDate d = date(on);
        if (d == null) return null;
        return endOfDay ? d.atTime(23, 59) : d.atStartOfDay();
    }

    /** 옛 칸과 새 칸을 같이 적었나. 어느 쪽이 이기는지 파일만 봐서는 모른다(드리프트 2). */
    private static boolean mixedShape(Map<String, Object> attrs) {
        boolean dates = attrs.get("startsOn") != null || attrs.get("endsOn") != null;
        boolean moments = attrs.get("startsAt") != null || attrs.get("endsAt") != null;
        boolean sentences = attrs.get("amount") instanceof String
                || attrs.get("period") != null || attrs.get("extra") != null;
        boolean structured = attrs.get("amount") instanceof Map<?, ?>;
        return (dates && moments) || (sentences && structured);
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
