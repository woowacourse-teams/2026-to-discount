package com.discounttracker.web;

import com.discounttracker.comparison.BrandComparison;
import com.discounttracker.comparison.BrandComparisonService;
import com.discounttracker.offer.OfferRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class BrandController {

    private final BrandComparisonService service;
    private final OfferRepository offers;

    public BrandController(BrandComparisonService service, OfferRepository offers) {
        this.service = service;
        this.offers = offers;
    }

    @GetMapping("/brands")
    public List<BrandComparison> brands() {
        return service.compare();
    }

    /** 재배포 없이 export.json만 갈아끼웠을 때 부른다. */
    @PostMapping("/reload")
    public Map<String, Integer> reload() {
        offers.reload();
        return Map.of("reloaded", offers.findAll().size());
    }
}
