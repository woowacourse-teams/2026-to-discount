package com.discounttracker.history;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;

/** tracker가 만든 history.json을 들고 있는다. 못 읽으면 빈 이력 — 판정은 모름이 되고 푸시는 안 나간다. */
@Component
public class HistoryRepository {

    private static final Logger log = LoggerFactory.getLogger(HistoryRepository.class);
    private final Resource source;
    private final ObjectMapper mapper = JsonMapper.builderWithJackson2Defaults().build();
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
            log.warn("history.json이 없다 — 이전 이력을 유지한다. source={}", source);
            return false;
        }
        try (InputStream in = source.getInputStream()) {
            JsonNode root = mapper.readTree(in);
            List<BrandDay> days = new ArrayList<>();
            int skipped = 0;
            for (JsonNode n : root.path("days")) {
                // 행 하나가 깨져 이력 전체를 버리면 모든 신규 판정이 모름이 되어 푸시가 멈춘다. 그 행만 건너뛴다.
                if (!n.hasNonNull("date") || !n.hasNonNull("platform") || !n.hasNonNull("brand")) {
                    skipped++;
                    continue;
                }
                try {
                    days.add(new BrandDay(LocalDate.parse(n.get("date").asString()), n.get("platform").asString(),
                            n.get("brand").asString(), DayState.of(n.path("state").asString(null)),
                            WithheldReason.of(n.path("reason").asString(null)),
                            n.hasNonNull("max") ? n.get("max").asInt() : null));
                } catch (DateTimeParseException e) {
                    skipped++;
                }
            }
            if (skipped > 0) log.warn("history.json days에서 깨진 행 {}개를 건너뛰었다", skipped);
            Map<LocalDate, Set<String>> coverage = new TreeMap<>();
            for (JsonNode n : root.path("coverage")) {
                Set<String> ps = new HashSet<>();
                n.path("platforms").forEach(p -> ps.add(p.asString()));
                coverage.put(LocalDate.parse(n.get("date").asString()), ps);
            }
            // 날짜별 앱별 한정(선착순) 오퍼 수(tracker daily_state.first_come_counts). 칸이 없는 날은 모름이다.
            Map<LocalDate, Map<String, Integer>> firstCome = new TreeMap<>();
            for (JsonNode n : root.path("firstCome")) {
                Map<String, Integer> byApp = new HashMap<>();
                n.path("platforms").properties().forEach(e -> byApp.put(e.getKey(), e.getValue().asInt()));
                firstCome.put(LocalDate.parse(n.get("date").asString()), byApp);
            }
            current = new OfferHistory(days, coverage, firstCome);
            log.info("history.json 로드 — {}줄, {}일", days.size(), coverage.size());
            return true;
        } catch (Exception e) {
            log.warn("history.json 읽기 실패 — 이전 이력을 유지한다. source={}", source, e);
            return false;
        }
    }
}
