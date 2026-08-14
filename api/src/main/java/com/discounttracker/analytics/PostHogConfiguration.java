package com.discounttracker.analytics;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Configuration
@EnableScheduling
public class PostHogConfiguration {

    @Bean("postHogHttpClient")
    HttpClient postHogHttpClient() {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    @Bean(name = "postHogExecutor", destroyMethod = "shutdown")
    ExecutorService postHogExecutor() {
        return Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "posthog-forwarder");
            thread.setDaemon(true);
            return thread;
        });
    }
}
