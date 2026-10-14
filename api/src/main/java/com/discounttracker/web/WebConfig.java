package com.discounttracker.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.core.Ordered;
import jakarta.servlet.DispatcherType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final String developmentOrigin;

    public WebConfig(@Value("${discount.cors.development-origin:}") String developmentOrigin) {
        this.developmentOrigin = developmentOrigin;
    }

    @Bean
    public FilterRegistrationBean<RequestIdFilter> requestIdFilter() {
        var registration = new FilterRegistrationBean<>(new RequestIdFilter());
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        registration.setDispatcherTypes(DispatcherType.REQUEST, DispatcherType.ASYNC, DispatcherType.ERROR);
        registration.setAsyncSupported(true);
        return registration;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // 운영 콘솔 PUT은 Origin을 보낸다. Nginx 내부 프록시를 거치면
        // CORS 검사가 필요하므로 관리 경로에만 운영 출처와 저장 메서드를 허용한다.
        registry.addMapping("/api/push/admin/**")
                .allowedOrigins("https://bebeggars.duckdns.org")
                .allowedMethods("GET", "PUT")
                .exposedHeaders(RequestIdFilter.HEADER);

        // 기본 allowedMethods는 GET/HEAD/POST라 /api/events(POST)도 포함되지만,
        // 무엇을 허용하는지 눈에 보이게 적어 둔다.
        // 192.168.*, 10.* — `npm run dev -- --host`로 LAN에 연 dev 서버를
        // 휴대폰 등 다른 기기에서 열 때 필요(가정용 공유기 대역이 거의
        // 192.168.x.x, 사무실/큰 네트워크는 10.x.x.x인 경우가 많다).
        // beggars-git-*-nn98s-projects — 실제 Vercel 프로젝트 슬러그는
        // "beggars"(운영 별칭이 beggars-five)라, git 브랜치 프리뷰 주소는
        // beggars-git-<브랜치>-nn98s-projects.vercel.app 형태로 나온다.
        var mapping = registry.addMapping("/api/**")
                .allowedOriginPatterns(
                        "http://localhost:5173",
                        "http://192.168.*:5173",
                        "http://10.*:5173",
                        "https://beggars-five.vercel.app",
                        "https://beggars-five-*.vercel.app",
                        "https://beggars-git-*-nn98s-projects.vercel.app",
                        // 배포 고유 주소(beggars-<해시>-nn98s-projects). 프리뷰를 이
                        // 주소로 열면 브랜치 별칭과 달리 막혔다(2026-09-16 실측:
                        // preflight 403 "Invalid CORS request").
                        "https://beggars-*-nn98s-projects.vercel.app")
                .allowedMethods("GET", "POST", "DELETE")
                .exposedHeaders(RequestIdFilter.HEADER);
        // 개발 서버에만 환경변수를 지정한다. 운영의 기존 출처 목록은 유지한다.
        if (!developmentOrigin.isBlank()) mapping.allowedOrigins(developmentOrigin);
    }
}
