package com.discounttracker.push;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.nio.file.Path;

@Component
public record PushProperties(
        boolean enabled,
        String publicKey,
        String privateKey,
        String subject,
        Path statePath,
        String frontendRoot,
        String apiRoot) {

    @Autowired
    public PushProperties(
            @Value("${discount.push.enabled:false}") boolean enabled,
            @Value("${discount.push.public-key:}") String publicKey,
            @Value("${discount.push.private-key:}") String privateKey,
            @Value("${discount.push.subject:mailto:admin@bebeggars.duckdns.org}") String subject,
            @Value("${discount.push.state-path:}") String statePath,
            @Value("${discount.push.frontend-root:https://beggars-five.vercel.app/}") String frontendRoot,
            @Value("${discount.push.api-root:https://bebeggars.duckdns.org}") String apiRoot) {
        this(enabled, publicKey, privateKey, subject,
                statePath == null || statePath.isBlank() ? null : Path.of(statePath),
                frontendRoot, apiRoot);
    }

    public boolean configured() {
        return enabled && !blank(publicKey) && !blank(privateKey) && statePath != null;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
