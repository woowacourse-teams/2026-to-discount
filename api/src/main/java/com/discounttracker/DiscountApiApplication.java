package com.discounttracker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import java.time.Clock;
import java.time.ZoneId;

@SpringBootApplication
public class DiscountApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(DiscountApiApplication.class, args);
    }

    /**
     * 쿠폰 종료일을 판정할 때 쓰는 시계.
     *
     * <p>시간대를 서버 기본값에 맡기면 배포 환경에 따라 만료가 하루씩
     * 어긋난다. 원장의 종료일은 국내 앱 화면에서 읽은 값이라 기준은 항상
     * 한국 날짜다.
     *
     * <p>빈으로 빼는 이유는 테스트에서 고정 시각을 넣기 위해서다. 실제
     * 시계를 쓰면 날짜가 바뀔 때 통과하던 테스트가 깨진다.
     */
    @Bean
    public Clock clock() {
        return Clock.system(ZoneId.of("Asia/Seoul"));
    }
}
