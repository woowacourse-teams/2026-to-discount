package com.discounttracker.storage;

import com.discounttracker.analytics.GifticonStore;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class GifticonStoreMultiProcessTest {
    @TempDir Path temp;

    @Test
    void fourProcessesIssueFortyDistinctCodes() throws Exception {
        Path yml = temp.resolve("gifticons.yml");
        Files.writeString(yml, "gifticons:\n" + IntStream.range(0, 40)
                .mapToObj(i -> "- code: CODE" + i + "\n").collect(Collectors.joining()));

        MultiProcess.run("gifticon", yml, temp, 4, 10);

        assertThat(new GifticonStore(yml.toString()).remaining()).isZero();
        List<String> lines = Files.readAllLines(temp.resolve("gifticon-issues.jsonl"));
        assertThat(lines).hasSize(40);
        List<String> codes = lines.stream()
                .map(l -> l.replaceAll(".*\"code\":\"([^\"]+)\".*", "$1")).toList();
        assertThat(codes).doesNotHaveDuplicates();
    }
}
