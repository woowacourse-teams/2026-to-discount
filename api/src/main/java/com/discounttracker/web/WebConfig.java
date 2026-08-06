package com.discounttracker.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // 기본 allowedMethods는 GET/HEAD/POST라 /api/events(POST)도 포함되지만,
        // 무엇을 허용하는지 눈에 보이게 적어 둔다.
        // TODO: 실제 Vercel project slug 확인 후 안 맞는 패턴 제거
        registry.addMapping("/api/**")
                .allowedOriginPatterns(
                        "http://localhost:5173",
                        "https://beggars-five.vercel.app",
                        "https://beggars-five-*.vercel.app",
                        "https://delivery-discount-web-*.vercel.app")
                .allowedMethods("GET", "POST");
    }
}
