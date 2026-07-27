package com.discounttracker.model;

public record Offer(String platform, Integer amount, String qualifier,
                    String status, String rawText, String screenshotPath) {}
