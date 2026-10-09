package com.discounttracker.history;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

/** tracker가 만든 history.json을 들고 있는다. 못 읽으면 빈 이력 — 판정은 모름이 되고 푸시는 안 나간다. */
@Component
public class HistoryRepository {

    private static final Logger log = LoggerFactory.getLogger(HistoryRepository.class);
    private final Resource source;
    private final ObjectMapper mapper = new ObjectMapper();
    private volatile OfferHistory current = OfferHistory.empty();

    public HistoryRepository(@Value("${discount.history-path}") Resource source) {
        this.source = source;
        reload();
    }

    /** 테스트용: 이력을 바로 넣는다. */
    public static HistoryRepository of(OfferHistory h) {
        HistoryRepository r = new HistoryRepository(new ByteArrayResource(
                "{\"days\":[],\"coverage\":[]}".getBytes(StandardCharsets.UTF_8)));
        r.current = h;
        return r;
    }

    public OfferHistory current() { return current; }

    public boolean reload() {
        if (!source.exists()) {
            log.warn("history.json이 없다 — 신규 판정은 모름으로 둔다. source={}", source);
            current = OfferHistory.empty();
            return false;
        }
        try (InputStream in = source.getInputStream()) {
            JsonNode root = mapper.readTree(in);
            List<BrandDay> days = new ArrayList<>();
            for (JsonNode n : root.path("days")) {
                days.add(new BrandDay(LocalDate.parse(n.get("date").asText()), n.get("platform").asText(),
                        n.get("brand").asText(), DayState.of(n.path("state").asText(null)),
                        WithheldReason.of(n.path("reason").asText(null)),
                        n.hasNonNull("max") ? n.get("max").asInt() : null));
            }
            Map<LocalDate, Set<String>> coverage = new TreeMap<>();
            for (JsonNode n : root.path("coverage")) {
                Set<String> ps = new HashSet<>();
                n.path("platforms").forEach(p -> ps.add(p.asText()));
                coverage.put(LocalDate.parse(n.get("date").asText()), ps);
            }
            current = new OfferHistory(days, coverage);
            log.info("history.json 로드 — {}줄, {}일", days.size(), coverage.size());
            return true;
        } catch (Exception e) {
            log.warn("history.json 읽기 실패 — 신규 판정은 모름으로 둔다. source={}", source, e);
            current = OfferHistory.empty();
            return false;
        }
    }
}
