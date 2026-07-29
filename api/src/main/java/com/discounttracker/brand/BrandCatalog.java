package com.discounttracker.brand;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * brands.yml을 읽어 브랜드 지식을 제공한다.
 *
 * <p>전에는 별칭만 API(brand-aliases.yml)에, 카테고리와 바로가기 링크는
 * 프론트 소스에 하드코딩돼 있었다. 브랜드 하나 추가하려면 두 레포 네 곳을
 * 고쳐야 했고 카테고리만 바꿔도 프론트를 다시 배포해야 했다. 이 클래스가
 * 그 지식의 단일 출처다.
 */
@Component
public class BrandCatalog {

    private final Resource source;
    private final Map<String, String> aliasToCanonical = new HashMap<>();
    private final Map<String, Brand> byName = new HashMap<>();

    public BrandCatalog(@Value("${discount.brands-path:classpath:brands.yml}") Resource source) {
        this.source = source;
        load();
    }

    @PostConstruct
    @SuppressWarnings("unchecked")
    void load() {
        aliasToCanonical.clear();
        byName.clear();
        if (!source.exists()) return;

        try (InputStream in = source.getInputStream()) {
            Map<String, Object> root = new Yaml().load(in);
            if (root == null) return;
            Map<String, Map<String, Object>> brands =
                    (Map<String, Map<String, Object>>) root.get("brands");
            if (brands == null) return;

            for (var entry : brands.entrySet()) {
                String name = entry.getKey();
                Map<String, Object> attrs = entry.getValue() == null ? Map.of() : entry.getValue();

                byName.put(name, new Brand(
                        name,
                        Category.from((String) attrs.get("category")),
                        (String) attrs.get("link")));

                // 대표명 자신도 별칭으로 넣어야 원장에 대표명 그대로 찍힌 경우도 걸린다.
                aliasToCanonical.put(name, name);
                Object aliases = attrs.get("aliases");
                if (aliases instanceof List<?> list) {
                    for (Object alias : list) {
                        aliasToCanonical.put(String.valueOf(alias), name);
                    }
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("brands.yml 읽기 실패", e);
        }
    }

    /** 원장에 찍힌 이름 -> 대표명. 모르는 이름은 그대로 돌려준다. */
    public String canonical(String rawBrand) {
        return aliasToCanonical.getOrDefault(rawBrand, rawBrand);
    }

    /** 대표명 -> 브랜드 정보. 목록에 없으면 이름만 있는 빈 브랜드. */
    public Brand find(String canonicalName) {
        return byName.getOrDefault(canonicalName, Brand.unknown(canonicalName));
    }
}
