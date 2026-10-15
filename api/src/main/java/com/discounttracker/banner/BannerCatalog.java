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
 * <p>파일은 새 모양만 읽는다. 문장 칸(문자열 {@code amount}, {@code period}, {@code extra}),
 * 날짜 칸({@code startsOn}/{@code endsOn}), 옛 {@code limit}/{@code usage}를 읽던 길은
 * 2026-10-15에 운영 파일의 옛 모양이 0장이 되어 지웠다(tracker REFACTOR-BACKLOG Task 19).
 * 옛 배너 원본은 beggars-ops {@code archive/}에 있다.
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

    /**
     * 버린 항목의 id별 사유. {@link #reload()}가 채운다.
     *
     * <p>2026-09-30에 쿠팡이츠 오픈 배너 3장이 {@code dropped}에만 이름을 남기고 사라졌다.
     * 원인(내리기 op가 시작보다 앞선 끝을 적었다)을 찾으려고 파일을 다시 읽어 되짚어야 했다.
     * reload 응답과 로그에 사유를 같이 싣는다.
     */
    private volatile Map<String, String> droppedReasons = Map.of();

    /**
     * 둘 이상이 나눠 쓴 id. {@link #reload()}가 채운다.
     *
     * <p>콘솔로 올릴 때는 beggars-ops 저장소 {@code ops_apply.duplicate_id_problem}이 막지만, 파일을
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
            brokenGroupsLogged.clear();
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
                .thenComparing(BannerCatalog::opensAtKey)
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
            String broken = groupRuleBreak(mates);
            if (broken != null) {
                // 묶음 규칙(확정 규칙 4절, 2026-09-29 사용자 결정)을 어긴 묶음은 조용히 접지 않는다.
                // 접으면 카드의 링크와 기간이 대표 것 하나라 다른 구성원에 대해 거짓말을 한다.
                // 구성원을 각자 한 장으로 두고 남긴다. 파일은 사람이 고친다.
                if (brokenGroupsLogged.add(b.group())) {
                    log.warn("묶음 {}의 {}가 구성원마다 달라 접지 않고 따로 띄운다: {}", b.group(), broken,
                            mates.stream().map(Banner::id).toList());
                }
                out.addAll(mates);
                continue;
            }
            Banner lead = mates.get(0);
            List<String> names = mates.stream().map(Banner::brand).filter(java.util.Objects::nonNull).toList();
            // 카드의 소진 표시는 구성원 전원이 소진일 때만 켠다. 대표 것 하나를 쓰면 대표만
            // 소진이어도 카드 전체가 소진으로 뜨고, 다른 구성원만 소진이면 아무 표시도 없다.
            // 누가 소진인지는 members에 구성원마다 남긴다(감사 2026-09-29 #6). 링크, 기간, 플랫폼은
            // 묶음 규칙상 모두 같으므로 대표 것이 곧 카드 것이다.
            boolean allSoldOut = mates.stream().allMatch(m -> Boolean.TRUE.equals(m.soldOut()));
            List<Banner.Member> crew = mates.stream()
                    .map(m -> new Banner.Member(m.id(), m.brand(),
                            m.brand() == null ? null : brands.find(m.brand()).display(),
                            m.amount(), m.minOrder(), Boolean.TRUE.equals(m.soldOut()),
                            m.spec() == null ? null : m.spec().opensAt()))
                    .toList();
            // 구성원마다 여는 시각이 다르면(쿠팡이츠 하루치 선착순 묶음, 2026-09-30) 카드의 기간
            // 문구는 대표 시각("오전 11시 오픈")이 아니라 시각을 뺀 하루 문구다. 시각은 members가 말한다.
            Banner base = lead;
            if (crew.stream().map(Banner.Member::opensAt).distinct().count() > 1 && lead.spec() != null) {
                BannerSpec s = lead.spec();
                BannerSpec noClock = new BannerSpec(null, s.channel(), s.membership(), s.event(), s.note());
                base = lead.toBuilder().spec(noClock.isEmpty() ? null : noClock).build();
                base = base.toBuilder().period(BannerText.period(base)).build();
            }
            out.add(base.toBuilder()
                    .brands(names)
                    .brandLabels(names.stream().map(n -> brands.find(n).display()).toList())
                    .amount(groupAmount(mates, lead))
                    .soldOut(allSoldOut)
                    .members(crew)
                    .build());
        }
        return List.copyOf(out);
    }

    /**
     * 묶음 규칙을 어긴 칸 이름. 지키면 null.
     *
     * <p>묶음은 링크(url), 기간(startsAt/endsAt), 플랫폼이 같은 배너들이다. 구성원마다 달라도
     * 되는 것은 브랜드, 금액, 최소주문, 여는 시각(opensAt)이다(확정 규칙 4절, 2026-09-29/30 사용자
     * 결정). 여는 시각은 그래서 견주지 않는다. 카드 한 장은
     * 링크 하나, 기간 하나를 보여 주므로 그래야 카드가 정직하다. 지금 살아 있는 구성원끼리만
     * 견준다 - 먼저 내린 구성원은 묶음에서 퇴장한 것이다.
     */
    static String groupRuleBreak(List<Banner> mates) {
        if (mates.stream().map(Banner::url).distinct().count() > 1) return "링크(url)";
        if (mates.stream().map(Banner::startsAt).distinct().count() > 1
                || mates.stream().map(Banner::endsAt).distinct().count() > 1) return "기간(startsAt/endsAt)";
        if (mates.stream().map(Banner::platform).distinct().count() > 1) return "플랫폼(platform)";
        return null;
    }

    /** 경고를 한 번만 남기려고 본 묶음. 요청마다 같은 줄이 쌓이지 않게 한다. reload가 비운다. */
    private final java.util.Set<String> brokenGroupsLogged = java.util.concurrent.ConcurrentHashMap.newKeySet();

    /**
     * 묶음 한 장에 찍을 금액 문구.
     *
     * <p>구성원 금액이 다르면 브랜드 늘어선 순서대로 전부 적는다({@code "8/7천원"}).
     * 대표 것 하나만 찍으면 그 값이 아닌 브랜드를 누른 사람이 속는다. 값이 전부 같거나
     * 한 명이라도 금액을 모르면 대표의 문구를 그대로 쓴다 - 반쯤 적은 목록이 더 나쁘다.
     */
    private static String groupAmount(List<Banner> mates, Banner lead) {
        List<Integer> amounts = new ArrayList<>();
        for (Banner m : mates) {
            Integer won = m.amountSpec() == null ? null : m.amountSpec().wonMax();
            if (won == null) return lead.amount();
            amounts.add(won);
        }
        if (amounts.stream().distinct().count() <= 1) return lead.amount();
        String joined = BannerText.joinAmounts(amounts);
        if (joined == null) return lead.amount();
        // 구성원 전원이 상한("최대 N원", won: [null, N])이면 나열도 상한이다. 앞말을 빼면
        // 쿠팡이츠 뽑기 행사 묶음이 "10/8천원"으로 떠 확정 금액처럼 읽힌다(2026-09-29).
        boolean allCaps = mates.stream().allMatch(m -> m.amountSpec().isRange() && m.amountSpec().wonMin() == null);
        return allCaps ? "최대 " + joined : joined;
    }

    /**
     * 같은 priority·같은 종료 시각이면 여는 시각(opensAt "HH:MM") 순. 없으면 뒤로.
     *
     * <p>2026-09-30: 쿠팡이츠 선착순 오픈이 전부 priority 6, 종료 23:59:59라 id 글자 순으로 갈렸고
     * `…-17시`가 `…-9시`보다 앞서 09시 오픈이 맨 뒤에 섰다(전날에도 같은 뒤집힘).
     */
    static String opensAtKey(Banner b) {
        String at = b.spec() == null ? null : b.spec().opensAt();
        if (at == null || at.isBlank()) return "99:99";
        String[] hm = at.trim().split(":");
        try {
            return String.format("%02d:%02d", Integer.parseInt(hm[0]), hm.length > 1 ? Integer.parseInt(hm[1]) : 0);
        } catch (NumberFormatException e) {
            return "99:99";
        }
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
                        .thenComparing(BannerCatalog::opensAtKey).thenComparing(Banner::id))
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
     * <p>{@code amount}는 필수가 아니다. 화면 문구는 구조 칸({@code amount:} 덩이)에서 만든다.
     */
    /** {@link #dropped()}의 id별 사유. 파일 순서를 지킨다. */
    public Map<String, String> droppedReasons() {
        return droppedReasons;
    }

    /** 둘 이상이 나눠 쓴 id. 비어 있어야 정상이다. */
    public List<String> duplicateIds() {
        return duplicateIds;
    }

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
            Map<String, String> reasons = new java.util.LinkedHashMap<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    String[] why = new String[1];
                    Banner banner = toBanner((Map<String, Object>) map, brands, r -> why[0] = r);
                    if (banner != null) {
                        parsed.add(banner);
                    } else {
                        String bid = map.get("id") == null ? "(id 없음)" : String.valueOf(map.get("id"));
                        skipped.add(bid);
                        reasons.merge(bid, why[0] == null ? "사유 모름" : why[0], (a, b) -> a + "; " + b);
                        log.warn("배너 {}를 건너뛴다: {}", bid, reasons.get(bid));
                    }
                }
            }
            dropped = List.copyOf(skipped);
            droppedReasons = java.util.Collections.unmodifiableMap(reasons);
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
    private static Banner toBanner(Map<String, Object> attrs, BrandCatalog brands,
                                   java.util.function.Consumer<String> why) {
        String id = text(attrs.get("id"));
        // 비우면 "own"으로 통일한다 — 응답에서 null과 값을 섞지 않는다(2026-09-18 사용자 결정).
        String platform = text(attrs.get("platform"));
        if (platform == null) platform = Banner.OWN;
        String url = text(attrs.get("url"));
        BannerSpec spec;
        try {
            spec = spec(attrs);
        } catch (IllegalArgumentException e) {
            why.accept("문구 칸을 못 읽었다: " + e.getMessage());
            return null;
        }
        java.time.LocalDateTime startsAt = moment(attrs.get("startsAt"));
        java.time.LocalDateTime endsAt = moment(attrs.get("endsAt"));
        // 문자열 amount("7,000원")는 옛 모양이다. 금액 없는 배너로 조용히 서지 않게 사유를 남기고 뺀다.
        if (attrs.get("amount") instanceof String) {
            why.accept("amount가 문장이다(옛 모양). amount: {won: 7000} 꼴로 적는다");
            return null;
        }
        BannerAmount amountSpec;
        try {
            amountSpec = BannerAmount.of(attrs.get("amount"));
        } catch (IllegalArgumentException e) {
            why.accept("amount를 못 읽었다: " + e.getMessage());
            return null;
        }
        // platform은 선택이다(2026-09-18). 없거나 "own"이면 브랜드 자체 앱이나
        // 사이트의 행사다 — 뚜레쥬르 네이버페이 적립처럼 배달앱 밖에서 여는 행사가
        // 얼마든지 있다. 나중에 다른 플랫폼을 더할 때도 이 자리는 그대로다.
        if (id == null || url == null || startsAt == null || endsAt == null) {
            List<String> missing = new ArrayList<>();
            if (id == null) missing.add("id");
            if (url == null) missing.add("url");
            if (startsAt == null) missing.add("startsAt");
            if (endsAt == null) missing.add("endsAt");
            why.accept("필수 칸이 비었거나 못 읽었다: " + String.join(", ", missing));
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
        if (brand == null && many != null) brand = many.get(0);
        Integer minOrder = number(attrs.get("minOrder"));
        // 끝이 시작보다 앞이면 build()가 던진다. 그 한 장만 건너뛴다(dropped).
        if (endsAt.isBefore(startsAt)) {
            why.accept("endsAt(" + endsAt + ")이 startsAt(" + startsAt + ")보다 앞이다");
            return null;
        }
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
                .targeted(flag(attrs.get("targeted")))
                .firstCome(text(attrs.get("firstCome")))
                .untilSoldOut(flag(attrs.get("untilSoldOut")))
                .build();
        // 화면 문구 셋은 구조 칸에서 만든다(설계 25).
        return banner.toBuilder()
                .amount(BannerText.amount(amountSpec))
                .period(BannerText.period(banner))
                .extra(BannerText.extra(banner))
                .build();
    }

    /** yml의 문구 칸을 읽는다. 하나도 없으면 null. */
    private static BannerSpec spec(Map<String, Object> attrs) {
        BannerSpec spec = new BannerSpec(text(attrs.get("opensAt")), text(attrs.get("channel")),
                text(attrs.get("membership")), text(attrs.get("event")), text(attrs.get("note")));
        return spec.isEmpty() ? null : spec;
    }

    /** 시각 칸을 읽는다. 못 읽으면 null이고 부르는 쪽이 그 한 장을 dropped로 돌린다. */
    private static java.time.LocalDateTime moment(Object at) {
        // 따옴표 없는 2026-09-24T09:00:00을 snakeyaml이 Date로 만든다. 그 toString은
        // "Thu Sep 24 09:00:00 KST 2026"이라 LocalDateTime.parse가 못 읽고, 배너가
        // 통째로 버려졌다(2026-09-24). yml은 시각을 UTC로 읽으므로 같은 시간대로 되돌린다.
        if (at instanceof Date d) {
            return d.toInstant().atZone(ZoneOffset.UTC).toLocalDateTime();
        }
        String s = text(at);
        if (s == null) return null;
        try {
            return java.time.LocalDateTime.parse(s.replace(" ", "T"));
        } catch (java.time.format.DateTimeParseException e) {
            return null;
        }
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
