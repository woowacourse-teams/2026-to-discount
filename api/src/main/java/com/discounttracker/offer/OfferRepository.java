package com.discounttracker.offer;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(OfferRepository.class);

    private final Resource source;
    // 트래커(별도 레포, 별도 self-hosted 배포)가 export.json에 새 필드를
    // 얹어 먼저 push되면, 이 API가 그 필드를 아직 모르는 채로 reload가
    // 불려도 되게 unknown property를 무시한다 — 기본값(엄격 모드)이면
    // UnrecognizedPropertyException으로 reload 전체가 500 나서 트래커
    // 배포 워크플로가 실패했다(channel/badge/soldOut 필드 추가 때 세 번
    // 재현, 2026-08-01~08-03). 새 필드값은 API가 따라잡을 때까지 그냥
    // 비어 보이는 정도의 대가라 감수할 만하다.
    private final ObjectMapper mapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private volatile List<OfferRecord> cache = List.of();

    public OfferRepository(@Value("${discount.export-path}") Resource source) {
        this.source = source;
    }

    public void reload() {
        if (!source.exists()) {
            // 조용히 비우면 화면이 텅 빈 채로 아무 신호가 없다 — 경로를
            // 잘못 잡았을 때 이걸 못 알아채고 데이터 문제로 오해한다.
            log.warn("export.json이 없다 — 빈 목록으로 시작한다. source={}", source);
            cache = List.of();
            return;
        }
        try (InputStream in = source.getInputStream()) {
            cache = List.of(mapper.readValue(in, OfferRecord[].class));
            log.info("export.json 로드 완료 — {}건, source={}", cache.size(), source);
        } catch (IOException e) {
            // 여기서 로그를 남기지 않으면 무엇이 왜 깨졌는지가 사라진다.
            // 실측: 사람이 편집한 export.json에 "soldOut": null이 들어와
            // reload 전체가 깨졌는데(2026-08-04) 화면이 안 나와서야 알았다.
            log.error("export.json 읽기 실패 — source={}", source, e);
            throw new IllegalStateException("export.json 읽기 실패", e);
        }
    }

    public List<OfferRecord> findAll() {
        return cache;
    }
}
