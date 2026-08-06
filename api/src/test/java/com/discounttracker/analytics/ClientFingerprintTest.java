package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ClientFingerprintTest {

    private final ClientFingerprint fp = new ClientFingerprint();

    @Test
    void sameIpSameDayGivesSameHash() {
        assertEquals(fp.hash("1.2.3.4", "2026-07-29"), fp.hash("1.2.3.4", "2026-07-29"));
    }

    @Test
    void differentIpGivesDifferentHash() {
        assertNotEquals(fp.hash("1.2.3.4", "2026-07-29"), fp.hash("1.2.3.5", "2026-07-29"));
    }

    @Test
    void sameIpDifferentDayGivesDifferentHash() {
        // 날짜가 바뀌면 연결이 끊겨야 한다 — 하루 넘는 추적을 막는 장치다.
        assertNotEquals(fp.hash("1.2.3.4", "2026-07-29"), fp.hash("1.2.3.4", "2026-07-30"));
    }

    @Test
    void hashDoesNotContainTheIp() {
        assertFalse(fp.hash("1.2.3.4", "2026-07-29").contains("1.2.3.4"));
    }

    @Test
    void newInstanceHasNewSaltSoHashesDoNotCarryOver() {
        // 재시작하면 과거 로그와 연결이 끊긴다.
        assertNotEquals(fp.hash("1.2.3.4", "2026-07-29"),
                new ClientFingerprint().hash("1.2.3.4", "2026-07-29"));
    }
}
