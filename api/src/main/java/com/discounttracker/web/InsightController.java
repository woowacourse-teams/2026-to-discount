package com.discounttracker.web;

import com.discounttracker.insight.InsightService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 할인 인포그래픽(/insight) 공개 집계. /api/brands 응답에 얹지 않는다(#403). */
@RestController
@RequestMapping("/api")
public class InsightController {

    private final InsightService service;

    public InsightController(InsightService service) {
        this.service = service;
    }

    @GetMapping("/insight")
    public Map<String, Object> insight() {
        return service.insight();
    }
}
