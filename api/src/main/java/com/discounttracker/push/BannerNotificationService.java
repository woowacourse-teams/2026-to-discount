package com.discounttracker.push;

import com.discounttracker.banner.Banner;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 배너 reload 때 알림 켜짐 상태만 푸시 상태 파일에 적는다. 사용자 알림은 신규 오퍼 하루 1건
 * ({@link NewOfferNotificationService})으로 바뀌어 배너 reload는 보내지 않는다.
 */
@Service
public class BannerNotificationService {
    private final PushStateStore store;

    public BannerNotificationService(PushStateStore store) {
        this.store = store;
    }

    public ReloadResult onReload(List<Banner> current) {
        Map<String, Boolean> notify = new LinkedHashMap<>();
        Map<String, Boolean> immediate = new LinkedHashMap<>();
        current.forEach(banner -> {
            notify.put(banner.id(), banner.notificationEnabled());
            immediate.put(banner.id(), banner.immediateNotificationRequested());
        });
        List<BannerNotificationState> activated = store.observe(notify, immediate);
        long requested = activated.stream().filter(BannerNotificationState::immediateRequested).count();
        return new ReloadResult(activated.size(), (int) requested, false, 0);
    }

    public record ReloadResult(int activated, int immediateRequested,
                               boolean immediateAllowed, int immediateSent) {}
}
