package com.discounttracker.web;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
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
@AutoConfigureObservability
@Import(PerformanceMetricsIntegrationTest.Probes.class)
class PerformanceMetricsIntegrationTest {
    private final TestRestTemplate http = new TestRestTemplate();
    @LocalServerPort int apiPort;
    @LocalManagementPort int metricsPort;

    private String api(String path) { return "http://127.0.0.1:" + apiPort + path; }
    private String metrics(String path) { return "http://127.0.0.1:" + metricsPort + path; }

    @Test
    void exposesPrometheusOnlyOnSeparateManagementPort() {
        assertNotEquals(apiPort, metricsPort);
        assertEquals(HttpStatus.NOT_FOUND, http.getForEntity(api("/actuator/prometheus"), String.class).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, http.getForEntity(metrics("/actuator/env"), String.class).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, http.getForEntity(metrics("/actuator/health"), String.class).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, http.getForEntity(metrics("/api/brands"), String.class).getStatusCode());
        assertEquals(HttpStatus.OK, http.getForEntity(metrics("/actuator/prometheus"), String.class).getStatusCode());
    }

    @Test
    void recordsRequestsErrorsHistogramAndJvmResourcesWithoutIdentifiers() {
        assertEquals(HttpStatus.OK, http.getForEntity(api("/api/brands"), String.class).getStatusCode());
        assertEquals(HttpStatus.OK, http.getForEntity(api("/api/banners"), String.class).getStatusCode());
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR,
                http.getForEntity(api("/metrics-test/failure"), String.class).getStatusCode());
        for (String id : new String[]{"private-id-one", "private-id-two"}) {
            assertEquals(HttpStatus.OK, http.getForEntity(api("/metrics-test/items/" + id + "?visitorId=private-visitor"), String.class).getStatusCode());
        }
        var response = http.getForEntity(metrics("/actuator/prometheus"), String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        String scrape = response.getBody();
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
