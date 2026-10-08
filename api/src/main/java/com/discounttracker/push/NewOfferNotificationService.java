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
import java.util.concurrent.ThreadLocalRandom;

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
        if (state.complete() || now.toEpochSecond() < state.scheduledEpochSecond()) return;
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
