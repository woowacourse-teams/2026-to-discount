package com.discounttracker.push;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.LinkedHashSet;

@Component
public class PushStateStore {
    private static final Logger log = LoggerFactory.getLogger(PushStateStore.class);

    private final PushProperties properties;
    private final ObjectMapper mapper;
    private final Clock clock;
    private State state;

    public PushStateStore(PushProperties properties, ObjectMapper mapper, Clock clock) {
        this.properties = properties;
        this.mapper = mapper;
        this.clock = clock;
        this.state = load();
    }

    public synchronized PushSubscription upsert(String endpoint, String p256dh, String auth,
                                                String visitorId, boolean analyticsEnabled) {
        require(endpoint, "endpoint");
        require(p256dh, "p256dh");
        require(auth, "auth");
        require(visitorId, "visitorId");
        String id = sha256(endpoint);
        Instant now = clock.instant();
        PushSubscription old = state.subscriptions.get(id);
        PushSubscription saved = new PushSubscription(id, endpoint, p256dh, auth, visitorId,
                analyticsEnabled, old == null ? now : old.createdAt(), now, true);
        state.subscriptions.put(id, saved);
        save();
        return saved;
    }

    public synchronized void remove(String endpoint) {
        state.subscriptions.remove(sha256(endpoint));
        save();
    }

    public synchronized List<PushSubscription> activeSubscriptions() {
        boolean changed = false;
        for (PushSubscription subscription : List.copyOf(state.subscriptions.values())) {
            if (subscription.active() && !PushEndpointPolicy.isAllowed(subscription.endpoint())) {
                state.subscriptions.put(subscription.id(), new PushSubscription(subscription.id(),
                        subscription.endpoint(), subscription.p256dh(), subscription.auth(),
                        subscription.visitorId(), subscription.analyticsEnabled(),
                        subscription.createdAt(), clock.instant(), false));
                changed = true;
            }
        }
        if (changed) save();
        return state.subscriptions.values().stream().filter(PushSubscription::active).toList();
    }

    public synchronized void deactivate(String subscriptionId) {
        PushSubscription old = state.subscriptions.get(subscriptionId);
        if (old == null) return;
        state.subscriptions.put(subscriptionId, new PushSubscription(old.id(), old.endpoint(),
                old.p256dh(), old.auth(), old.visitorId(), old.analyticsEnabled(),
                old.createdAt(), clock.instant(), false));
        save();
    }

    public synchronized List<BannerNotificationState> observe(Map<String, Boolean> notifyByBanner,
                                                               Map<String, Boolean> immediateByBanner) {
        Instant now = clock.instant();
        List<BannerNotificationState> activated = notifyByBanner.entrySet().stream()
                .filter(entry -> entry.getValue()
                        && !Optional.ofNullable(state.banners.get(entry.getKey()))
                        .map(BannerNotificationState::lastNotify).orElse(false))
                .map(entry -> new BannerNotificationState(entry.getKey(), true,
                        UUID.randomUUID().toString(), now,
                        Boolean.TRUE.equals(immediateByBanner.get(entry.getKey())), null, null))
                .toList();
        for (Map.Entry<String, Boolean> entry : notifyByBanner.entrySet()) {
            BannerNotificationState activation = activated.stream()
                    .filter(value -> value.bannerId().equals(entry.getKey())).findFirst().orElse(null);
            if (activation != null) {
                state.banners.put(entry.getKey(), activation);
            } else {
                BannerNotificationState old = state.banners.get(entry.getKey());
                state.banners.put(entry.getKey(), new BannerNotificationState(entry.getKey(),
                        entry.getValue(), old == null ? null : old.activationId(),
                        old == null ? null : old.activatedAt(),
                        old != null && old.immediateRequested(),
                        old == null ? null : old.immediateDispatchedAt(),
                        old == null ? null : old.digestDispatchedAt()));
            }
        }
        save();
        return activated;
    }

    public synchronized List<BannerNotificationState> pendingSince(Instant since) {
        return state.banners.values().stream()
                .filter(BannerNotificationState::lastNotify)
                .filter(value -> value.activatedAt() != null && !value.activatedAt().isBefore(since))
                .filter(value -> value.immediateDispatchedAt() == null && value.digestDispatchedAt() == null)
                .toList();
    }

    public synchronized List<BannerNotificationState> pending() {
        return state.banners.values().stream()
                .filter(BannerNotificationState::lastNotify)
                .filter(value -> value.activatedAt() != null)
                .filter(value -> value.immediateDispatchedAt() == null && value.digestDispatchedAt() == null)
                .toList();
    }

