package com.discounttracker.analytics;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

/** 쿠폰 설문과 별도로 집계한다. 재기동 시 원장부터 복원하고 이후에는 새 줄만 읽는다. */
@Service
public class PmfSurveyService {
    public static final String ID = "pmf-2026-11";
    static final Set<String> CHOICES = Set.of("very_disappointed", "somewhat_disappointed", "not_disappointed", "no_longer_using");
    static final Map<String, Set<String>> OPTIONS = Map.of(
            "benefit", Set.of("new_discounts", "compare_apps", "save_money", "conditions", "no_benefit", "other"),
            "missing", Set.of("few_discounts", "expired", "hard_to_find", "conditions", "small_discount", "none", "other"));
    private record Core(String session, Instant at) {}
    private static final class User {
        boolean dev;
        String terminal;
        String followUpSession;
        String choice;
        boolean followUpSaved;
        final Map<String, Instant> sessions = new HashMap<>();
        final List<Core> core = new ArrayList<>();
    }
    private final EventLog log;
    private final AnalyticsEventService events;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final boolean enabled;
    private final boolean local;
    private final Map<String, User> users = new HashMap<>();
    private long offset;

    public PmfSurveyService(EventLog log, AnalyticsEventService events, ObjectMapper mapper, Clock clock,
                            @Value("${discount.pmf.enabled:false}") boolean enabled, Environment env) {
        this.log = log;
        this.events = events;
        this.mapper = mapper;
        this.clock = clock;
        this.enabled = enabled;
        this.local = env.acceptsProfiles(Profiles.of("local"));
    }

    public record Status(String surveyId, boolean enabled, boolean eligible, String state) {}

    public synchronized Status status(String visitor, String session) {
        if (!enabled) return new Status(ID, false, false, "closed");
        catchUp();
        User u = users.get(visitor);
        return new Status(ID, true, qualifies(visitor, session), u != null && u.terminal != null ? u.terminal : "available");
    }

    private boolean qualifies(String visitor, String session) {
        if (!validId(visitor) || !validId(session)) return false;
        User u = users.get(visitor);
        if (u == null || u.terminal != null || (u.dev && !(local && visitor.startsWith("pmf_demo_")))) return false;
        Instant start = u.sessions.get(session);
        if (start == null || start.isAfter(clock.instant())) return false;
        Instant cutoff = clock.instant().minus(Duration.ofDays(14));
        return u.core.stream().anyMatch(c -> !c.at().isBefore(cutoff) && c.at().isBefore(start) && !session.equals(c.session()));
    }

    /** 판정부터 기록까지 파일 잠금으로 묶어 배포 중 여러 JVM의 중복 응답도 막는다. */
    public synchronized String finish(String visitor, String session, String surveyId, boolean dismiss,
                                       String choice, Map<String, String> answers, String ipHash) {
        return save(visitor, session, surveyId, dismiss, false, choice, answers, ipHash);
    }

    public synchronized String followUp(String visitor, String session, String surveyId,
                                        String choice, Map<String, String> answers, String ipHash) {
        return save(visitor, session, surveyId, false, true, choice, answers, ipHash);
    }

