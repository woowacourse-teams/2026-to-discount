package com.discounttracker.push;

public record DailyOfferNotification(long scheduledEpochSecond, Target target, boolean complete) {
    public DailyOfferNotification completed() {
        return new DailyOfferNotification(scheduledEpochSecond, target, true);
    }
    public record Target(String brand, String platform, int amount, boolean firstCome, String firstSeenAt) {}
}
