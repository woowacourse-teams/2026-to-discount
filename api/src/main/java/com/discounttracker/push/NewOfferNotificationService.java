package com.discounttracker.push;

import com.discounttracker.comparison.BrandComparison;
import com.discounttracker.comparison.BrandComparisonService;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.OfferComparison;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.HexFormat;
import java.security.MessageDigest;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NewOfferNotificationService {
    private static final Logger log = LoggerFactory.getLogger(NewOfferNotificationService.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private final PushProperties properties;
    private final PushStateStore store;
    private final WebPushSender sender;
    private final PushMessageFactory messages;
    private final BrandComparisonService comparisons;
    private final Clock clock;
    private Instant nextRetryAt = Instant.MIN;

    public NewOfferNotificationService(PushProperties properties, PushStateStore store,
            WebPushSender sender, PushMessageFactory messages, BrandComparisonService comparisons, Clock clock) {
        this.properties = properties;
        this.store = store;
        this.sender = sender;
        this.messages = messages;
        this.comparisons = comparisons;
        this.clock = clock;
    }

    // 무작위 초 단위 예약을 확인한다. 예약과 발송 상태는 재시작 후에도 유지한다.
    @Scheduled(fixedDelay = 1000)
    public synchronized void sendDueOffer() {
        if (!properties.configured()) return;
        var now = clock.instant().atZone(KST);
        LocalDate day = now.toLocalDate();
        var start = day.atTime(11, 0).atZone(KST);
        var end = day.atTime(11, 30).atZone(KST);
        if (!now.isBefore(end) || clock.instant().isBefore(nextRetryAt)) return;
        // 재시작 시 기존 예약을 사용한다. 11시 이후 처음 켜진 서버는 남은 구간에서 예약한다.
        String date = day.toString();
        DailyOfferNotification state = plan(day);
        if (state.complete() || state.excluded() || now.toEpochSecond() < state.scheduledEpochSecond()) return;
        List<BrandComparison> current = comparisons.compare();
        if (state.target() == null) {
            var target = candidates(current, day).stream().findFirst().orElse(null);
            state = new DailyOfferNotification(state.scheduledEpochSecond(), target, target == null);
            store.saveDailyOffer(date, state);
        }
        if (state.complete()) return;
        if (!replacementCandidates(current, day).contains(state.target())) {
            store.saveDailyOffer(date, state.completed());
            return;
        }
        List<PushSubscription> subscriptions = store.activeSubscriptions();
        if (subscriptions.isEmpty()) {
            store.saveDailyOffer(date, state.completed());
            return;
        }
        String notificationId = UUID.nameUUIDFromBytes(("new_offer:" + date).getBytes(StandardCharsets.UTF_8)).toString();
        state = state.begin();
        store.saveDailyOffer(date, state);
        boolean complete = true;
        for (PushSubscription subscription : subscriptions) {
            String deliveryKey = "new_offer:" + date + ":" + subscription.id();
            if (store.wasDelivered(deliveryKey)) continue;
            var token = store.createToken(notificationId, subscription.id(), List.of(), "new_offer");
            String base = properties.apiRoot().replaceAll("/$", "");
            try {
                int status = sender.send(subscription, messages.offerPayload(state.target(),
                        base + "/api/push/displayed/" + token.token(),
                        base + "/api/push/click/" + token.token(), notificationId));
                if (status >= 200 && status < 300) store.markDelivered(deliveryKey);
                else if (status == 404 || status == 410) store.deactivate(subscription.id());
                else {
                    complete = false;
                    log.warn("신규 오퍼 Push 전송 실패: subscription={} status={}", subscription.id(), status);
                }
            } catch (RuntimeException e) {
                complete = false;
                log.warn("신규 오퍼 Push 전송 실패: subscription={}", subscription.id(), e);
            }
        }
        if (complete) {
            store.saveDailyOffer(date, state.completed());
            log.info("신규 오퍼 Push 발송 완료: date={} brand={} platform={} amount={} subscriptions={}",
                    date, state.target().brand(), state.target().platform(), state.target().amount(), subscriptions.size());
        } else nextRetryAt = clock.instant().plusSeconds(60);
    }

    private DailyOfferNotification plan(LocalDate day) {
        long start = day.atTime(11, 0).atZone(KST).toEpochSecond();
        long end = day.atTime(11, 30).atZone(KST).toEpochSecond();
        long earliest = Math.min(end - 1, Math.max(start, clock.instant().getEpochSecond()));
        return store.dailyOffer(day.toString(), ThreadLocalRandom.current().nextLong(earliest, end));
    }

    public synchronized ManagementView next(LocalDate requestedDate) {
        LocalDate day = managementDay(requestedDate);
        return view(day, plan(day));
    }

    public synchronized ManagementView update(LocalDate requestedDate, String mode, String offerId) {
        LocalDate day = managementDay(requestedDate);
        DailyOfferNotification state = plan(day);
        if (!editable(day, state)) throw new ResponseStatusException(HttpStatus.CONFLICT, "발송이 시작되었거나 발송 시간이 종료되었습니다.");
        DailyOfferNotification next;
        if ("replace".equals(mode)) {
            var target = replacementCandidates(comparisons.compare(), day).stream()
                    .filter(value -> offerId(value).equals(offerId)).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "유효한 신규 할인 후보가 아닙니다."));
            next = new DailyOfferNotification(state.scheduledEpochSecond(), target, false, true, false, false);
        } else if ("exclude".equals(mode)) {
            next = new DailyOfferNotification(state.scheduledEpochSecond(), null, false, false, true, false);
        } else if ("auto".equals(mode)) {
            next = new DailyOfferNotification(state.scheduledEpochSecond(), null, false, false, false, false);
        } else throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "mode는 auto, replace, exclude 중 하나여야 합니다.");
        store.saveDailyOffer(day.toString(), next);
        return view(day, next);
    }

    private LocalDate managementDay(LocalDate requested) {
        if (properties.statePath() == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Push 상태 저장 경로가 설정되지 않았습니다.");
        LocalDate today = clock.instant().atZone(KST).toLocalDate();
        if (requested == null) {
            if (!clock.instant().isBefore(today.atTime(11, 30).atZone(KST).toInstant()) || plan(today).complete()) return today.plusDays(1);
            return today;
        }
        if (requested.isBefore(today) || requested.isAfter(today.plusDays(1)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "오늘 또는 내일의 알림만 조회할 수 있습니다.");
        return requested;
    }

    private boolean editable(LocalDate day, DailyOfferNotification state) {
        return !state.complete() && !state.started()
                && clock.instant().isBefore(day.atTime(11, 30).atZone(KST).toInstant());
    }

    private ManagementView view(LocalDate day, DailyOfferNotification state) {
        List<BrandComparison> current = comparisons.compare();
        var automatic = candidates(current, day).stream().findFirst().orElse(null);
        var selected = state.excluded() ? null : state.target() == null ? automatic : state.target();
        var choices = replacementCandidates(current, day).stream().map(value -> new Candidate(offerId(value), value)).toList();
        return new ManagementView(day.toString(), Instant.ofEpochSecond(state.scheduledEpochSecond()).atZone(KST).toString(),
                state.excluded() ? "exclude" : state.overridden() ? "replace" : "auto",
                selected == null ? null : new Candidate(offerId(selected), selected),
                automatic == null ? null : new Candidate(offerId(automatic), automatic), choices,
                editable(day, state), state.started(), state.complete(), properties.configured());
    }

    public record Candidate(String offerId, DailyOfferNotification.Target offer) {}
    public record ManagementView(String date, String scheduledAt, String mode, Candidate selected,
            Candidate automatic, List<Candidate> candidates, boolean editable,
            boolean started, boolean complete, boolean pushConfigured) {}

    public static String offerId(DailyOfferNotification.Target target) {
        try {
            String seed = String.join("\u0000", target.brand(), target.platform(), Integer.toString(target.amount()),
                    Boolean.toString(target.firstCome()), target.firstSeenAt());
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(seed.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    static List<DailyOfferNotification.Target> replacementCandidates(List<BrandComparison> brands, LocalDate day) {
        return brands.stream().flatMap(brand -> brand.offers().stream()
                .filter(NewOfferNotificationService::eligible).filter(offer -> seenToday(offer.firstSeenAt(), day))
                .map(offer -> new DailyOfferNotification.Target(brand.name(), offer.platform(), offer.amount(), offer.firstCome(), offer.firstSeenAt())))
                .distinct().sorted(Comparator.comparingInt(DailyOfferNotification.Target::amount).reversed()
                        .thenComparing(DailyOfferNotification.Target::brand).thenComparing(DailyOfferNotification.Target::platform)).toList();
    }

    static List<DailyOfferNotification.Target> candidates(List<BrandComparison> brands, LocalDate day) {
        return brands.stream().flatMap(brand -> {
            Integer best = brand.offers().stream().filter(NewOfferNotificationService::eligible)
                    .map(Offer::amount).max(Integer::compareTo).orElse(null);
            return brand.offers().stream().filter(NewOfferNotificationService::eligible)
                    .filter(offer -> offer.amount().equals(best) && seenToday(offer.firstSeenAt(), day))
                    .map(offer -> new DailyOfferNotification.Target(brand.name(), offer.platform(),
                            offer.amount(), offer.firstCome(), offer.firstSeenAt()));
        }).sorted(Comparator.comparingInt(DailyOfferNotification.Target::amount).reversed()
                .thenComparing(DailyOfferNotification.Target::brand)
                .thenComparing(DailyOfferNotification.Target::platform)).toList();
    }

    private static boolean eligible(Offer offer) {
        return offer.amount() != null && offer.amount() > 0
                && OfferComparison.isBestCandidate(offer.certainty(), offer.kind(), offer.soldOut(), offer.platform());
    }

    private static boolean seenToday(String firstSeenAt, LocalDate day) {
        try { return Instant.parse(firstSeenAt).atZone(KST).toLocalDate().equals(day); }
        catch (RuntimeException e) { return false; }
    }
}
