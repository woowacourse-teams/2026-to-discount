package com.discounttracker.push;

import com.discounttracker.banner.Banner;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 배너 웹 푸시 문구.
 *
 * <p>감사 R3(2026-09-29)는 "같은 배너를 푸시와 슬랙이 두 문구로 말한다"고 적었다. 확인해 보니
 * 같은 것을 말하지 않는다. 푸시는 사용자에게 가고 브랜드 이름만 싣는다(금액, 기간 없음 - 누르면
 * 웹의 {@code BannerText} 문구를 본다). 슬랙(tracker banner_routine.notify_slack, 문장은
 * banner_ops.describe)은 운영 채널에 가고 **아직 반영 안 된 제안 op**(올리기, 고치기, 내리기)를
 * 말한다. 제안은 서버에 없으니 API 응답을 인용할 수 없다. 그래서 문구를 하나로 모으지 않는다.
 * 사용자에게 가는 배너 문구는 여기와 {@code BannerText} 둘뿐이고 겹치지 않는다.
 */
@Component
public class PushMessageFactory {
    private final ObjectMapper mapper;

    public PushMessageFactory(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public String offerPayload(DailyOfferNotification.Target offer, String displayedUrl,
                               String clickUrl, String notificationId) {
        String benefit = String.format(java.util.Locale.KOREA, "%,d원 %s할인", offer.amount(),
                offer.firstCome() ? "선착순 " : "");
        try {
            return mapper.writeValueAsString(Map.of(
                    "title", offer.brand() + " " + benefit,
                    "body", "할인 시간과 적용 조건을 확인해 보세요.",
                    "url", clickUrl, "displayedUrl", displayedUrl,
                    "notificationId", notificationId, "deliveryType", "new_offer",
                    "offerCount", 1));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Push payload 생성 실패", e);
        }
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
