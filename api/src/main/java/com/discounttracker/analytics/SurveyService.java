package com.discounttracker.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

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

    /** 첫 섹션(surveyQuestions.js purpose) 토큰 + 'other'. 자유 문자열을
     * 받으면 세는 것이 안전하지 않아 화이트리스트로 막는다 — 프론트
     * 토큰을 바꾸면 여기도 같이 고쳐야 한다(안 그러면 제출이 전부 400). */
    static final Set<String> CHOICES = Set.of(
            "new+discount_info", "save_money", "compare", "function", "other");

    /** 첫 섹션 밖의 답을 몇 개까지 원장에 적을지. 문항이 늘어도 줄이 안 부푼다. */
    static final int MAX_ANSWERS = 12;

    private final SurveyEligibility eligibility;
    private final GifticonStore gifticons;
    private final AnalyticsEventService events;

    /**
     * 접속일·전환수를 건너뛰고 대상으로 볼 visitorId.
     *
     * <p>배포한 화면에서 개발자가 설문을 열어 보려면 접속일 7일·전환 5회를
     * 실제로 채운 사람이어야 한다. 그 조건을 채운 사람은 실사용자뿐이라,
     * 확인하겠다고 남의 id를 쓰면 그 사람 몫의 기프티콘이 나가고 원장에
     * 그 사람 이름으로 응답이 박힌다(1인 1회라 정작 본인은 못 받는다).
     *
     * <p>원장에 가짜 방문을 심는 방법도 있지만 원장은 append-only라 그
     * 흔적이 영구히 남고 집계에 사람 한 명이 늘어난다.
     *
     * <p>그래서 서버 설정으로 목록을 둔다. 기본값이 비어 있어 아무에게도
     * 안 열리고, 브라우저가 못 바꾼다 — 판정을 서버에 둔 이유가 그대로
     * 지켜진다. 넘기는 것은 문턱 둘뿐이다: 1인 1회와 재고는 그대로 걸려서
     * 실사용자와 같은 경로를 지난다.
     */
    private final Set<String> testVisitors;

    /**
     * 원장 조사에서 자동화·중복 응답으로 사람이 직접 판단해 걸러낸
     * visitorId. 자동 판정이 아니다 — IP 해시로 "같은 날 같은 곳에서
     * 여러 visitorId가 나왔는지"까지는 걸러낼 수 있어도, 하루 종일 한
     * visitorId로 몰아친 것까지는 기계가 못 가른다(2026-09-02 조사 참고).
     *
     * <p>막는 지점은 코드 발급뿐이다 — 응답 자체는 그대로 받는다. 재고를
     * 아예 안 주는 게 아니라 "이 사람에게는 없다"로 보여, 없는 재고를
     * 지어내지 않는다는 원칙(GifticonStore)과 결이 같다.
     */
    private final Set<String> blockedVisitors;

    public SurveyService(SurveyEligibility eligibility, GifticonStore gifticons,
                         AnalyticsEventService events,
                         @Value("${discount.survey.test-visitors:}") String testVisitors,
                         @Value("${discount.survey.blocked-visitors:}") String blockedVisitors) {
        this.eligibility = eligibility;
        this.gifticons = gifticons;
        this.events = events;
        this.testVisitors = Arrays.stream(testVisitors.split(","))
                .map(String::trim)
                .filter(v -> !v.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
        if (!this.testVisitors.isEmpty()) {
            log.warn("설문 테스트 visitorId {}개가 열려 있다 — 확인이 끝나면 비운다",
                    this.testVisitors.size());
        }
        this.blockedVisitors = Arrays.stream(blockedVisitors.split(","))
                .map(String::trim)
                .filter(v -> !v.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
        if (!this.blockedVisitors.isEmpty()) {
            log.warn("설문 코드 발급을 막은 visitorId {}개 — {}",
                    this.blockedVisitors.size(), this.blockedVisitors);
        }
    }

    /**
     * 문턱을 넘었나. 테스트 id는 접속일·전환수만 건너뛴다.
     *
     * <p>1인 1회는 테스트 id에도 그대로 건다. 그래야 두 번째 응답이 막히는
     * 것까지 실사용자와 같은 경로로 확인된다.
     */
    private boolean qualifies(String visitorId) {
        SurveyEligibility.Counts counts = eligibility.count(visitorId);
        if (testVisitors.contains(visitorId)) return !counts.answered();
        return SurveyEligibility.qualifies(counts);
    }

    /**
     * 지금 이 사람에게 설문을 띄울까.
     *
     * <p>남은 코드는 안 본다. 예전엔 재고 0이면 아예 안 띄웠는데, 그러면
     * 다섯 문항을 채운 사람 답조차 못 받는다 — 답 자체는 재고와 무관하게
     * 값이 있고, 보상은 재고가 차면 나중에라도 줄 수 있다(answer() 참고,
     * rewarded=false인 응답은 answered로 안 쳐 다시 시도할 수 있다).
     */
    public boolean eligible(String visitorId) {
        return qualifies(visitorId);
    }

    /**
     * 이 사람 앞으로 이미 나간 코드.
     *
     * <p>브라우저 {@code localStorage}가 유일한 사본이면 지운 순간 되찾을
     * 길이 없다(연락처를 안 받는다). 서버가 정본을 들고 화면이 그것을
     * 따르게 한다.
     */
    public Optional<String> issuedCode(String visitorId) {
        return gifticons.issuedTo(visitorId);
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
    public synchronized Answer answer(String visitorId, String choice, String text,
                                      Map<String, String> answers, String ipHash) {
        if (!qualifies(visitorId)) {
            return Answer.fail("not_eligible");
        }

        // 재고가 없어도 응답은 받는다 — 예전엔 여기서 no_stock으로 막아
        // 다섯 문항을 다 채운 사람 답을 그대로 버렸다(원장에 한 줄도
        // 안 남았다). 응답은 항상 남기고, 보상만 있으면 준다.
        //
        // 보상을 못 준 응답은 "답했다"로 안 친다 — rewarded=false는
        // SurveyEligibility가 세는 answered에서 빠진다(qualifies() 참고).
        // 그래야 재고가 다시 차면 같은 사람이 다시 시도해 보상을 받을 수
        // 있다. 응답 자체(선택·직접 입력)는 중복돼도 집계에서 걸러 내면
        // 되고, 보상을 영영 놓치는 것보다 낫다.
        Optional<String> code = blockedVisitors.contains(visitorId)
                ? Optional.empty() : gifticons.issue(visitorId);

        try {
            record(visitorId, choice, text, answers, code.isPresent(), ipHash);
        } catch (RuntimeException ex) {
            // 코드는 이미 발급 표시가 됐는데 원장에 못 남았다. 여기서
            // 실패로 돌리면 그 코드는 아무에게도 안 가고 사라진다 —
            // 연락처를 안 받으므로 되찾을 방법이 없다. 사용자에게는 주고,
            // 빠진 줄은 사람이 이 로그를 보고 맞춘다.
            log.error("설문 응답을 원장에 남기지 못했다. 발급된 코드={} visitorId={}",
                    code.orElse(null), visitorId, ex);
        }
        return code.map(c -> new Answer(true, null, c))
                .orElseGet(() -> new Answer(true, "no_stock", null));
    }

    /**
     * 원장에 {@code survey_answer} 한 줄.
     *
     * <p>프론트가 {@code /api/events}로 쏘지 않고 서버가 직접 적는다. 그
     * 경로는 인증이 없어 누구나 위조할 수 있고, 그러면 응답 수와 발급 수가
     * 어긋나 설문 결과를 못 믿게 된다.
     */
    private void record(String visitorId, String choice, String text,
                        Map<String, String> answers, boolean rewarded, String ipHash) {
        Map<String, String> props = new LinkedHashMap<>();
        props.put("choice", choice);
        // SurveyEligibility가 이 값으로 "답했다"를 가린다 — 보상을 못 받은
        // 응답은 여기 false로 남아 다음에 재고가 차면 다시 시도할 수 있다.
        props.put("rewarded", String.valueOf(rewarded));
        String cleaned = SurveyText.clean(text);
        if ("other".equals(choice) && cleaned != null && !cleaned.isBlank()) {
            props.put("text", cleaned);
        }
        // 둘째 섹션부터는 여기로 온다. 프론트가 문항을 늘려도 서버를 안 고치게
        // 키를 검증하지 않고 받되, 원장 줄이 부풀지 않게 개수와 키 모양은 막는다.
        // 값은 전부 SurveyText를 통과한다 — 어느 섹션에 자유 입력이 붙든
        // 주민번호·전화번호가 원장에 닿지 않게 하려는 것이다.
        if (answers != null) {
            answers.entrySet().stream()
                    .filter(e -> e.getKey() != null && e.getKey().matches("[a-z0-9_]{1,40}"))
                    .filter(e -> e.getValue() != null && !e.getValue().isBlank())
                    .limit(MAX_ANSWERS)
                    .forEach(e -> props.put("q_" + e.getKey(), SurveyText.clean(e.getValue())));
        }
        events.append(List.of(new VisitEvent(
                OffsetDateTime.now().toString(), "survey_answer", visitorId,
                null, null, null, null, null, null, null, props, null,
                ipHash, null, null, UUID.randomUUID().toString(), null)));
    }
}
