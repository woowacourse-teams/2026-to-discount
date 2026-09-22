package com.discounttracker.offer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * 판정표는 docs/contracts/certainty-cases.json 한 파일이고 web/src/filters.test.js도 같은
 * 파일을 읽는다. 규칙을 두 벌 적지 않는다(ADR-016).
 */
class OfferComparisonTest {

    /** gradle은 api/를 작업 디렉터리로 돈다. 표는 저장소 뿌리의 docs/ 아래다. */
    private static final Path CASES = Path.of("..", "docs", "contracts", "certainty-cases.json");

    /**
     * 표가 없으면 이 테스트들은 실패가 아니라 건너뛴다. 배포 미러
     * nn98/delivery-discount-api는 api/ 안쪽만 복사해 가서 docs/가 통째로 없고, 거기서
     * 실패로 처리하면 무관한 테스트까지 끌고 죽어 API 배포가 멈춘다. 표를 강제하는
     * 자리는 mono 저장소의 check-api.yml이고 거기엔 이 파일이 늘 있다. 웹과 API가
     * 갈라질 수 있는 곳도 둘이 같이 사는 mono뿐이다.
     *
     * <p>건너뛰기지 조용한 통과가 아니다 - 파일이 있는데 코드와 어긋나면 그대로 실패한다.
     */
    private static JsonNode readCases() throws Exception {
        assumeTrue(Files.exists(CASES), "판정표 " + CASES.toAbsolutePath()
                + " 가 없어 건너뛴다. 배포 미러에는 docs/가 없고, 검증은 mono의 check-api.yml이 맡는다.");
        return new ObjectMapper().readTree(CASES.toFile()).get("cases");
    }

    /**
     * 판정표가 certainty x kind x soldOut 조합을 하나도 빠짐없이 담고 있나.
     *
     * <p>행 개수만 세면(예: {@code >= 8}) 22개 조합이 빠진 채로도 통과한다 - 실제로
     * 그런 일이 있었다. 열거형에서 기대 조합을 직접 뽑아 실제 행과 집합으로
     * 견준다 - 열거형이 늘어나도 이 테스트가 스스로 따라온다.
     */
    @Test
    void tableCoversEveryCertaintyKindSoldOutCombination() throws Exception {
        JsonNode cases = readCases();

        Set<String> expected = new TreeSet<>();
        for (Certainty certainty : Certainty.values()) {
            for (AmountKind kind : AmountKind.values()) {
                for (boolean soldOut : new boolean[] {false, true}) {
                    expected.add(comboKey(certainty.key(), kind.key(), soldOut));
                }
            }
        }

        Set<String> actual = new TreeSet<>();
        for (JsonNode c : cases) {
            actual.add(comboKey(c.get("certainty").asText(), c.get("kind").asText(),
                    c.get("soldOut").asBoolean()));
        }

        Set<String> missing = new TreeSet<>(expected);
        missing.removeAll(actual);
        Set<String> extra = new TreeSet<>(actual);
        extra.removeAll(expected);

        assertEquals(Set.of(), missing, "판정표에 없는 조합: " + missing);
        assertEquals(Set.of(), extra, "판정표에 있으면 안 되거나 중복 흡수로 구멍을 가리는 조합: " + extra);
    }

    private static String comboKey(String certainty, String kind, boolean soldOut) {
        return certainty + "/" + kind + "/" + soldOut;
    }

    @Test
    void everyContractCaseHolds() throws Exception {
        JsonNode cases = readCases();
        for (JsonNode c : cases) {
            Certainty certainty = Certainty.valueOf(toEnumName(c.get("certainty").asText()));
            AmountKind kind = AmountKind.from(c.get("kind").asText());
            boolean soldOut = c.get("soldOut").asBoolean();
            Integer amount = c.get("amount").isNull() ? null : c.get("amount").asInt();
            String where = c.toString();

            // 판정표는 certainty x kind x soldOut만 다룬다 - platform 축은 없다(own은
            // 2026-09-22에 따로 생겼다). 배달앱 값("baemin")으로 고정해 표의 의미를 그대로 둔다.
            assertEquals(c.get("best").asBoolean(),
                    OfferComparison.isBestCandidate(certainty, kind, soldOut, "baemin"), where);
            Integer wantSorting = c.get("sorting").isNull() ? null : c.get("sorting").asInt();
            assertEquals(wantSorting, OfferComparison.sortingAmount(certainty, amount), where);
        }
    }

    /** "menuOnly" -> MENU_ONLY. 표는 JSON 표기라 열거 상수 이름과 다르다. */
    private static String toEnumName(String key) {
        return key.replaceAll("([a-z])([A-Z])", "$1_$2").toUpperCase(Locale.ROOT);
    }

    @Test
    void menuOnlyKeepsItsBrandInTheSortingButNeverBeatsAPlainFiveThousand() {
        // 정렬에서 통째로 빼면 그 쿠폰밖에 없는 브랜드가 근거를 잃는다. 4,999원은
        // 일반 할인 5,000원을 절대 못 넘고 그보다 작은 일반 할인보다는 위에 선다.
        assertEquals(4999, OfferComparison.sortingAmount(Certainty.MENU_ONLY, 14000));
        assertEquals(4999, OfferComparison.MENU_LIMITED_SORTING_AMOUNT);
    }
}