    public synchronized void markDispatched(List<String> activationIds, String type) {
        Instant now = clock.instant();
        state.banners.replaceAll((id, old) -> activationIds.contains(old.activationId())
                ? new BannerNotificationState(old.bannerId(), old.lastNotify(), old.activationId(),
                old.activatedAt(), old.immediateRequested(),
                "immediate".equals(type) ? now : old.immediateDispatchedAt(),
                "digest".equals(type) ? now : old.digestDispatchedAt()) : old);
        save();
    }

    public synchronized PushTrackingToken createToken(String notificationId, String subscriptionId,
                                                       List<String> bannerIds, String deliveryType) {
        String token = UUID.randomUUID().toString().replace("-", "");
        PushTrackingToken value = new PushTrackingToken(token, notificationId, subscriptionId,
                List.copyOf(bannerIds), deliveryType, clock.instant().plusSeconds(60L * 60 * 24 * 30),
                false, false);
        state.tokens.put(token, value);
        save();
        return value;
    }

    public synchronized boolean wasDelivered(String deliveryKey) {
        return state.delivered != null && state.delivered.contains(deliveryKey);
    }

    public synchronized void markDelivered(String deliveryKey) {
        if (state.delivered == null) state.delivered = new LinkedHashSet<>();
        state.delivered.add(deliveryKey);
        save();
    }

    public synchronized Optional<TrackingContext> track(String token, String eventType) {
        PushTrackingToken value = state.tokens.get(token);
        if (value == null || value.expiresAt().isBefore(clock.instant())) return Optional.empty();
        boolean displayed = value.displayed() || "push_notification_displayed".equals(eventType);
        boolean clicked = value.clicked() || "push_notification_clicked".equals(eventType);
        if (("push_notification_displayed".equals(eventType) && value.displayed())
                || ("push_notification_clicked".equals(eventType) && value.clicked())) {
            return Optional.empty();
        }
        state.tokens.put(token, new PushTrackingToken(value.token(), value.notificationId(),
                value.subscriptionId(), value.bannerIds(), value.deliveryType(), value.expiresAt(),
                displayed, clicked));
        PushSubscription subscription = state.subscriptions.get(value.subscriptionId());
        save();
        if (subscription == null || !subscription.analyticsEnabled()) return Optional.empty();
        return Optional.of(new TrackingContext(subscription.visitorId(), value));
    }

    private State load() {
        if (properties.statePath() == null || !Files.exists(properties.statePath())) return new State();
        try {
            State loaded = mapper.readValue(properties.statePath().toFile(), State.class);
            if (!valid(loaded)) throw new IOException("Push 상태 구조가 올바르지 않다");
            return loaded;
        } catch (IOException e) {
            return recoverDamagedState(e);
        }
    }

    private boolean valid(State value) {
        return value != null
                && value.subscriptions != null
                && value.banners != null
                && value.tokens != null
                && value.delivered != null;
    }

    private State recoverDamagedState(IOException cause) {
        Path damaged = properties.statePath().resolveSibling(
                properties.statePath().getFileName() + ".corrupt-" + clock.instant().toEpochMilli());
        try {
            Files.move(properties.statePath(), damaged, StandardCopyOption.REPLACE_EXISTING);
            log.error("손상된 Push 상태 파일을 격리하고 빈 상태로 시작한다: backup={}", damaged, cause);
        } catch (IOException backupError) {
            log.error("Push 상태 파일을 읽거나 격리하지 못해 빈 상태로 시작한다: path={}",
                    properties.statePath(), backupError);
        }
        return new State();
    }

    private void save() {
        if (properties.statePath() == null) return;
        try {
            if (properties.statePath().getParent() != null) Files.createDirectories(properties.statePath().getParent());
            var temp = properties.statePath().resolveSibling(properties.statePath().getFileName() + ".tmp");
            Files.writeString(temp, mapper.writeValueAsString(state), StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            Files.move(temp, properties.statePath(), StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("Push 상태 파일 저장 실패: " + properties.statePath(), e);
        }
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static void require(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + "가 비어 있다");
    }

    public record TrackingContext(String visitorId, PushTrackingToken token) {}

    public static class State {
        public Map<String, PushSubscription> subscriptions = new LinkedHashMap<>();
        public Map<String, BannerNotificationState> banners = new LinkedHashMap<>();
        public Map<String, PushTrackingToken> tokens = new LinkedHashMap<>();
        public Set<String> delivered = new LinkedHashSet<>();

        public State() {}
    }
}
