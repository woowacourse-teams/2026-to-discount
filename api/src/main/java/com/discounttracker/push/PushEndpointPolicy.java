package com.discounttracker.push;

import java.net.URI;
import java.util.Set;

public final class PushEndpointPolicy {
    private static final Set<String> TRUSTED_HOSTS = Set.of(
            "fcm.googleapis.com",
            "updates.push.services.mozilla.com",
            "web.push.apple.com",
            "android.googleapis.com",
            "notify.windows.com");

    private PushEndpointPolicy() {}

    public static boolean isAllowed(String endpoint) {
        if (endpoint == null || endpoint.isBlank()) return false;
        try {
            URI uri = URI.create(endpoint);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null
                    || uri.getHost() == null || (uri.getPort() != -1 && uri.getPort() != 443)) {
                return false;
            }
            String host = uri.getHost().toLowerCase();
            return TRUSTED_HOSTS.stream().anyMatch(trusted ->
                    host.equals(trusted) || host.endsWith("." + trusted));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
