package com.discounttracker.testdata;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 검수용 더미 데이터가 "정답지대로" 들어 있는지 본다.
 *
 * <p>정답지(faults)와 실제 데이터가 어긋나면 검수 결과를 채점할 수 없다 —
 * 실제로 링크 크랙 대상 브랜드를 손으로 적다가 한 건 어긋났고(생성 로그의
 * 한글이 콘솔에서 깨져 다른 브랜드로 읽었다), 응답에는 표식 없는 브랜드의
 * 링크가 깨져 나갔다. 그 종류의 실수를 여기서 잡는다.
 */
class TestDataCatalogTest {

    private TestDataCatalog catalog;

    @BeforeEach
    void setUp() {
        catalog = new TestDataCatalog();
        catalog.load();
    }

    @Test
    @DisplayName("앱별 10건씩 40건이다")
    void hasFortyRecordsEvenlySplit() {
        assertThat(catalog.records()).hasSize(40);

        Map<String, Long> byPlatform = catalog.records().stream()
                .collect(Collectors.groupingBy(r -> r.platform(), Collectors.counting()));
        assertThat(byPlatform).containsOnlyKeys("baemin", "coupangeats", "ddangyo", "yogiyo");
        assertThat(byPlatform.values()).allMatch(count -> count == 10);
    }

    @Test
    @DisplayName("오류가 25%다")
    void hasQuarterFaulty() {
        assertThat(catalog.faults()).hasSize(10);
    }

    @Test
    @DisplayName("링크 크랙 표식이 붙은 브랜드와 실제로 링크를 깨뜨리는 브랜드가 같다")
    void crackedBrandsMatchTheAnswerSheet() {
        Set<String> marked = catalog.faults().stream()
                .filter(f -> f.kind().equals("LINK_CRACK"))
                .map(TestDataCatalog.Fault::brand)
                .collect(Collectors.toSet());

        // 표식이 붙은 브랜드는 전부 깨진 링크를 받아야 한다.
        assertThat(marked).isNotEmpty();
        assertThat(marked).allSatisfy(brand ->
                assertThat(catalog.crackedLink(brand))
                        .as("%s에 씌울 깨진 링크", brand)
                        .isNotNull());
    }

    @Test
    @DisplayName("정답지의 브랜드는 전부 실제 데이터에 있다")
    void faultBrandsExistInRecords() {
        List<String> brands = catalog.records().stream().map(r -> r.brand()).toList();
        assertThat(catalog.faults()).allSatisfy(f ->
                assertThat(brands).contains(f.brand()));
    }
}
