package com.discounttracker.push;

import com.discounttracker.storage.InterProcessFileLock;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.LinkedHashSet;

/**
 * 푸시 상태 파일. 무중단 배포(#188) 때 두 인스턴스가 같은 파일을 쓰므로(#192) 고치는 메서드는
 * 모두 {@link #mutate}를 거친다: 잠금 파일의 락을 잡고, 디스크를 다시 읽고, 고치고, 쓴다.
 * 시작 때 읽은 메모리를 통째로 쓰면 다른 프로세스의 변경을 지운다. 읽기만 하는 메서드는 락 없이
 * 파일이 바뀐 때만 다시 읽는다(저장이 원자적 교체라 반쪽 파일을 볼 일이 없다).
 */
@Component
public class PushStateStore {
    private static final Logger log = LoggerFactory.getLogger(PushStateStore.class);
    private static final Duration LOCK_TIMEOUT = Duration.ofSeconds(5);

    private final PushProperties properties;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Duration lockTimeout;
    private State state;
    private FileSignature signature;

    @Autowired
    public PushStateStore(PushProperties properties, ObjectMapper mapper, Clock clock) {
        this(properties, mapper, clock, LOCK_TIMEOUT);
    }

    /** 시험에서 락 대기를 줄이려고 둔다. */
    PushStateStore(PushProperties properties, ObjectMapper mapper, Clock clock, Duration lockTimeout) {
        this.lockTimeout = lockTimeout;
        this.properties = properties;
        this.mapper = mapper;
        this.clock = clock;
        this.state = load(new State());
        this.signature = signatureOf();
    }

    public synchronized PushSubscription upsert(String endpoint, String p256dh, String auth,
                                                String visitorId, boolean analyticsEnabled) {
        require(endpoint, "endpoint");
        require(p256dh, "p256dh");
        require(auth, "auth");
        require(visitorId, "visitorId");
        String id = sha256(endpoint);
        return mutate(s -> {
            Instant now = clock.instant();
            PushSubscription old = s.subscriptions.get(id);
            PushSubscription saved = new PushSubscription(id, endpoint, p256dh, auth, visitorId,
                    analyticsEnabled, old == null ? now : old.createdAt(), now, true);
            s.subscriptions.put(id, saved);
            return saved;
        });
    }

    public synchronized void remove(String endpoint) {
        mutate(s -> s.subscriptions.remove(sha256(endpoint)));
    }

    public synchronized List<PushSubscription> activeSubscriptions() {
        refresh();
        if (state.subscriptions.values().stream().anyMatch(this::disallowed)) {
            mutate(s -> {
                for (PushSubscription subscription : List.copyOf(s.subscriptions.values())) {
                    if (disallowed(subscription)) {
                        s.subscriptions.put(subscription.id(), new PushSubscription(subscription.id(),
                                subscription.endpoint(), subscription.p256dh(), subscription.auth(),
                                subscription.visitorId(), subscription.analyticsEnabled(),
                                subscription.createdAt(), clock.instant(), false));
                    }
                }
                return null;
            });
        }
        return state.subscriptions.values().stream().filter(PushSubscription::active).toList();
    }

    private boolean disallowed(PushSubscription subscription) {
        return subscription.active() && !PushEndpointPolicy.isAllowed(subscription.endpoint());
    }

    public synchronized void deactivate(String subscriptionId) {
        refresh();
        if (state.subscriptions.get(subscriptionId) == null) return;
        mutate(s -> {
            PushSubscription old = s.subscriptions.get(subscriptionId);
            if (old == null) return null;
            s.subscriptions.put(subscriptionId, new PushSubscription(old.id(), old.endpoint(),
                    old.p256dh(), old.auth(), old.visitorId(), old.analyticsEnabled(),
                    old.createdAt(), clock.instant(), false));
            return null;
        });
    }

