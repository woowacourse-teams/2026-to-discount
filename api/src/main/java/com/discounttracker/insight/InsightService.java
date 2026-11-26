package com.discounttracker.insight;

import com.discounttracker.history.BrandDay;
import com.discounttracker.history.DayState;
import com.discounttracker.history.HistoryRepository;
import com.discounttracker.history.OfferHistory;
import com.discounttracker.offer.DiscountTier;
import com.discounttracker.offer.Membership;
import com.discounttracker.offer.OfferRecord;
import com.discounttracker.offer.OfferRepository;
import org.springframework.stereotype.Service;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

/**
 * GET /api/insight 집계(mono #403 1단계, A~D와 F). 계약은 이슈 #403 "집계 규칙"과 응답 계약을 따른다.
 *
 * <p>못 본 날(unknown, uncollected, 행 없음)은 직전 믿을 값을 14일까지 이어 쓰고, 넘으면 null이다.
 * 실제로 없다고 본 날(absent)만 0이다. 미관측을 0으로 내면 "할인 없음"이 관측처럼 보인다(AGENTS.md).
 */
@Service
public class InsightService {

    public static final List<String> PLATFORMS = List.of("baemin", "coupangeats", "yogiyo", "ddangyo");
    static final int CARRY_DAYS = 14;
    static final LocalDate COHORT_FROM = LocalDate.of(2026, 9, 14);
    static final double COHORT_SHARE = 0.9;
    static final LocalDate COMPARE_FROM = LocalDate.of(2026, 8, 10);
    static final int MIN_N = 30;
    static final String CONDITIONS = "폰 계정 하나, 주소 한 곳 기준. 계정별 타겟딜 제외";
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");

    private final HistoryRepository history;
    private final OfferRepository offers;
    private final Clock clock;
    private volatile Cached cached;

    private record Cached(OfferHistory history, List<OfferRecord> offers, LocalDate today, Map<String, Object> body) {}

    public InsightService(HistoryRepository history, OfferRepository offers, Clock clock) {
        this.history = history;
        this.offers = offers;
        this.clock = clock;
    }

    /** 이력이나 원장이 다시 읽히거나(참조가 바뀜) 날짜가 바뀔 때만 다시 센다. */
    public Map<String, Object> insight() {
        OfferHistory h = history.current();
        List<OfferRecord> o = offers.findAll();
        LocalDate today = LocalDate.now(clock);
        Cached c = cached;
        if (c != null && c.history == h && c.offers == o && c.today.equals(today)) return c.body;
        Map<String, Object> body = compute(h, o, ZonedDateTime.now(clock));
        cached = new Cached(h, o, today, body);
        return body;
    }

    /** 한 쌍(앱, 브랜드)의 날짜별 값. v는 null(값 없음), 0(실제 없음), 금액. obs가 false면 이어 쓴 값이다. */
    static final class Series {
        final String platform;
        final String brand;
        final Integer[] v;
        final boolean[] obs;
        final boolean[] unknown;

        Series(String platform, String brand, int n) {
            this.platform = platform;
            this.brand = brand;
            this.v = new Integer[n];
            this.obs = new boolean[n];
            this.unknown = new boolean[n];
        }

        boolean on(int i) { return v[i] != null && v[i] > 0; }
    }

    static List<Series> series(OfferHistory h, List<LocalDate> dates) {
        Map<String, Map<LocalDate, BrandDay>> rows = new TreeMap<>();
        for (BrandDay d : h.days()) {
            if (!PLATFORMS.contains(d.platform())) continue;
            rows.computeIfAbsent(d.platform() + "|" + d.brand(), k -> new HashMap<>()).put(d.date(), d);
        }
        List<Series> out = new ArrayList<>();
        for (var e : rows.entrySet()) {
            String[] key = e.getKey().split("\\|", 2);
            Series s = new Series(key[0], key[1], dates.size());
            Integer last = null;
            LocalDate lastOn = null;
            for (int i = 0; i < dates.size(); i++) {
                LocalDate date = dates.get(i);
                BrandDay r = e.getValue().get(date);
                Integer seen = r == null ? null : r.state() == DayState.ABSENT ? Integer.valueOf(0) : r.trustedAmount();
                s.unknown[i] = r != null && r.state() == DayState.UNKNOWN;
                if (seen != null) {
                    last = seen;
                    lastOn = date;
                    s.v[i] = seen;
                    s.obs[i] = true;
                } else if (lastOn != null && ChronoUnit.DAYS.between(lastOn, date) <= CARRY_DAYS) {
                    s.v[i] = last;
                }
            }
            out.add(s);
        }
        return out;
    }

