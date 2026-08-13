package com.discounttracker.testdata;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.discounttracker.offer.OfferRecord;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * API 검수용 더미 데이터. 운영 원장과 완전히 분리된 별도 파일이다.
 *
 * <p>원본 export.json에서 앱별 10건씩 40건을 뽑고, 그중 10건(25%)에 검수에서
 * 잡혀야 하는 오류를 일부러 심어뒀다. 생성 결과를 그대로 커밋한 것이라 몇
 * 번을 불러도 같은 값이 나온다 — 검수 기준이 매번 흔들리면 검수가 아니다.
 *
 * <p>어떤 오류를 심었는지는 파일의 {@code testFault} 키에 적혀 있다. 이 키는
 * 도메인 레코드({@link OfferRecord})에 넣지 않는다 — 운영 데이터엔 존재하지
 * 않는 개념이라, 도메인을 검수용 필드로 오염시키는 대신 여기서 JSON을 한 번
 * 더 훑어 따로 읽는다.
 *
 * <p>jar 안 리소스로만 읽는다. 운영 원장처럼 바깥 경로를 열어두면 검수용
 * 데이터가 배포 환경마다 달라진다.
 */
@Component
public class TestDataCatalog {

    private static final Logger log = LoggerFactory.getLogger(TestDataCatalog.class);

    /** 링크가 깨진 것으로 취급할 브랜드 — 응답의 links를 잘못된 주소로 덮는다. */
    private static final Map<String, String> CRACKED_LINKS = Map.of(
            "처갓집양념치킨", "https://s.baemin.com/INVALID_LINK",
            "또래오래", "coupangeats://brand/?id=BROKEN",
            "부어치킨", "https://fdofd.ddangyo.com/gateway4.html?BROKEN00");

    private final ObjectMapper mapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private volatile List<OfferRecord> records = List.of();
    private volatile List<Fault> faults = List.of();

    /** 심어둔 오류 한 건. */
    public record Fault(String platform, String brand, String kind) {}

    @PostConstruct
    void load() {
        ClassPathResource source = new ClassPathResource("test-export.json");
        if (!source.exists()) {
            log.warn("test-export.json이 없다 — /api/test는 빈 목록을 준다.");
            return;
        }
        try (InputStream in = source.getInputStream()) {
            JsonNode root = mapper.readTree(in);
            records = List.of(mapper.treeToValue(root, OfferRecord[].class));

            List<Fault> found = new ArrayList<>();
            for (JsonNode node : root) {
                JsonNode kind = node.get("testFault");
                if (kind != null && !kind.isNull()) {
                    found.add(new Fault(
                            node.path("platform").asText(),
                            node.path("brand").asText(),
                            kind.asText()));
                }
            }
            faults = List.copyOf(found);
            log.info("검수용 더미 데이터 로드 — {}건(오류 {}건)", records.size(), faults.size());
        } catch (IOException e) {
            // 운영 원장과 달리 예외를 던지지 않는다 — 검수용 데이터가 깨졌다고
            // 앱 기동 자체가 막히면 손해가 더 크다.
            log.error("test-export.json 읽기 실패", e);
        }
    }

    public List<OfferRecord> records() {
        return records;
    }

    public List<Fault> faults() {
        return faults;
    }

    /** 그 브랜드에 씌울 깨진 링크. 대상이 아니면 null. */
    public String crackedLink(String brandName) {
        return CRACKED_LINKS.get(brandName);
    }
}
