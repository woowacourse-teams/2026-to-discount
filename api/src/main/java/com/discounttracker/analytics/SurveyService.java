package com.discounttracker.analytics;

import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * 설문 대상 판정과 응답 처리. 순서만 정하고 실제 일은 셋에게 맡긴다.
 *
 * <p>{@link SurveyEligibility}는 원장을 훑고, {@link GifticonStore}는 코드를
 * 꺼내고, {@link SurveyText}는 자유 입력을 거른다. 여기서는 어떤 순서로
 * 부를지만 정한다 — 대상인가, 코드가 남았나, 그다음에 발급이다. 순서를
 * 바꾸면 대상이 아닌 사람에게 코드가 나간다.
 */
@Service
public class SurveyService {

    /** 스펙이 정한 네 토큰. 자유 문자열을 받으면 세는 것이 안전하지 않다. */
    static final Set<String> CHOICES = Set.of("discount_info", "save_money", "compare", "other");

    private final SurveyEligibility eligibility;
    private final GifticonStore gifticons;
    private final AnalyticsEventService events;

    public SurveyService(SurveyEligibility eligibility, GifticonStore gifticons,
                         AnalyticsEventService events) {
        this.eligibility = eligibility;
        this.gifticons = gifticons;
        this.events = events;
    }

    /**
     * 지금 이 사람에게 설문을 띄울까.
     *
     * <p>남은 코드도 같이 본다. 줄 것이 없는데 묻는 일이 없어야 한다 —
     * 리워드를 걸어 놓고 못 주면 안 묻느니만 못하다.
     */
    public boolean eligible(String visitorId) {
        if (gifticons.remaining() <= 0) return false;
        return SurveyEligibility.qualifies(eligibility.count(visitorId));
    }

    /** 응답 결과. {@code code}는 성공했을 때만 채워진다. */
    public record Answer(boolean ok, String reason, String code) {
        static Answer fail(String reason) {
            return new Answer(false, reason, null);
        }
    }

    /**
     * 응답을 받아 코드를 내준다.
     *
     * <p>대상 판정을 여기서 다시 한다. {@code GET}에서 통과했다고 믿으면
     * 그 사이에 답한 사람이 한 번 더 받는다 — 판정은 쓰는 쪽에서 해야 한다.
     */
    public Answer answer(String visitorId, String choice, String text, String ipHash) {
        // 대상 여부와 재고는 서로 다른 이유다. 재고부터 보면 "이미 답해서
        // 대상이 아닌" 사람도 재고가 없을 때 no_stock으로 잘못 갈린다 —
        // 대상 판정(원장 기준)을 먼저, 재고는 그다음이다.
        if (!SurveyEligibility.qualifies(eligibility.count(visitorId))) {
            return Answer.fail("not_eligible");
        }
        if (gifticons.remaining() <= 0) return Answer.fail("no_stock");

        Optional<String> code = gifticons.issue(visitorId);
        if (code.isEmpty()) return Answer.fail("no_stock");

        record(visitorId, choice, text, ipHash);
        return new Answer(true, null, code.get());
    }

    /**
     * 원장에 {@code survey_answer} 한 줄.
     *
     * <p>프론트가 {@code /api/events}로 쏘지 않고 서버가 직접 적는다. 그
     * 경로는 인증이 없어 누구나 위조할 수 있고, 그러면 응답 수와 발급 수가
     * 어긋나 설문 결과를 못 믿게 된다.
     */
    private void record(String visitorId, String choice, String text, String ipHash) {
        Map<String, String> props = new LinkedHashMap<>();
        props.put("choice", choice);
        String cleaned = SurveyText.clean(text);
        if ("other".equals(choice) && cleaned != null && !cleaned.isBlank()) {
            props.put("text", cleaned);
        }
        events.append(List.of(new VisitEvent(
                OffsetDateTime.now().toString(), "survey_answer", visitorId,
                null, null, null, null, null, null, null, props, null,
                ipHash, null, null, UUID.randomUUID().toString(), null)));
    }
}
