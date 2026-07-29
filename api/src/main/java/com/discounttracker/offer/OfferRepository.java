package com.discounttracker.offer;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/**
 * 판독 파이프라인이 내놓은 export.json을 읽어 메모리에 들고 있는다.
 *
 * <p>DB가 없다 — 데이터가 100건 남짓이고 하루 몇 번 갱신되는 게 전부라
 * 파일 하나를 통째로 읽는 걸로 충분하다. 대신 {@link #reload()}로 재시작
 * 없이 갈아끼울 수 있어야 해서, 배포 환경에서는 jar 밖의 파일 경로를
 * 가리킨다(ADR-001).
 */
@Component
public class OfferRepository {

    private final Resource source;
    private final ObjectMapper mapper = new ObjectMapper();
    private volatile List<OfferRecord> cache = List.of();

    public OfferRepository(@Value("${discount.export-path}") Resource source) {
        this.source = source;
    }

    public void reload() {
        if (!source.exists()) {
            cache = List.of();
            return;
        }
        try (InputStream in = source.getInputStream()) {
            cache = List.of(mapper.readValue(in, OfferRecord[].class));
        } catch (IOException e) {
            throw new IllegalStateException("export.json 읽기 실패", e);
        }
    }

    public List<OfferRecord> findAll() {
        return cache;
    }
}
