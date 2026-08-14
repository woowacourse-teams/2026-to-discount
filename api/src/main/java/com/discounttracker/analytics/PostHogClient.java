package com.discounttracker.analytics;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

/** PostHog batch ingestion API의 HTTP adapter. */
@Component
public class PostHogClient {

    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(15);

    private final PostHogProperties properties;
    private final ObjectMapper mapper;
    private final HttpClient httpClient;

    public PostHogClient(PostHogProperties properties, ObjectMapper mapper,
                         @Qualifier("postHogHttpClient") HttpClient httpClient) {
        this.properties = properties;
        this.mapper = mapper;
        this.httpClient = httpClient;
    }

    public Result sendBatch(List<PostHogEvent> events) {
        if (events.isEmpty()) return Result.succeeded();

        HttpRequest request;
        try {
            byte[] body = mapper.writeValueAsBytes(new BatchRequest(properties.projectToken(), events));
            request = HttpRequest.newBuilder(batchUri(properties.host()))
                    .timeout(REQUEST_TIMEOUT)
                    .header("Content-Type", "application/json")
                    .header("User-Agent", "discount-api-posthog-forwarder/1.0")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();
        } catch (JsonProcessingException ex) {
            return Result.failed("payload serialization failed");
        }

        try {
            HttpResponse<Void> response = httpClient.send(
                    request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return Result.succeeded();
            }
            return Result.failed("HTTP " + response.statusCode());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return Result.failed("request interrupted");
        } catch (IOException ex) {
            return Result.failed("network failure: " + ex.getClass().getSimpleName());
        }
    }

    private static URI batchUri(URI host) {
        String base = host.toString();
        if (!base.endsWith("/")) base += "/";
        return URI.create(base + "batch/");
    }

    private record BatchRequest(String api_key, List<PostHogEvent> batch) {
    }

    public record Result(boolean success, String error) {
        static Result succeeded() {
            return new Result(true, null);
        }

        static Result failed(String error) {
            return new Result(false, error);
        }
    }
}
