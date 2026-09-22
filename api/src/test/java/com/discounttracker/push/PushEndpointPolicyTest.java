package com.discounttracker.push;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class PushEndpointPolicyTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "https://fcm.googleapis.com/fcm/send/id",
            "https://updates.push.services.mozilla.com/wpush/v2/id",
            "https://web.push.apple.com/QD/id",
            "https://wns2-am3p.notify.windows.com/w/?token=id"
    })
    void acceptsTrustedPushServices(String endpoint) {
        assertThat(PushEndpointPolicy.isAllowed(endpoint)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "http://fcm.googleapis.com/fcm/send/id",
            "https://127.0.0.1/internal",
            "https://metadata.internal/token",
            "https://fcm.googleapis.com.evil.example/push",
            "https://fcm.googleapis.com:8443/push"
    })
    void rejectsUntrustedDestinations(String endpoint) {
        assertThat(PushEndpointPolicy.isAllowed(endpoint)).isFalse();
    }
}
