package com.discounttracker.web;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "management.server.port=0")
@Import(JsonCompressionIntegrationTest.Probes.class)
class JsonCompressionIntegrationTest {
    @LocalServerPort int port;
    private final HttpClient client = HttpClient.newHttpClient();
    private static final String LARGE_JSON = "{\"name\":\"할인 비교\",\"offers\":[" +
            "{\"platform\":\"baemin\",\"amount\":7000},".repeat(200) + "null]}";

    private HttpResponse<byte[]> request(String encoding, String path) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header("Accept-Encoding", encoding).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    @Test
    void gzipPreservesUnicodeJsonAndReducesTransferredBytes() throws Exception {
        var response = request("gzip", "/compression-test/large");
        assertEquals(200, response.statusCode());
        assertEquals("gzip", response.headers().firstValue("Content-Encoding").orElse(""));
        try (var gzip = new GZIPInputStream(new ByteArrayInputStream(response.body()))) {
            assertEquals(LARGE_JSON, new String(gzip.readAllBytes(), StandardCharsets.UTF_8));
        }
        assertTrue(response.body().length < LARGE_JSON.getBytes(StandardCharsets.UTF_8).length);
        assertTrue(response.headers().allValues("Vary").stream().anyMatch(v -> v.toLowerCase().contains("accept-encoding")));
    }

    @Test
    void unsupportedEncodingStillReceivesUncompressedJson() throws Exception {
        var response = request("identity", "/compression-test/large");
        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Content-Encoding").isEmpty());
        assertEquals(LARGE_JSON, new String(response.body(), StandardCharsets.UTF_8));
    }

    @Test
    void knownSmallResponseAvoidsGzipOverhead() throws Exception {
        var response = request("gzip", "/compression-test/small");
        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Content-Encoding").isEmpty());
        assertEquals("[]", new String(response.body(), StandardCharsets.UTF_8));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Probes {
        @Bean ProbeController compressionController() { return new ProbeController(); }
    }

    @RestController
    static class ProbeController {
        @GetMapping("/compression-test/large")
        ResponseEntity<String> large() { return json(LARGE_JSON); }
        @GetMapping("/compression-test/small")
        ResponseEntity<String> small() { return json("[]"); }
        private ResponseEntity<String> json(String text) {
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                    .contentLength(text.getBytes(StandardCharsets.UTF_8).length).body(text);
        }
    }
}
