package com.discounttracker.analytics;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 설문 대상 조회와 응답 접수.
 *
 * <p>판정이 전부 여기 뒤에 있다. 프론트는 "띄울까"를 묻고 답을 그대로 따른다 —
 * 리워드가 걸린 판정을 브라우저에 두면 {@code localStorage}를 고쳐 아무나
 * 받아간다.
 */
@RestController
@RequestMapping("/api/survey")
public class SurveyController {

    private final SurveyService survey;
    private final ClientFingerprint fingerprint;

    public SurveyController(SurveyService survey, ClientFingerprint fingerprint) {
        this.survey = survey;
        this.fingerprint = fingerprint;
    }

    @GetMapping
    public Map<String, Object> status(@RequestParam(required = false) String visitorId) {
        return Map.of("eligible", survey.eligible(visitorId));
    }

    /**
     * 이미 받은 코드 다시 보기. 화면의 "링크 다시 확인하기"가 이걸 믿는다.
     *
     * <p>{@code visitorId}는 브라우저가 들고 있는 값이라, 그것까지 지운
     * 사람은 서버도 누군지 못 가린다 — 그 경우는 확인요청(사람이 원장
     * 대조)이 유일한 길이다.
     */
    @GetMapping("/code")
    public Map<String, Object> code(@RequestParam(required = false) String visitorId) {
        Map<String, Object> out = new LinkedHashMap<>();
        survey.issuedCode(visitorId).ifPresent(c -> out.put("code", c));
        return out;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> answer(@RequestBody Submission body,
                                                      HttpServletRequest request) {
        if (body == null || body.choice() == null
                || !SurveyService.CHOICES.contains(body.choice())) {
            return ResponseEntity.badRequest().build();
        }
        SurveyService.Answer result = survey.answer(
                body.visitorId(), body.choice(), body.text(), body.answers(),
                fingerprint.hash(request));

        // Map.of는 null 값을 못 담는다. 실패 응답에는 code가 없다.
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", result.ok());
        if (result.code() != null) out.put("code", result.code());
        if (result.reason() != null) out.put("reason", result.reason());
        return ResponseEntity.ok(out);
    }

    /**
     * 프론트가 보내는 모양.
     *
     * <p>{@code choice}는 첫 섹션, {@code answers}는 나머지 섹션이다. 문항이
     * 늘어도 서버를 안 고치게 자유 맵으로 받는다 — 대신 값은 서버가 거른다.
     */
    public record Submission(String visitorId, String choice, String text,
                             Map<String, String> answers) {
    }
}
