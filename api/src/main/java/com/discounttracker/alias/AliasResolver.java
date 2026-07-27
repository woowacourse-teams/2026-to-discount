package com.discounttracker.alias;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class AliasResolver {

    private final Resource aliasResource;
    private final Map<String, String> aliasToCanonical = new HashMap<>();

    public AliasResolver(@Value("classpath:brand-aliases.yml") Resource aliasResource) {
        this.aliasResource = aliasResource;
        load();
    }

    // 스프링이 생성자 주입 후 자동 로드. 테스트는 생성자에서 바로 로드된다.
    @PostConstruct
    void load() {
        aliasToCanonical.clear();
        if (!aliasResource.exists()) return;
        try (InputStream in = aliasResource.getInputStream()) {
            Map<String, List<String>> raw = new Yaml().load(in);
            if (raw == null) return;
            for (var entry : raw.entrySet()) {
                String canonical = entry.getKey();
                for (String alias : entry.getValue()) {
                    aliasToCanonical.put(alias, canonical);
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("brand-aliases.yml 읽기 실패", e);
        }
    }

    public String canonical(String rawBrand) {
        return aliasToCanonical.getOrDefault(rawBrand, rawBrand);
    }
}
