package com.discounttracker.model;

import java.util.List;

public record BrandComparison(String name, Integer maxConfirmedAmount,
                              List<Offer> offers) {}
