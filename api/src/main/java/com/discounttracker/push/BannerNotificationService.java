package com.discounttracker.push;

import com.discounttracker.banner.Banner;
import com.discounttracker.banner.BannerCatalog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Comparator;

@Service
public class BannerNotificationService {
    private static final Logger log = LoggerFactory.getLogger(BannerNotificationService.class);

    private final PushProperties properties;
    private final PushStateStore store;
    private final WebPushSender sender;
    private final PushMessageFactory messages;
    private final BannerCatalog banners;
    private final Clock clock;

    public BannerNotificationService(PushProperties properties, PushStateStore store,
                                     WebPushSender sender, PushMessageFactory messages,
                                     BannerCatalog banners, Clock clock) {
        this.properties = properties;
        this.store = store;
        this.sender = sender;
        this.messages = messages;
        this.banners = banners;
        this.clock = clock;
    }

    public ReloadResult onReload(List<Banner> current) {
        Map<String, Boolean> notify = new LinkedHashMap<>();
        Map<String, Boolean> immediate = new LinkedHashMap<>();
        current.forEach(banner -> {
            notify.put(banner.id(), banner.notificationEnabled());
            immediate.put(banner.id(), banner.immediateNotificationRequested());
        });
        List<BannerNotificationState> activated = store.observe(notify, immediate);
        List<BannerNotificationState> requested = activated.stream()
                .filter(BannerNotificationState::immediateRequested).toList();
        boolean allowed = immediateAllowed();
        int sent = allowed ? dispatch(requested, "immediate") : 0;
        return new ReloadResult(activated.size(), requested.size(), allowed, sent);
    }

    @Scheduled(cron = "0 0 11 * * *", zone = "Asia/Seoul")
    public void sendDailyDigest() {
        dispatch(store.pendingSince(clock.instant().minus(Duration.ofHours(24))), "digest");
    }

    int dispatch(List<BannerNotificationState> activations, String type) {
        if (!properties.configured() || activations.isEmpty()) return 0;
        Map<String, Banner> byId = new LinkedHashMap<>();
        banners.all().forEach(banner -> byId.put(banner.id(), banner));
        List<Banner> targets = activations.stream().map(value -> byId.get(value.bannerId()))
                .filter(value -> value != null && value.notificationEnabled()).toList();
        if (targets.isEmpty()) return 0;

        String notificationId = UUID.randomUUID().toString();
        String activationKey = activations.stream().map(BannerNotificationState::activationId)
                .sorted(Comparator.naturalOrder()).reduce((left, right) -> left + "," + right).orElse("");
        int success = 0;
        List<PushSubscription> subscriptions = store.activeSubscriptions();
        for (PushSubscription subscription : subscriptions) {
            String deliveryKey = type + ":" + activationKey + ":" + subscription.id();
            if (store.wasDelivered(deliveryKey)) {
                success++;
                continue;
            }
            PushTrackingToken token = store.createToken(notificationId, subscription.id(),
                    targets.stream().map(Banner::id).toList(), type);
            String base = properties.apiRoot().replaceAll("/$", "");
            String displayed = base + "/api/push/displayed/" + token.token();
            String click = base + "/api/push/click/" + token.token();
            try {
                int status = sender.send(subscription,
                        messages.payload(targets, displayed, click, notificationId, type));
                if (status >= 200 && status < 300) {
                    store.markDelivered(deliveryKey);
                    success++;
                }
                else if (status == 404 || status == 410) store.deactivate(subscription.id());
                else log.warn("Web Push 전송 실패: subscription={} status={}",
                        subscription.id(), status);
            } catch (RuntimeException e) {
                log.warn("Web Push 전송 예외: subscription={}", subscription.id(), e);
            }
        }
        if (success > 0) {
            store.markDispatched(activations.stream().map(BannerNotificationState::activationId).toList(), type);
        }
        log.info("Web Push 발송: type={} banners={} subscriptions={} success={}", type,
                targets.size(), subscriptions.size(), success);
        return success;
    }

    private boolean immediateAllowed() {
        LocalTime now = LocalTime.now(clock);
        return !now.isBefore(LocalTime.of(7, 0)) && now.isBefore(LocalTime.of(22, 0));
    }

    public record ReloadResult(int activated, int immediateRequested,
                               boolean immediateAllowed, int immediateSent) {}
}
