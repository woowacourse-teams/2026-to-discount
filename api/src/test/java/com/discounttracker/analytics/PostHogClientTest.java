package com.discounttracker.analytics;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PostHogClientTest {

    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void sendsProjectTokenAndBatchPayload(@TempDir Path dir) throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        AtomicReference<String> contentType = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/batch/", exchange -> {
            contentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(),
                    StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();

        ObjectMapper mapper = new ObjectMapper();
        PostHogClient client = new PostHogClient(
                properties(dir, server.getAddress().getPort()), mapper, HttpClient.newHttpClient());
        PostHogClient.Result result = client.sendBatch(List.of(event()));

        assertTrue(result.success());
        assertEquals("application/json", contentType.get());
        Map<String, Object> body = mapper.readValue(requestBody.get(), new TypeReference<>() {});
        assertEquals("project-token", body.get("api_key"));
        List<?> batch = (List<?>) body.get("batch");
        assertEquals(1, batch.size());
        assertFalse(body.containsKey("historical_migration"));
    }

    @Test
    void returnsFailureForNonSuccessfulResponse(@TempDir Path dir) throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/batch/", exchange -> {
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        server.start();

        PostHogClient client = new PostHogClient(
                properties(dir, server.getAddress().getPort()), new ObjectMapper(),
                HttpClient.newHttpClient());
        PostHogClient.Result result = client.sendBatch(List.of(event()));

        assertFalse(result.success());
        assertEquals("HTTP 503", result.error());
    }

    private static PostHogProperties properties(Path dir, int port) {
        return new PostHogProperties(true, "project-token", "http://127.0.0.1:" + port,
                dir.toString());
    }

    private static PostHogEvent event() {
        return new PostHogEvent("brand_expand",
                Map.of("distinct_id", "visitor-1", "$insert_id", "event-1"),
                "2026-08-14T00:00:00Z");
    }
}