    public synchronized List<BannerNotificationState> observe(Map<String, Boolean> notifyByBanner,
                                                               Map<String, Boolean> immediateByBanner) {
        return mutate(s -> {
            Instant now = clock.instant();
            List<BannerNotificationState> activated = notifyByBanner.entrySet().stream()
                    .filter(entry -> entry.getValue()
                            && !Optional.ofNullable(s.banners.get(entry.getKey()))
                            .map(BannerNotificationState::lastNotify).orElse(false))
                    .map(entry -> new BannerNotificationState(entry.getKey(), true,
                            UUID.randomUUID().toString(), now,
                            Boolean.TRUE.equals(immediateByBanner.get(entry.getKey())), null, null))
                    .toList();
            for (Map.Entry<String, Boolean> entry : notifyByBanner.entrySet()) {
                BannerNotificationState activation = activated.stream()
                        .filter(value -> value.bannerId().equals(entry.getKey())).findFirst().orElse(null);
                if (activation != null) {
                    s.banners.put(entry.getKey(), activation);
                } else {
                    BannerNotificationState old = s.banners.get(entry.getKey());
                    s.banners.put(entry.getKey(), new BannerNotificationState(entry.getKey(),
                            entry.getValue(), old == null ? null : old.activationId(),
                            old == null ? null : old.activatedAt(),
                            old != null && old.immediateRequested(),
                            old == null ? null : old.immediateDispatchedAt(),
                            old == null ? null : old.digestDispatchedAt()));
                }
            }
            return activated;
        });
    }

    public synchronized List<BannerNotificationState> pending() {
        refresh();
        return state.banners.values().stream()
                .filter(BannerNotificationState::lastNotify)
                .filter(value -> value.activatedAt() != null)
                .filter(value -> value.immediateDispatchedAt() == null && value.digestDispatchedAt() == null)
                .toList();
    }

    public synchronized void markDispatched(List<String> activationIds, String type) {
        mutate(s -> {
            Instant now = clock.instant();
            s.banners.replaceAll((id, old) -> activationIds.contains(old.activationId())
                    ? new BannerNotificationState(old.bannerId(), old.lastNotify(), old.activationId(),
                    old.activatedAt(), old.immediateRequested(),
                    "immediate".equals(type) ? now : old.immediateDispatchedAt(),
                    "digest".equals(type) ? now : old.digestDispatchedAt()) : old);
            return null;
        });
    }

    public synchronized PushTrackingToken createToken(String notificationId, String subscriptionId,
                                                       List<String> bannerIds, String deliveryType) {
        String token = UUID.randomUUID().toString().replace("-", "");
        PushTrackingToken value = new PushTrackingToken(token, notificationId, subscriptionId,
                List.copyOf(bannerIds), deliveryType, clock.instant().plusSeconds(60L * 60 * 24 * 30),
                false, false);
        mutate(s -> s.tokens.put(token, value));
        return value;
    }

    public synchronized boolean wasDelivered(String deliveryKey) {
        refresh();
        return state.delivered != null && state.delivered.contains(deliveryKey);
    }

    public synchronized DailyOfferNotification dailyOffer(String date, long scheduledEpochSecond) {
        refresh();
        if (state.dailyOffers != null && state.dailyOffers.get(date) != null) return state.dailyOffers.get(date);
        return mutate(s -> {
            if (s.dailyOffers == null) s.dailyOffers = new LinkedHashMap<>();
            return s.dailyOffers.computeIfAbsent(date,
                    d -> new DailyOfferNotification(scheduledEpochSecond, null, false));
        });
    }

    public synchronized void saveDailyOffer(String date, DailyOfferNotification value) {
        mutate(s -> {
            if (s.dailyOffers == null) s.dailyOffers = new LinkedHashMap<>();
            s.dailyOffers.put(date, value);
            return null;
        });
    }

    public synchronized void markDelivered(String deliveryKey) {
        mutate(s -> {
            if (s.delivered == null) s.delivered = new LinkedHashSet<>();
            s.delivered.add(deliveryKey);
            return null;
        });
    }

    public synchronized Optional<TrackingContext> track(String token, String eventType) {
        // 공개 엔드포인트라 아무 토큰이나 온다. 쓸 게 없으면 락도 쓰기도 없이 돌아간다.
        // 노출·클릭 표시는 false에서 true로만 바뀌므로 낡은 메모리가 "이미 됨"이라 해도 틀리지 않는다.
        refresh();
        if (!trackable(state.tokens.get(token), eventType)) return Optional.empty();
        return mutate(s -> {
            PushTrackingToken value = s.tokens.get(token);
            if (!trackable(value, eventType)) return Optional.empty();
            boolean displayed = value.displayed() || "push_notification_displayed".equals(eventType);
            boolean clicked = value.clicked() || "push_notification_clicked".equals(eventType);
            s.tokens.put(token, new PushTrackingToken(value.token(), value.notificationId(),
                    value.subscriptionId(), value.bannerIds(), value.deliveryType(), value.expiresAt(),
                    displayed, clicked));
            PushSubscription subscription = s.subscriptions.get(value.subscriptionId());
            if (subscription == null || !subscription.analyticsEnabled()) return Optional.empty();
            return Optional.of(new TrackingContext(subscription.visitorId(), value));
        });
    }

