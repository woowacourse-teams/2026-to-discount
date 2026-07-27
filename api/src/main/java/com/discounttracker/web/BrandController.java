package com.discounttracker.web;

import com.discounttracker.data.ExportDataLoader;
import com.discounttracker.model.BrandComparison;
import com.discounttracker.service.BrandComparisonService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class BrandController {

    private final BrandComparisonService service;
    private final ExportDataLoader loader;

    public BrandController(BrandComparisonService service, ExportDataLoader loader) {
        this.service = service;
        this.loader = loader;
    }

    @GetMapping("/brands")
    public List<BrandComparison> brands() {
        return service.compare();
    }

    @PostMapping("/reload")
    public Map<String, Integer> reload() {
        loader.reload();
        return Map.of("reloaded", loader.records().size());
    }
}
