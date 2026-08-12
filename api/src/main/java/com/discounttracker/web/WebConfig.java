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
        // 192.168.*, 10.* — `npm run dev -- --host`로 LAN에 연 dev 서버를
        // 휴대폰 등 다른 기기에서 열 때 필요(가정용 공유기 대역이 거의
        // 192.168.x.x, 사무실/큰 네트워크는 10.x.x.x인 경우가 많다).
        registry.addMapping("/api/**")
                .allowedOriginPatterns(
                        "http://localhost:5173",
                        "http://192.168.*:5173",
                        "http://10.*:5173",
                        "https://beggars-five.vercel.app",
                        "https://beggars-five-*.vercel.app",
                        "https://delivery-discount-web-*.vercel.app")
                .allowedMethods("GET", "POST");
    }
}