    public static Map<String, Object> compute(OfferHistory h, List<OfferRecord> offerRecords, ZonedDateTime now) {
        List<LocalDate> dates = new ArrayList<>(h.coverage().keySet());
        List<Series> all = series(h, dates);
        int last = dates.size() - 1;
        LocalDate lastDate = last >= 0 ? dates.get(last) : null;
        int ci = 0;
        while (ci < dates.size() && dates.get(ci).isBefore(COMPARE_FROM)) ci++;
        LocalDate today = now.toLocalDate();
        List<OfferRecord> live = offerRecords.stream().filter(o -> !o.isExpired(today)).toList();

        // 주(월요일 시작). 히트맵과 변동이 같이 쓴다.
        List<LocalDate> weeks = new ArrayList<>();
        int[] weekOf = new int[dates.size()];
        for (int i = ci; i < dates.size(); i++) {
            LocalDate w = dates.get(i).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            if (weeks.isEmpty() || !weeks.get(weeks.size() - 1).equals(w)) weeks.add(w);
            weekOf[i] = weeks.size() - 1;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", now.format(STAMP));
        Map<String, Object> range = new LinkedHashMap<>();
        range.put("from", last >= 0 ? dates.get(0).toString() : null);
        range.put("to", lastDate != null ? lastDate.toString() : null);
        range.put("compareFrom", COMPARE_FROM.toString());
        out.put("range", range);
        out.put("platforms", PLATFORMS);
        out.put("today", today(all, dates, last, live, today));
        out.put("trend", trend(h, all, dates, ci));
        out.put("heatmap", heatmap(all, dates, ci, weeks, weekOf));
        out.put("compare", compare(all, ci, dates.size()));
        out.put("offers", offers(live, today));
        out.put("changes", changes(all, ci, dates.size(), weeks, weekOf));
        out.put("coverage", coverage(h));
        return out;
    }

    private static Map<String, Object> today(List<Series> all, List<LocalDate> dates, int last,
                                             List<OfferRecord> live, LocalDate today) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("date", last >= 0 ? dates.get(last).toString() : null);
        Map<String, Integer> active = perPlatform(0);
        List<Series> on = last >= 0 ? all.stream().filter(s -> s.on(last)).toList() : List.of();
        on.forEach(s -> active.merge(s.platform, 1, Integer::sum));
        out.put("activeBrands", active);
        out.put("top", on.stream()
                .sorted(Comparator.comparing((Series s) -> -s.v[last]).thenComparing(s -> s.brand))
                .limit(3)
                .map(s -> row("brand", s.brand, "platform", s.platform, "amount", s.v[last]))
                .toList());
        int fresh = 0;
        if (last >= 0) {
            LocalDate since = dates.get(last).minusDays(6);
            for (Series s : all) {
                for (int i = 0; i <= last; i++) {
                    if (!s.on(i)) continue;
                    if (!dates.get(i).isBefore(since)) fresh++;
                    break;
                }
            }
        }
        out.put("newThisWeek", fresh);
        Integer ending = null;
        if (!live.isEmpty()) {
            ending = (int) live.stream().map(o -> remaining(o, today)).filter(d -> d != null && d <= 7).count();
        }
        out.put("endingSoon", ending);
        return out;
    }

