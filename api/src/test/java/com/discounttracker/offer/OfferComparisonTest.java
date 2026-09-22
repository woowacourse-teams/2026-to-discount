package com.discounttracker.offer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 판정표는 docs/contracts/certainty-cases.json 한 파일이고 web/src/filters.test.js도 같은
 * 파일을 읽는다. 규칙을 두 벌 적지 않는다(ADR-016).
 */
class OfferComparisonTest {

    /** gradle은 api/를 작업 디렉터리로 돈다. 표는 저장소 뿌리의 docs/ 아래다. */
    private static final Path CASES = Path.of("..", "docs", "contracts", "certainty-cases.json");

    @Test
    void everyContractCaseHolds() throws Exception {
        JsonNode root = new ObjectMapper().readTree(CASES.toFile());
        JsonNode cases = root.get("cases");
        assertTrue(cases.size() >= 8, "판정표가 비었거나 줄었다");
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
