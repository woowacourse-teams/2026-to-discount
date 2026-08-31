package com.discounttracker.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(SurveyService.class);

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
    // synchronized: 판정(원장 조회)부터 기록(원장 기입)까지가 한 덩어리여야
    // 동시 요청으로 같은 사람이 코드를 여러 개 받는 것을 막는다. 서버가
    // 단일 인스턴스이고(스펙 전제) 설문 제출은 하루 몇 건이라 이 잠금이
    // 병목이 되지 않는다.
    public synchronized Answer answer(String visitorId, String choice, String text, String ipHash) {
        // 대상 여부와 재고는 서로 다른 이유다. 재고부터 보면 "이미 답해서
        // 대상이 아닌" 사람도 재고가 없을 때 no_stock으로 잘못 갈린다 —
        // 대상 판정(원장 기준)을 먼저, 재고는 그다음이다.
        if (!SurveyEligibility.qualifies(eligibility.count(visitorId))) {
            return Answer.fail("not_eligible");
        }
        if (gifticons.remaining() <= 0) return Answer.fail("no_stock");

        Optional<String> code = gifticons.issue(visitorId);
        if (code.isEmpty()) return Answer.fail("no_stock");

        try {
            record(visitorId, choice, text, ipHash);
        } catch (RuntimeException ex) {
            // 코드는 이미 발급 표시가 됐다. 여기서 실패했다고 안 주면 그 코드는
            // 아무에게도 안 가고 사라진다 — 연락처를 안 받으므로 되찾을 방법이 없다.
            // 사용자에게는 주고, 원장에 빠진 줄은 사람이 이 로그를 보고 맞춘다.
            log.error("설문 응답을 원장에 남기지 못했다. 발급된 코드={} visitorId={}",
                    code.get(), visitorId, ex);
        }
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