    private static Map<String, Object> trend(OfferHistory h, List<Series> all, List<LocalDate> dates, int ci) {
        // 고정 묶음: 09-14 이후 값(이어 쓴 값, 0 포함)이 있는 날이 90% 이상인 브랜드.
        List<Integer> cd = new ArrayList<>();
        for (int i = 0; i < dates.size(); i++) if (!dates.get(i).isBefore(COHORT_FROM)) cd.add(i);
        List<Series> cohort = all.stream().filter(s -> !cd.isEmpty()
                && cd.stream().filter(i -> s.v[i] != null).count() >= COHORT_SHARE * cd.size()).toList();
        Map<String, Integer> size = perPlatform(0);
        cohort.forEach(s -> size.merge(s.platform, 1, Integer::sum));

        // 플랫폼별로 한 번만 나눠 둔다. 날짜마다 전체를 다시 훑지 않는다.
        Map<String, List<Series>> allBy = all.stream().collect(Collectors.groupingBy(s -> s.platform));
        Map<String, List<Series>> cohortBy = cohort.stream().collect(Collectors.groupingBy(s -> s.platform));
        List<Map<String, Object>> days = new ArrayList<>();
        for (int i = ci; i < dates.size(); i++) {
            final int d = i;
            Map<String, Object> median = new LinkedHashMap<>();
            Map<String, Object> active = new LinkedHashMap<>();
            Map<String, Object> carried = new LinkedHashMap<>();
            Map<String, Object> max = new LinkedHashMap<>();
            Map<String, Object> sum = new LinkedHashMap<>();
            Map<String, Object> firstCome = new LinkedHashMap<>();
            for (String p : PLATFORMS) {
                firstCome.put(p, h.firstCome(dates.get(d), p));
                median.put(p, median(cohortBy.getOrDefault(p, List.of()).stream().filter(s -> s.on(d)).map(s -> s.v[d]).toList()));
                List<Series> on = allBy.getOrDefault(p, List.of()).stream().filter(s -> s.on(d)).toList();
                active.put(p, on.size());
                carried.put(p, on.isEmpty() ? null : round(on.stream().filter(s -> !s.obs[d]).count() / (double) on.size()));
                // 날짜별 지표(2026-11-19 사용자): 그날 할인 중 브랜드의 최고 금액, 브랜드별 최고 금액의 합. 할인 중 브랜드가 없으면 null.
                max.put(p, on.isEmpty() ? null : on.stream().mapToInt(s -> s.v[d]).max().getAsInt());
                sum.put(p, on.isEmpty() ? null : on.stream().mapToInt(s -> s.v[d]).sum());
            }
            days.add(row("date", dates.get(i).toString(), "median", median, "active", active, "carriedShare", carried,
                    "max", max, "sum", sum, "firstCome", firstCome));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cohortSize", size);
        out.put("days", days);
        return out;
    }

    private static Map<String, Object> heatmap(List<Series> all, List<LocalDate> dates, int ci,
                                               List<LocalDate> weeks, int[] weekOf) {
        Map<String, List<Series>> byBrand = byBrand(all);
        Map<String, Integer> filled = new HashMap<>();
        for (Series s : all) {
            int n = 0;
            for (int i = ci; i < dates.size(); i++) if (s.on(i)) n++;
            filled.merge(s.brand, n, Integer::sum);
        }
        List<String> top = filled.entrySet().stream().filter(e -> e.getValue() > 0)
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                .limit(30).map(Map.Entry::getKey).toList();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (String brand : top) {
            Map<String, Object> cells = new LinkedHashMap<>();
            for (String p : PLATFORMS) {
                Series s = byBrand.get(brand).stream().filter(x -> x.platform.equals(p)).findFirst().orElse(null);
                List<Map<String, Object>> cell = new ArrayList<>(Collections.nCopies(weeks.size(), null));
                if (s != null) {
                    Integer[] max = new Integer[weeks.size()];
                    boolean[] seen = new boolean[weeks.size()];
                    for (int i = ci; i < dates.size(); i++) {
                        if (s.v[i] == null) continue;
                        int w = weekOf[i];
                        if (max[w] == null || s.v[i] > max[w]) { max[w] = s.v[i]; seen[w] = s.obs[i]; }
                        else if (s.v[i].equals(max[w]) && s.obs[i]) seen[w] = true;
                    }
                    for (int w = 0; w < weeks.size(); w++)
                        if (max[w] != null) cell.set(w, row("max", max[w], "carried", !seen[w]));
                }
                cells.put(p, cell);
            }
            rows.add(row("brand", brand, "cells", cells));
        }
        // 지난 7일: 마지막 날 대 7일 전.
        List<Map<String, Object>> up = List.of(), down = List.of();
        int i7 = dates.isEmpty() ? -1 : dates.indexOf(dates.get(dates.size() - 1).minusDays(7));
        if (i7 >= 0) {
            int z = dates.size() - 1;
            List<Series> moved = all.stream()
                    .filter(s -> s.v[i7] != null && s.v[z] != null && !s.v[i7].equals(s.v[z])).toList();
            Comparator<Series> byDelta = Comparator.comparingInt(s -> s.v[z] - s.v[i7]);
            up = moved.stream().filter(s -> s.v[z] > s.v[i7]).sorted(byDelta.reversed().thenComparing(s -> s.brand))
                    .limit(5).map(s -> mover(s, i7, z)).toList();
            down = moved.stream().filter(s -> s.v[z] < s.v[i7]).sorted(byDelta.thenComparing(s -> s.brand))
                    .limit(5).map(s -> mover(s, i7, z)).toList();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("weeks", weeks.stream().map(LocalDate::toString).toList());
        out.put("rows", rows);
        out.put("movers", row("up", up, "down", down));
        return out;
    }

    private static Map<String, Object> mover(Series s, int from, int to) {
        return row("brand", s.brand, "platform", s.platform, "from", s.v[from], "to", s.v[to]);
    }

    /**
     * 같은 날 같은 브랜드를 두 앱 이상이 값(>0)으로 가질 때 최대인 앱을 센다(동률은 각각).
     * unknown인 날의 값은 이어 쓴 값이라도 뺀다(관측이 아니다).
     * ponytail: 랜덤 쿠폰만 있는 쌍은 못 뺀다 — history.json 행에 확실성이 없다. tracker가 행에 실으면 여기서 거른다.
     */
    private static Map<String, Object> compare(List<Series> all, int ci, int n) {
        int total = 0, totalObs = 0;
        Map<String, Integer> wins = perPlatform(0), winsObs = perPlatform(0);
        for (List<Series> ps : byBrand(all).values()) {
            if (ps.size() < 2) continue;
            for (int i = ci; i < n; i++) {
                final int d = i;
                List<Series> v = ps.stream().filter(s -> s.on(d) && !s.unknown[d]).toList();
                if (v.size() < 2) continue;
                int top = v.stream().mapToInt(s -> s.v[d]).max().getAsInt();
                List<Series> w = v.stream().filter(s -> s.v[d] == top).toList();
                total++;
                w.forEach(s -> wins.merge(s.platform, 1, Integer::sum));
                if (v.stream().allMatch(s -> s.obs[d])) {
                    totalObs++;
                    w.forEach(s -> winsObs.merge(s.platform, 1, Integer::sum));
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("withCarried", share(total, wins));
        out.put("observedOnly", share(totalObs, winsObs));
        return out;
    }

    /** 분모가 MIN_N 미만이면 비율을 내지 않는다(null). */
    static Map<String, Object> share(int n, Map<String, Integer> wins) {
        Map<String, Object> share = new LinkedHashMap<>();
        for (String p : PLATFORMS) share.put(p, n < MIN_N ? null : round(wins.get(p) / (double) n));
        return row("n", n, "share", share);
    }

    private static Map<String, Object> offers(List<OfferRecord> live, LocalDate today) {
        Map<String, Object> byPlatform = new LinkedHashMap<>();
        for (String p : PLATFORMS) {
            List<OfferRecord> mine = live.stream().filter(o -> p.equals(o.platform())).toList();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("n", mine.size());
            m.put("coupon", mine.stream().filter(o -> "coupon".equals(o.offerType())).count());
            m.put("discount", mine.stream().filter(o -> "discount".equals(o.offerType())).count());
            m.put("membership", mine.stream().filter(InsightService::needsMembership).count());
            m.put("tiers", mine.stream().filter(o -> o.tiers() != null && o.tiers().size() > 1).count());
            m.put("pickup", mine.stream().filter(o -> o.tiers() != null
                    && o.tiers().stream().anyMatch(t -> "포장".equals(t.channel()))).count());
            byPlatform.put(p, m);
        }
        Map<String, Integer> remaining = new LinkedHashMap<>();
        for (String k : List.of("0-3", "4-7", "8-14", "15-30", "31+", "unknown")) remaining.put(k, 0);
        for (OfferRecord o : live) {
            Integer d = remaining(o, today);
            String k = d == null ? "unknown" : d <= 3 ? "0-3" : d <= 7 ? "4-7" : d <= 14 ? "8-14" : d <= 30 ? "15-30" : "31+";
            remaining.merge(k, 1, Integer::sum);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", live.size());
        out.put("byPlatform", byPlatform);
        out.put("remainingDays", remaining);
        return out;
    }

    private static boolean needsMembership(OfferRecord o) {
        if (Membership.from(o.membership()).restriction() > 0) return true;
        return o.tiers() != null && o.tiers().stream().map(DiscountTier::membershipTier).anyMatch(m -> m.restriction() > 0);
    }

    /** 레코드 종료일까지 남은 날. 모르거나 형식이 깨졌으면 null. */
    private static Integer remaining(OfferRecord o, LocalDate today) {
        if (o.expiresAt() == null) return null;
        try {
            return (int) ChronoUnit.DAYS.between(today, LocalDate.parse(o.expiresAt()));
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** 주마다 시작(없음/0 → 값), 끝(값 → 실제 0), 금액 변경(값 → 다른 값). 못 본 날(null)로 가는 것은 끝이 아니다. */
    private static Map<String, Object> changes(List<Series> all, int ci, int n, List<LocalDate> weeks, int[] weekOf) {
        Map<String, int[]> started = new LinkedHashMap<>(), ended = new LinkedHashMap<>(), changed = new LinkedHashMap<>();
        for (String p : PLATFORMS) {
            started.put(p, new int[weeks.size()]);
            ended.put(p, new int[weeks.size()]);
            changed.put(p, new int[weeks.size()]);
        }
        for (Series s : all) {
            for (int i = Math.max(ci, 1); i < n; i++) {
                Integer prev = s.v[i - 1], cur = s.v[i];
                int w = weekOf[i];
                if (s.on(i) && (prev == null || prev == 0)) started.get(s.platform)[w]++;
                else if (cur != null && cur == 0 && prev != null && prev > 0) ended.get(s.platform)[w]++;
                else if (s.on(i) && prev > 0 && !prev.equals(cur)) changed.get(s.platform)[w]++;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("weeks", weeks.stream().map(LocalDate::toString).toList());
        out.put("started", started);
        out.put("ended", ended);
        out.put("amountChanged", changed);
        return out;
    }

    private static Map<String, Object> coverage(OfferHistory h) {
        List<Map<String, Object>> days = new ArrayList<>();
        h.coverage().forEach((d, ps) -> days.add(row("date", d.toString(),
                "platforms", PLATFORMS.stream().filter(ps::contains).toList())));
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (DayState s : DayState.values()) counts.put(s.name().toLowerCase(Locale.ROOT), 0);
        h.days().forEach(d -> counts.merge(d.state().name().toLowerCase(Locale.ROOT), 1, Integer::sum));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", days);
        out.put("stateCounts", counts);
        out.put("conditions", CONDITIONS);
        return out;
    }

    private static Map<String, List<Series>> byBrand(List<Series> all) {
        Map<String, List<Series>> m = new TreeMap<>();
        all.forEach(s -> m.computeIfAbsent(s.brand, k -> new ArrayList<>()).add(s));
        return m;
    }

    private static Map<String, Integer> perPlatform(int zero) {
        Map<String, Integer> m = new LinkedHashMap<>();
        PLATFORMS.forEach(p -> m.put(p, zero));
        return m;
    }

    private static Integer median(List<Integer> xs) {
        if (xs.isEmpty()) return null;
        List<Integer> s = xs.stream().sorted().toList();
        int k = s.size() / 2;
        return s.size() % 2 == 1 ? s.get(k) : (int) Math.round((s.get(k - 1) + s.get(k)) / 2.0);
    }

    private static double round(double x) { return Math.round(x * 1000) / 1000.0; }

    /** null 값을 담을 수 있는 순서 있는 맵(Map.of는 null을 못 받는다). */
    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }
}
