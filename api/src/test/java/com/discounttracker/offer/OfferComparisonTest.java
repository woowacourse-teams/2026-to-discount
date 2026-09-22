package com.discounttracker.offer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 판정표는 docs/contracts/certainty-cases.json 한 파일이고 web/src/filters.test.js도 같은
 * 파일을 읽는다. 규칙을 두 벌 적지 않는다(ADR-016).
 */
class OfferComparisonTest {

    /** gradle은 api/를 작업 디렉터리로 돈다. 표는 저장소 뿌리의 docs/ 아래다. */
    private static final Path CASES = Path.of("..", "docs", "contracts", "certainty-cases.json");

    /**
     * 판정표가 certainty x kind x soldOut 조합을 하나도 빠짐없이 담고 있나.
     *
     * <p>행 개수만 세면(예: {@code >= 8}) 22개 조합이 빠진 채로도 통과한다 - 실제로
     * 그런 일이 있었다. 열거형에서 기대 조합을 직접 뽑아 실제 행과 집합으로
     * 견준다 - 열거형이 늘어나도 이 테스트가 스스로 따라온다.
     */
    @Test
    void tableCoversEveryCertaintyKindSoldOutCombination() throws Exception {
        JsonNode root = new ObjectMapper().readTree(CASES.toFile());
        JsonNode cases = root.get("cases");

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
        JsonNode root = new ObjectMapper().readTree(CASES.toFile());
        JsonNode cases = root.get("cases");
        for (JsonNode c : cases) {
            Certainty certainty = Certainty.valueOf(toEnumName(c.get("certainty").asText()));
            AmountKind kind = AmountKind.from(c.get("kind").asText());
            boolean soldOut = c.get("soldOut").asBoolean();
            Integer amount = c.get("amount").isNull() ? null : c.get("amount").asInt();
            String where = c.toString();

            assertEquals(c.get("best").asBoolean(),
                    OfferComparison.isBestCandidate(certainty, kind, soldOut), where);
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
