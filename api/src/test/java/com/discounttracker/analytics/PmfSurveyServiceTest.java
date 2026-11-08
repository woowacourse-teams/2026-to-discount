package com.discounttracker.analytics;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

class PmfSurveyServiceTest {
    @TempDir Path dir;
    final Instant now = Instant.parse("2026-11-04T06:00:00Z");
    final ObjectMapper mapper = JsonMapper.builder().build();
    EventLog log;
    AnalyticsEventService events;
    PmfSurveyService service;
    @BeforeEach void setup() {
        log = new EventLog(dir.resolve("events.jsonl").toString(), mapper);
        events = mock(AnalyticsEventService.class);
        doAnswer(a -> { log.append(a.getArgument(0)); return null; }).when(events).append(anyList());
        service = create(true);
    }
    PmfSurveyService create(boolean enabled) { return new PmfSurveyService(log, events, mapper, Clock.fixed(now, ZoneOffset.UTC), enabled, new MockEnvironment()); }
    void event(String visitor, String session, String type, Instant at, Boolean dev, String bot, Map<String,String> props) {
        log.append(List.of(new VisitEvent(at.toString(), type, visitor, session, null, null, null, null, null, null,
                props, null, null, dev, null, UUID.randomUUID().toString(), bot)));
    }
    void seed() { event("v", "old", "offer_link_click", now.minusSeconds(3600), null, null, Map.of()); event("v", "new", "page_view", now.minusSeconds(60), null, null, Map.of()); }
    @Test void requiresCoreThenDifferentObservedSession() {
        event("v", "old", "offer_link_click", now.minusSeconds(3600), null, null, Map.of());
        assertFalse(service.status("v", "old").eligible());
        assertFalse(service.status("v", "new").eligible());
        event("v", "new", "page_view", now.minusSeconds(60), null, null, Map.of());
        assertTrue(service.status("v", "new").eligible());
    }
    @Test void fourteenDayBoundaryAndSessionOrder() {
        event("v", "old", "banner_click", now.minus(Duration.ofDays(14)), null, null, Map.of());
        event("v", "new", "page_view", now.minusSeconds(60), null, null, Map.of());
        assertTrue(service.status("v", "new").eligible());
        event("expired", "old", "offer_link_click", now.minus(Duration.ofDays(14)).minusSeconds(1), null, null, Map.of());
        event("expired", "new", "page_view", now, null, null, Map.of());
        assertFalse(service.status("expired", "new").eligible());
        event("v", "parallel", "page_view", now.minus(Duration.ofDays(15)), null, null, Map.of());
        event("v", "parallel", "page_view", now, null, null, Map.of());
        assertFalse(service.status("v", "parallel").eligible());
    }
    @Test void rejectsDevAndBotEvenWithEarlierValidHistory() {
        seed(); event("v", "new", "page_view", now, true, null, Map.of());
        assertFalse(service.status("v", "new").eligible());
        event("bot", "old", "offer_link_click", now.minusSeconds(3600), null, "googlebot", Map.of());
        event("bot", "new", "page_view", now, null, null, Map.of());
        assertFalse(service.status("bot", "new").eligible());
    }
    @Test void preservesLegacyParticipationAndCompletesWithoutReward() {
        seed(); event("v", "old", "survey_answer", now.minusSeconds(600), null, null, Map.of("rewarded", "true"));
        assertTrue(service.status("v", "new").eligible());
        assertEquals("ok", service.finish("v", "new", PmfSurveyService.ID, false, "very_disappointed", Map.of(), null));
        assertEquals("answered", service.finish("v", "new", PmfSurveyService.ID, false, "very_disappointed", Map.of(), null));
        assertEquals("answered", create(true).status("v", "new").state());
    }
    @Test void savesFollowUpOnlyForTheOriginalAnswerSessionAndOnlyOnce() throws Exception {
        seed();
        String surveyId = PmfSurveyService.ID;
        String choice = "very_disappointed";
        var answers = Map.of("benefit", "save_money");
        assertEquals("not_eligible", service.followUp("v", "new", surveyId, choice, answers, null));
        assertEquals("ok", service.finish("v", "new", surveyId, false, choice, Map.of(), null));
        assertEquals("not_eligible", service.followUp("v", "old", surveyId, choice, answers, null));
        assertEquals("not_eligible", service.followUp("v", "new", surveyId, "not_disappointed", answers, null));
        assertEquals("ok", create(true).followUp("v", "new", surveyId, choice, answers, null));
        assertEquals("followup_saved", create(true).followUp("v", "new", surveyId, choice, answers, null));
        assertEquals(1, Files.readAllLines(log.path()).stream().filter(line -> line.contains("survey_followup_answer")).count());
        assertEquals("answered", create(true).status("v", "new").state());
    }
    @Test void dismissSurvivesRestartAndDoesNotWriteAnswer() throws Exception {
        seed();
        assertEquals("ok", service.finish("v", "new", PmfSurveyService.ID, true, null, null, null));
        assertEquals("dismissed", create(true).status("v", "new").state());
        assertFalse(Files.readString(log.path()).contains("survey_answer"));
    }
    @Test void failureIsNotReportedAsCompletion() {
        seed(); doThrow(new IllegalStateException("disk full")).when(events).append(anyList());
        assertThrows(IllegalStateException.class, () -> service.finish("v", "new", PmfSurveyService.ID, true, null, null, null));
        assertTrue(service.status("v", "new").eligible());
    }
    @Test void sanitizesOtherAndValidatesAllOptions() throws Exception {
        seed();
        assertTrue(PmfSurveyService.validAnswers("very_disappointed", Map.of("benefit", "other", "benefit_text", "  ")));
        assertTrue(PmfSurveyService.validAnswers("very_disappointed", Map.of("benefit", "other")));
        assertFalse(PmfSurveyService.validAnswers("save_money", Map.of()));
        assertFalse(PmfSurveyService.validAnswers("very_disappointed", Map.of("benefit", "made_up")));
        assertEquals("ok", service.finish("v", "new", PmfSurveyService.ID, false, "very_disappointed",
                Map.of("benefit", "other", "benefit_text", "contact@example.com"), null));
        assertFalse(Files.readString(log.path()).contains("contact@example.com"));
    }
    @Test void disabledSurveyAndLocalBypassDoNotLeakIntoProduction() {
        seed(); assertFalse(create(false).status("v", "new").eligible());
        event("pmf_demo_x", "old", "banner_click", now.minusSeconds(3600), true, null, Map.of());
        event("pmf_demo_x", "new", "page_view", now, true, null, Map.of());
        assertFalse(service.status("pmf_demo_x", "new").eligible());
    }
    @Test void truncatedLedgerResetsCachedState() throws Exception {
        seed(); assertTrue(service.status("v", "new").eligible());
        Files.writeString(log.path(), "null\n{}");
        assertFalse(service.status("v", "new").eligible());
    }
}
