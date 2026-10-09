package com.discounttracker.history;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** 날짜별 하루 상태 모음. 신규 판정과 최고 할인 그래프가 이것만 읽는다(설계 2026-10-09). */
public final class OfferHistory {

    public enum Novelty {
        NEW, NOT_NEW, UNKNOWN;

        public Boolean asBoolean() { return this == UNKNOWN ? null : this == NEW; }
    }

    public record Point(LocalDate date, Integer amount, String line, String reason) {}

    public record Summary(Integer maxEver, LocalDate maxEverOn, Integer current, Integer daysSinceHigher) {}

    private final Map<String, Map<LocalDate, BrandDay>> byPair = new HashMap<>();
    private final Map<String, NavigableMap<LocalDate, List<BrandDay>>> byBrand = new HashMap<>();
    private final NavigableMap<LocalDate, Set<String>> coverage;

    public OfferHistory(List<BrandDay> days, Map<LocalDate, Set<String>> coverage) {
        this.coverage = new TreeMap<>(coverage);
        for (BrandDay d : days) {
            byPair.computeIfAbsent(d.platform() + "|" + d.brand(), k -> new HashMap<>()).put(d.date(), d);
            byBrand.computeIfAbsent(d.brand(), k -> new TreeMap<>())
                    .computeIfAbsent(d.date(), k -> new ArrayList<>()).add(d);
        }
    }

    public static OfferHistory empty() { return new OfferHistory(List.of(), Map.of()); }

    public boolean isEmpty() { return coverage.isEmpty(); }

    public Novelty novelty(String platform, String brand, int amount, LocalDate today) {
        Map<LocalDate, BrandDay> pair = byPair.getOrDefault(platform + "|" + brand, Map.of());
        for (var e : coverage.headMap(today, false).descendingMap().entrySet()) {
            if (!e.getValue().contains(platform)) continue;
            BrandDay day = pair.get(e.getKey());
            if (day == null || day.state() == DayState.ABSENT) return Novelty.NEW;
            Integer max = day.trustedAmount();
            if (day.collected() && max != null) return amount > max ? Novelty.NEW : Novelty.NOT_NEW;
        }
        return Novelty.UNKNOWN;
    }

    public List<Point> bestSeries(String brand, LocalDate from, LocalDate to) {
        if (coverage.isEmpty() || to.isBefore(coverage.firstKey())) return List.of();
        NavigableMap<LocalDate, List<BrandDay>> mine = byBrand.getOrDefault(brand, new TreeMap<>());
        List<Point> out = new ArrayList<>();
        Integer lastSolid = null;
        for (var e : coverage.subMap(coverage.firstKey(), true, to, true).entrySet()) {
            LocalDate date = e.getKey();
            List<BrandDay> that = mine.getOrDefault(date, List.of());
            Integer best = that.stream().map(BrandDay::trustedAmount).filter(Objects::nonNull).max(Integer::compare).orElse(null);
            Point p = null;
            if (best != null) {
                lastSolid = best;
                p = new Point(date, best, "solid", null);
            } else if (that.stream().anyMatch(BrandDay::untrusted)) {
                if (lastSolid != null) {
                    String reason = that.stream().filter(d -> d.state() == DayState.WITHHELD && d.reason() != null)
                            .map(d -> d.reason().key()).findFirst().orElse(null);
                    p = new Point(date, lastSolid, "carried", reason);
                }
            } else if (lastSolid != null && !e.getValue().isEmpty()) {
                p = new Point(date, null, "break", null);
            }
            if (p != null && !date.isBefore(from)) out.add(p);
        }
        return out;
    }

    public Summary summary(String brand, LocalDate today) {
        LocalDate first = coverage.isEmpty() ? today : coverage.firstKey();
        List<Point> all = bestSeries(brand, first, today);
        Integer maxEver = null;
        LocalDate maxOn = null;
        for (Point p : all) {
            if ("solid".equals(p.line()) && (maxEver == null || p.amount() > maxEver)) {
                maxEver = p.amount();
                maxOn = p.date();
            }
        }
        Point last = all.isEmpty() ? null : all.get(all.size() - 1);
        Integer current = last != null && last.date().equals(today) ? last.amount() : null;
        Integer since = null;
        if (current != null) {
            for (int i = all.size() - 2; i >= 0; i--) {
                Point p = all.get(i);
                if ("solid".equals(p.line()) && p.amount() >= current) {
                    since = (int) ChronoUnit.DAYS.between(p.date(), today);
                    break;
                }
            }
        }
        return new Summary(maxEver, maxOn, current, since);
    }
}
