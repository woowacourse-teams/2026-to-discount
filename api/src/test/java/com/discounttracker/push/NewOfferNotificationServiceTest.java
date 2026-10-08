package com.discounttracker.push;

import com.discounttracker.comparison.BrandComparison;
import com.discounttracker.comparison.BrandComparisonService;
import com.discounttracker.offer.AmountKind;
import com.discounttracker.offer.Certainty;
import com.discounttracker.offer.Offer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class NewOfferNotificationServiceTest {
    @TempDir Path temp;
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-08T02:15:00Z"), ZoneId.of("Asia/Seoul"));
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void selectsLargestNewBestAndExcludesOldSoldOutAndUncertainOffers() {
        Offer old = offer(20000, "2026-10-07T02:00:00Z");
        Offer lowerNew = offer(8000, "2026-10-08T01:00:00Z");
        Offer soldOut = offer(30000, "2026-10-08T01:00:00Z");
        when(soldOut.soldOut()).thenReturn(true);
        Offer random = offer(50000, "2026-10-08T01:00:00Z");
        when(random.certainty()).thenReturn(Certainty.RANDOM);
        var targets = NewOfferNotificationService.candidates(List.of(
                brand("낮은신규", old, lowerNew), brand("BHC", lowerNew),
                brand("최고", offer(10000, "2026-10-07T15:00:00Z")),
                brand("제외", soldOut, random)), LocalDate.parse("2026-10-08"));
        assertThat(targets).extracting(DailyOfferNotification.Target::brand).containsExactly("최고", "BHC");
    }

    @Test
    void persistsRandomScheduleInsideRemainingWindow() {
        var store = store();
        var comparisons = mock(BrandComparisonService.class);
        var service = service(store, mock(WebPushSender.class), comparisons);
        service.sendDueOffer();
        var planned = store.dailyOffer("2026-10-08", 0);
        assertThat(planned.scheduledEpochSecond()).isBetween(clock.instant().getEpochSecond(),
                Instant.parse("2026-10-08T02:30:00Z").getEpochSecond());
        assertThat(store().dailyOffer("2026-10-08", 0)).isEqualTo(planned);
    }

    @Test
    void retriesOnlyFailedSubscriptionAfterRestartAndKeepsSelectedOffer() throws Exception {
        var store = store();
        store.dailyOffer("2026-10-08", clock.instant().getEpochSecond());
        store.upsert("https://fcm.googleapis.com/fcm/send/one", "key", "auth", "one", true);
        store.upsert("https://fcm.googleapis.com/fcm/send/two", "key", "auth", "two", true);
        var comparisons = mock(BrandComparisonService.class);
        var bhc = brand("BHC", offer(8000, "2026-10-08T01:00:00Z"));
        when(comparisons.compare()).thenReturn(List.of(bhc));
        var sender = mock(WebPushSender.class);
        when(sender.send(any(), any())).thenReturn(201, 500);
        service(store, sender, comparisons).sendDueOffer();
        assertThat(store.dailyOffer("2026-10-08", 0).complete()).isFalse();
        assertThatThrownBy(() -> service(store, sender, comparisons).update(LocalDate.parse("2026-10-08"), "exclude", null))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);

        var restored = store();
        var retrySender = mock(WebPushSender.class);
        when(retrySender.send(any(), any())).thenReturn(201);
        var larger = brand("더큰할인", offer(15000, "2026-10-08T02:16:00Z"));
        when(comparisons.compare()).thenReturn(List.of(bhc, larger));
        var resumed = service(restored, retrySender, comparisons);
        resumed.sendDueOffer();
        resumed.sendDueOffer();
        var payload = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(retrySender, times(1)).send(any(), payload.capture());
        assertThat(mapper.readTree(payload.getValue()).get("title").asText()).isEqualTo("BHC 8,000원 할인");
        assertThat(restored.dailyOffer("2026-10-08", 0).complete()).isTrue();
    }

    @Test
    void doesNotSendBeforeScheduleOrAfterWindowAndSkipsEmptyDay() {
        var store = store();
        store.dailyOffer("2026-10-08", clock.instant().plusSeconds(100).getEpochSecond());
        var sender = mock(WebPushSender.class);
        var comparisons = mock(BrandComparisonService.class);
        service(store, sender, comparisons).sendDueOffer();
        verifyNoInteractions(sender, comparisons);
        Clock late = Clock.fixed(Instant.parse("2026-10-08T02:31:00Z"), clock.getZone());
        new NewOfferNotificationService(properties(), store, sender, new PushMessageFactory(mapper), comparisons, late).sendDueOffer();
        verifyNoInteractions(sender, comparisons);

        store.saveDailyOffer("2026-10-08", new DailyOfferNotification(clock.instant().getEpochSecond(), null, false));
        when(comparisons.compare()).thenReturn(List.of());
        service(store, sender, comparisons).sendDueOffer();
        assertThat(store.dailyOffer("2026-10-08", 0).complete()).isTrue();
        verifyNoInteractions(sender);
    }

    @Test
    void manualReplacementPersistsAndIsUsedByActualSend() throws Exception {
        var store = store();
        store.dailyOffer("2026-10-08", clock.instant().getEpochSecond());
        store.upsert("https://fcm.googleapis.com/fcm/send/one", "key", "auth", "one", true);
        var comparisons = mock(BrandComparisonService.class);
        var high = brand("최고", offer(12000, "2026-10-08T01:00:00Z"));
        var low = brand("BHC", offer(8000, "2026-10-08T01:00:00Z"));
        when(comparisons.compare()).thenReturn(List.of(high, low));
        var sender = mock(WebPushSender.class);
        when(sender.send(any(), any())).thenReturn(201);
        var service = service(store, sender, comparisons);
        var preview = service.next(null);
        assertThat(preview.selected().offer().brand()).isEqualTo("최고");
        String id = preview.candidates().stream().filter(value -> value.offer().brand().equals("BHC")).findFirst().orElseThrow().offerId();
        var selected = service.update(null, "replace", id);
        assertThat(selected.mode()).isEqualTo("replace");
        assertThat(selected.selected().offer().brand()).isEqualTo("BHC");
        var restored = store();
        assertThat(restored.dailyOffer("2026-10-08", 0).overridden()).isTrue();
        service(restored, sender, comparisons).sendDueOffer();
        var payload = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(sender).send(any(), payload.capture());
        assertThat(mapper.readTree(payload.getValue()).get("title").asText()).isEqualTo("BHC 8,000원 할인");
    }

    @Test
    void exclusionIsPersistentAndCanBeRestoredToAutoBeforeSending() {
        var store = store();
        store.dailyOffer("2026-10-08", clock.instant().getEpochSecond());
        var comparisons = mock(BrandComparisonService.class);
        var bhc = brand("BHC", offer(8000, "2026-10-08T01:00:00Z"));
        when(comparisons.compare()).thenReturn(List.of(bhc));
        var sender = mock(WebPushSender.class);
        var service = service(store, sender, comparisons);
        var excluded = service.update(null, "exclude", null);
        assertThat(excluded.selected()).isNull();
        assertThat(excluded.automatic().offer().brand()).isEqualTo("BHC");
        var restored = store();
        service(restored, sender, comparisons).sendDueOffer();
        verifyNoInteractions(sender);
        assertThat(restored.dailyOffer("2026-10-08", 0).excluded()).isTrue();
        var reset = service(restored, sender, comparisons).update(null, "auto", null);
        assertThat(reset.mode()).isEqualTo("auto");
        assertThat(reset.selected().offer().brand()).isEqualTo("BHC");
        assertThat(reset.scheduledAt()).isEqualTo(excluded.scheduledAt());
    }

    @Test
    void rejectsInvalidReplacementAndPastDateWithoutOverwritingSelection() {
        var comparisons = mock(BrandComparisonService.class);
        when(comparisons.compare()).thenReturn(List.of());
        var store = store();
        var service = service(store, mock(WebPushSender.class), comparisons);
        assertThatThrownBy(() -> service.update(null, "replace", "not-an-offer"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(store.dailyOffer("2026-10-08", 0).overridden()).isFalse();
        assertThatThrownBy(() -> service.next(LocalDate.parse("2026-10-07")))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }

    @Test
    void payloadUsesApprovedCopyAndFirstComeBenefit() throws Exception {
        var target = new DailyOfferNotification.Target("홍콩반점0410", "baemin", 8000, true, "2026-10-08T01:00:00Z");
        var payload = mapper.readTree(new PushMessageFactory(mapper).offerPayload(target, "display", "click", "id"));
        assertThat(payload.get("title").asText()).isEqualTo("홍콩반점0410 8,000원 선착순 할인");
        assertThat(payload.get("body").asText()).isEqualTo("할인 시간과 적용 조건을 확인해 보세요.");
        assertThat(payload.get("url").asText()).isEqualTo("click");
    }

    private PushProperties properties() {
        return new PushProperties(true, "public", "private", "mailto:test@example.com", temp.resolve("state.json"), "https://front.example/", "https://api.example");
    }
    private PushStateStore store() { return new PushStateStore(properties(), mapper, clock); }
    private NewOfferNotificationService service(PushStateStore store, WebPushSender sender, BrandComparisonService comparisons) {
        return new NewOfferNotificationService(properties(), store, sender, new PushMessageFactory(mapper), comparisons, clock);
    }
    private static BrandComparison brand(String name, Offer... offers) {
        var brand = mock(BrandComparison.class);
        when(brand.name()).thenReturn(name);
        when(brand.offers()).thenReturn(List.of(offers));
        return brand;
    }
    private static Offer offer(int amount, String firstSeenAt) {
        var offer = mock(Offer.class);
        when(offer.amount()).thenReturn(amount);
        when(offer.platform()).thenReturn("coupangeats");
        when(offer.certainty()).thenReturn(Certainty.EXACT);
        when(offer.kind()).thenReturn(AmountKind.DISCOUNT);
        when(offer.firstSeenAt()).thenReturn(firstSeenAt);
        return offer;
    }
}
