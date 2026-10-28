package com.discounttracker.sharing;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

/** 한 서버의 영구 append 원장. 외부 URL 대신 검증한 혜택 식별 정보만 저장한다. */
@Service
public class ShareLinkStore {
    public record Target(String shareId, String brand, String offerKey) {
        public boolean valid() {
            return shareId != null && shareId.matches("[a-f0-9]{32}")
                    && brand != null && !brand.isBlank() && brand.length() <= 120
                    && brand.chars().noneMatch(Character::isISOControl)
                    && offerKey != null && offerKey.matches("v1_[a-f0-9]{64}");
        }
    }
    public record Entry(String code, Target target) {}
    private final Path path;
    private final ObjectMapper mapper;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Target> entries = new HashMap<>();
    private final Map<Target, String> codes = new HashMap<>();

    public ShareLinkStore(ObjectMapper mapper, @Value("${discount.share-links-path:}") String configured,
                          @Value("${discount.event-log-path:data/events.jsonl}") String events) throws IOException {
        this.mapper = mapper;
        path = configured.isBlank() ? Path.of(events).toAbsolutePath().resolveSibling("share-links.jsonl") : Path.of(configured).toAbsolutePath();
        if (Files.exists(path)) {
            try (var lines = Files.lines(path)) {
                lines.filter(s -> !s.isBlank()).forEach(line -> {
                    Entry entry = mapper.readValue(line, Entry.class);
                    if (entry.code() == null || !entry.code().matches("[A-Za-z0-9_-]{16}") || entry.target() == null || !entry.target().valid()) {
                        throw new IllegalStateException("Invalid share link record");
                    }
                    entries.put(entry.code(), entry.target());
                    codes.put(entry.target(), entry.code());
                });
            }
        }
    }
    public synchronized String create(Target target) throws IOException {
        if (!target.valid()) throw new IllegalArgumentException("Invalid share target");
        if (codes.containsKey(target)) return codes.get(target);
        byte[] bytes = new byte[12];
        String code;
        do { random.nextBytes(bytes); code = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); } while (entries.containsKey(code));
        Files.createDirectories(path.getParent());
        Files.writeString(path, mapper.writeValueAsString(new Entry(code, target)) + "\n", StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        entries.put(code, target);
        codes.put(target, code);
        return code;
    }
    public synchronized Target find(String code) { return entries.get(code); }
}