    private String save(String visitor, String session, String surveyId, boolean dismiss, boolean followUp,
                        String choice, Map<String, String> answers, String ipHash) {
        if (!ID.equals(surveyId)) return "unknown_survey";
        if (!enabled) return "closed";
        if (!dismiss && !validAnswers(choice, answers)) return "invalid_answer";
        if (followUp && (answers == null || OPTIONS.keySet().stream().noneMatch(key -> answers.get(key) != null))) {
            return "invalid_answer";
        }
        try {
            var lockPath = log.path().toAbsolutePath().resolveSibling("pmf-survey.lock");
            Files.createDirectories(lockPath.getParent());
            try (var channel = FileChannel.open(lockPath, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                 var ignored = channel.lock()) {
                catchUp();
                User u = users.get(visitor);
                if (followUp) {
                    if (u == null || !session.equals(u.followUpSession) || !choice.equals(u.choice)) return "not_eligible";
                    if (u.followUpSaved) return "followup_saved";
                } else {
                    if (u != null && u.terminal != null) return u.terminal;
                    if (!qualifies(visitor, session)) return "not_eligible";
                }
                Map<String, String> props = new LinkedHashMap<>();
                props.put("surveyId", ID);
                props.put("rewarded", "false");
                if (!dismiss) {
                    props.put("choice", choice);
                    if (answers != null) OPTIONS.forEach((key, values) -> {
                        String value = answers.get(key);
                        if (value != null) {
                            props.put("q_" + key, value);
                            String text = answers.get(key + "_text");
                            if ("other".equals(value) && text != null && !text.isBlank()) {
                                props.put("q_" + key + "_text", SurveyText.clean(text));
                            }
                        }
                    });
                }
                // 완료는 원장 기록 성공 뒤에만 표시한다. 보상 없는 설문에는 쿠폰 예외 처리가 필요 없다.
                String event = followUp ? "survey_followup_answer" : dismiss ? "survey_closed" : "survey_answer";
                events.append(List.of(new VisitEvent(clock.instant().toString(), event,
                        visitor, session, null, null, null, null, null, null, props, null, ipHash,
                        local && visitor.startsWith("pmf_demo_") ? true : null, null, UUID.randomUUID().toString(), null)));
                catchUp();
                return "ok";
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static boolean validAnswers(String choice, Map<String, String> answers) {
        if (!CHOICES.contains(choice == null ? "" : choice)) return false;
        if (answers == null) return true;
        Set<String> allowed = Set.of("benefit", "benefit_text", "missing", "missing_text");
        if (!allowed.containsAll(answers.keySet())) return false;
        for (var entry : OPTIONS.entrySet()) {
            String value = answers.get(entry.getKey());
            String text = answers.get(entry.getKey() + "_text");
            if (value != null && !entry.getValue().contains(value)) return false;
            if ("other".equals(value) && text != null && text.length() > SurveyText.MAX) return false;
            if (text != null && !"other".equals(value)) return false;
        }
        return true;
    }

    private void catchUp() {
        try {
            long next = log.readFrom(offset, this::add);
            if (next < 0) {
                users.clear();
                next = log.readFrom(0, this::add);
            }
            offset = next;
        } catch (IOException e) {
            // 미관측을 대상 아님으로 둔갑시키지 않는다. 조회 실패는 API 오류로 전달한다.
            throw new UncheckedIOException(e);
        }
    }

    private void add(String line) {
        JsonNode n;
        try { n = mapper.readTree(line); } catch (tools.jackson.core.JacksonException e) { return; }
        if (n == null || !n.isObject()) return;
        String visitor = n.path("visitorId").asString("");
        if (!validId(visitor) || n.hasNonNull("bot")) return;
        User u = users.computeIfAbsent(visitor, k -> new User());
        u.dev |= n.path("dev").asBoolean(false);
        String event = n.path("event").asString("");
        JsonNode props = n.path("props");
        String session = n.path("sessionId").asString("");
        if (ID.equals(props.path("surveyId").asString(""))) {
            if ("survey_closed".equals(event)) {
                u.terminal = "dismissed";
                u.followUpSession = null;
            }
            if ("survey_answer".equals(event)) {
                u.terminal = "answered";
                u.choice = props.path("choice").asString("");
                u.followUpSession = props.hasNonNull("q_benefit") || props.hasNonNull("q_missing") ? null : session;
                u.followUpSaved = false;
            }
            if ("survey_followup_answer".equals(event)) u.followUpSaved = true;
        }
        Instant at;
        try { at = Instant.parse(n.path("ts").asString("")); } catch (RuntimeException e) { return; }
        if (!validId(session)) return;
        Instant cutoff = clock.instant().minus(Duration.ofDays(14));
        if (at.isAfter(clock.instant())) return;
        u.sessions.merge(session, at, (a, b) -> a.isBefore(b) ? a : b);
        if (!at.isBefore(cutoff) && Set.of("offer_link_click", "banner_click").contains(event)) u.core.add(new Core(session, at));
        u.core.removeIf(c -> c.at().isBefore(cutoff));
    }

    static boolean validId(String value) {
        return value != null && value.matches("[a-zA-Z0-9_-]{1,100}");
    }
}
