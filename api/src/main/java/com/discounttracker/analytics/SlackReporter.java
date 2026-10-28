package com.discounttracker.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * 제보를 슬랙 chat.postMessage로 보낸다. 토큰과 채널은 환경변수
 * {@code SLACK_REPORT_TOKEN}, {@code SLACK_REPORT_CHANNEL}(CI의 SLACK_OPS_* 관례).
 */
@Component
public class SlackReporter {

    private static final Logger log = LoggerFactory.getLogger(SlackReporter.class);
    private static final URI POST_MESSAGE = URI.create("https://slack.com/api/chat.postMessage");

    private final String token;
    private final String channel;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public SlackReporter(@Value("${discount.report.slack-token:}") String token,
                         @Value("${discount.report.slack-channel:}") String channel,
                         ObjectMapper mapper) {
        this.token = token;
        this.channel = channel;
        this.mapper = mapper;
    }

    /** 슬랙이 ok:true로 답하면 true. 설정이 없거나 실패하면 false(예외를 밖으로 안 낸다). */
    public boolean send(String text) {
        if (token.isBlank() || channel.isBlank()) return false;
        try {
            byte[] body = mapper.writeValueAsBytes(Map.of("channel", channel, "text", escape(text)));
            HttpRequest request = HttpRequest.newBuilder(POST_MESSAGE)
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/json; charset=utf-8")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();
            HttpResponse<String> res = http.send(request, HttpResponse.BodyHandlers.ofString());
            boolean ok = mapper.readTree(res.body()).path("ok").asBoolean(false);
            if (!ok) log.warn("slack report failed: status={} error={}", res.statusCode(),
                    mapper.readTree(res.body()).path("error").asString(""));
            return ok;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (java.io.IOException | RuntimeException e) { // RuntimeException이 JacksonException(ADR-012)을 담는다
            log.warn("slack report failed: {}", e.toString());
            return false;
        }
    }

    /** 사용자 글의 {@code <!channel>}, 링크 문법이 슬랙에서 동작하지 않게 한다(슬랙 문서의 세 글자 이스케이프). */
    static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
