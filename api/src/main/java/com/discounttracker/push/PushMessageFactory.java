package com.discounttracker.push;

import com.discounttracker.banner.Banner;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class PushMessageFactory {
    private final ObjectMapper mapper;

    public PushMessageFactory(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public String payload(List<Banner> banners, String displayedUrl, String clickUrl,
                          String notificationId, String deliveryType) {
        Banner first = banners.get(0);
        String brand = first.brand() == null ? "배달 할인" : first.brand();
        String title = banners.size() == 1
                ? "오늘의 새로운 배달 쿠폰 소식" : "오늘의 새로운 할인 소식";
        String body = banners.size() == 1
                ? brand + " 할인을 확인해 보세요."
                : brand + " 외 " + (banners.size() - 1) + "개의 새로운 할인이 있어요.";
        try {
            return mapper.writeValueAsString(Map.of(
                    "title", title,
                    "body", body,
                    "url", clickUrl,
                    "displayedUrl", displayedUrl,
                    "notificationId", notificationId,
                    "deliveryType", deliveryType,
                    "bannerCount", banners.size(),
                    "bannerIds", banners.stream().map(Banner::id).toList()));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Push payload 생성 실패", e);
        }
    }
}
