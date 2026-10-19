package com.discounttracker.web;

import org.junit.jupiter.api.Test;
import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "management.server.port=0")
@AutoConfigureMetrics
@Import(PerformanceMetricsIntegrationTest.Probes.class)
class PerformanceMetricsIntegrationTest {
    private final java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
    @LocalServerPort int apiPort;
    @LocalManagementPort int metricsPort;

    private String api(String path) { return "http://127.0.0.1:" + apiPort + path; }
    private String metrics(String path) { return "http://127.0.0.1:" + metricsPort + path; }

    // Boot 4에서 TestRestTemplate이 별도 모듈로 갔다(4.2부터 폐기 예정). 상태와 본문만 보면 되니 JDK 클라이언트로 충분하다.
    private java.net.http.HttpResponse<String> get(String url) {
        try {
            return client.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create(url)).build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString());
        } catch (java.io.IOException | InterruptedException e) {
            throw new IllegalStateException(url, e);
        }
    }

    private int status(String url) { return get(url).statusCode(); }

    @Test
    void exposesPrometheusOnlyOnSeparateManagementPort() {
        assertNotEquals(apiPort, metricsPort);
        assertEquals(HttpStatus.NOT_FOUND.value(), status(api("/actuator/prometheus")));
        assertEquals(HttpStatus.NOT_FOUND.value(), status(metrics("/actuator/env")));
        assertEquals(HttpStatus.NOT_FOUND.value(), status(metrics("/actuator/health")));
        assertEquals(HttpStatus.NOT_FOUND.value(), status(metrics("/api/brands")));
        assertEquals(HttpStatus.OK.value(), status(metrics("/actuator/prometheus")));
    }

    @Test
    void recordsRequestsErrorsHistogramAndJvmResourcesWithoutIdentifiers() {
        assertEquals(HttpStatus.OK.value(), status(api("/api/brands")));
        assertEquals(HttpStatus.OK.value(), status(api("/api/banners")));
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR.value(),
                status(api("/metrics-test/failure")));
        for (String id : new String[]{"private-id-one", "private-id-two"}) {
            assertEquals(HttpStatus.OK.value(), status(api("/metrics-test/items/" + id + "?visitorId=private-visitor")));
        }
        var response = get(metrics("/actuator/prometheus"));
        assertEquals(HttpStatus.OK.value(), response.statusCode());
        String scrape = response.body();
        assertNotNull(scrape);
        for (String metric : new String[]{"http_server_requests_seconds_count", "http_server_requests_seconds_sum",
                "http_server_requests_seconds_bucket", "process_cpu_usage", "jvm_memory_used_bytes",
                "jvm_gc_memory_allocated_bytes_total", "jvm_threads_live_threads", "tomcat_threads_busy_threads"}) {
            assertTrue(scrape.contains(metric), metric);
        }
        assertTrue(scrape.lines().anyMatch(line -> line.startsWith("http_server_requests_seconds_count{")
                && line.contains("status=\"500\"") && line.contains("uri=\"/metrics-test/failure\"")));
        assertTrue(scrape.contains("uri=\"/metrics-test/items/{id}\""));
        assertTrue(scrape.contains("le=\"0.005\""));
        assertTrue(scrape.contains("le=\"30.0\""));
        assertFalse(scrape.contains("quantile="));
        assertFalse(scrape.contains("private-id-"));
        assertFalse(scrape.contains("private-visitor"));
        assertFalse(scrape.contains("request_id="));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Probes {
        @Bean ProbeController probeController() { return new ProbeController(); }
    }

    @RestController
    static class ProbeController {
        @GetMapping("/metrics-test/items/{id}")
        String item(@PathVariable String id) { return "ok"; }
        @GetMapping("/metrics-test/failure")
        String failure() { throw new IllegalStateException("metrics test failure"); }
    }
}