    private boolean trackable(PushTrackingToken value, String eventType) {
        if (value == null || value.expiresAt().isBefore(clock.instant())) return false;
        if ("push_notification_displayed".equals(eventType) && value.displayed()) return false;
        return !("push_notification_clicked".equals(eventType) && value.clicked());
    }

    /**
     * 락 안에서 디스크를 다시 읽고, 고치고, 쓴다. 잠금이 정합성의 근거라 캐시를 믿지 않고 항상 다시 읽는다.
     * statePath가 없으면 메모리에서만 고친다.
     */
    private <R> R mutate(Function<State, R> change) {
        Path path = properties.statePath();
        if (path == null) return change.apply(state);
        try {
            return InterProcessFileLock.withLock(path.resolveSibling(path.getFileName() + ".lock"),
                    lockTimeout, () -> {
                        state = load(state);
                        R result = change.apply(state);
                        save();
                        signature = signatureOf();
                        return result;
                    });
        } catch (IOException e) {
            throw new UncheckedIOException("Push 상태 파일 저장 실패: " + path, e);
        }
    }

    /** 파일이 지난번과 같으면(수정 시각, 크기, fileKey) 다시 읽지 않는다. 신규 오퍼 스케줄러가 1초마다 부른다. */
    private void refresh() {
        FileSignature now = signatureOf();
        if (now == null || now.equals(signature)) return;
        state = load(state);
        signature = now;
    }

    private FileSignature signatureOf() {
        Path path = properties.statePath();
        if (path == null) return null;
        try {
            BasicFileAttributes attrs = Files.readAttributes(path, BasicFileAttributes.class);
            return new FileSignature(attrs.lastModifiedTime(), attrs.size(), attrs.fileKey());
        } catch (IOException e) {
            return null;
        }
    }

    private record FileSignature(FileTime modified, long size, Object fileKey) {}

    /** 디스크에서 읽는다. 파일이 없거나 깨져 있으면 {@code fallback}(메모리의 마지막 정상 상태)을 유지한다. */
    private State load(State fallback) {
        if (properties.statePath() == null || !Files.exists(properties.statePath())) return fallback;
        try {
            State loaded = mapper.readValue(Files.readString(properties.statePath(), StandardCharsets.UTF_8),
                    State.class);
            if (!valid(loaded)) throw new IOException("Push 상태 구조가 올바르지 않다");
            return loaded;
        } catch (IOException e) {
            return recoverDamagedState(e, fallback);
        } catch (JacksonException e) {
            // Jackson 3부터 파싱 오류는 IOException이 아니다. 깨진 파일은 예전처럼 복구 길로 보낸다.
            return recoverDamagedState(new IOException(e), fallback);
        }
    }

    private boolean valid(State value) {
        return value != null
                && value.subscriptions != null
                && value.banners != null
                && value.tokens != null
                && value.delivered != null;
    }

    private State recoverDamagedState(IOException cause, State fallback) {
        Path damaged = properties.statePath().resolveSibling(
                properties.statePath().getFileName() + ".corrupt-" + clock.instant().toEpochMilli());
        try {
            Files.move(properties.statePath(), damaged, StandardCopyOption.REPLACE_EXISTING);
            log.error("손상된 Push 상태 파일을 격리하고 메모리 상태로 잇는다: backup={}", damaged, cause);
        } catch (IOException backupError) {
            log.error("Push 상태 파일을 읽거나 격리하지 못해 메모리 상태로 잇는다: path={}",
                    properties.statePath(), backupError);
        }
        return fallback;
    }

    /** 락 안에서만 부른다. {@code .tmp} 이름이 프로세스마다 겹치기 때문이다. */
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
        public Map<String, DailyOfferNotification> dailyOffers = new LinkedHashMap<>();

        public State() {}
    }
}
