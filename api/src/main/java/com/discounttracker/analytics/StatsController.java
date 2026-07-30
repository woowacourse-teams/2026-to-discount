package com.discounttracker.analytics;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stats")
public class StatsController {

    private static final int MAX_DAYS = 365;

    private final TrafficStatsService stats;

    public StatsController(TrafficStatsService stats) {
        this.stats = stats;
    }

    @GetMapping("/traffic")
    public TrafficStats traffic(@RequestParam(defaultValue = "7") int days) {
        int clamped = Math.max(1, Math.min(days, MAX_DAYS));
        return stats.compute(clamped);
    }
}
