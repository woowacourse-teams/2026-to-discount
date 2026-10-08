package com.discounttracker.push;

public record DailyOfferNotification(long scheduledEpochSecond, Target target, boolean complete,
                                     boolean overridden, boolean excluded, boolean started) {
    public DailyOfferNotification(long scheduledEpochSecond, Target target, boolean complete) {
        this(scheduledEpochSecond, target, complete, false, false, false);
    }
    public DailyOfferNotification completed() {
        return new DailyOfferNotification(scheduledEpochSecond, target, true, overridden, excluded, started);
    }
    public DailyOfferNotification begin() {
        return new DailyOfferNotification(scheduledEpochSecond, target, complete, overridden, excluded, true);
    }
    public record Target(String brand, String platform, int amount, boolean firstCome, String firstSeenAt) {}
}
