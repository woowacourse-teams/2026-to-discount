package com.discounttracker.offer;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** 앱 시작 시 export.json을 한 번 읽어 캐시를 채운다. */
@Component
public class OfferStartupLoader implements ApplicationRunner {

    private final OfferRepository offers;

    public OfferStartupLoader(OfferRepository offers) {
        this.offers = offers;
    }

    @Override
    public void run(ApplicationArguments args) {
        offers.reload();
    }
}
